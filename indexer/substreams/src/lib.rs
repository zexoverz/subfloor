//! Counts fills the floor turned away.
//!
//! This module exists because a refusal cannot be expressed as an event. `SettledBelowFloor` is a
//! revert, and reverted transactions produce no logs at all — nothing log-driven can see one. The
//! Firehose block model carries every transaction with its status and its full call tree, which is
//! the only place these numbers exist.
//!
//! That is also why the Substreams layer is load-bearing rather than decorative: the headline
//! number on the dashboard is a thing a subgraph provably cannot produce.

mod pb;

use pb::subfloor::v1::{Refusal, Refusals};
use substreams::errors::Error;
use substreams::Hex;
use substreams_ethereum::pb::eth::v2 as eth;

/// `SettledBelowFloor(address,address,address,uint256,uint256)`, first four bytes of the keccak.
/// Computed with `cast keccak`, not copied.
const SETTLED_BELOW_FLOOR: [u8; 4] = [0x02, 0x7e, 0x4c, 0x46];

/// The revert payload is the 4-byte selector followed by five 32-byte words.
const REVERT_LEN: usize = 4 + 32 * 5;

#[substreams::handlers::map]
fn map_refusals(blk: eth::Block) -> Result<Refusals, Error> {
    let timestamp = blk
        .header
        .as_ref()
        .and_then(|h| h.timestamp.as_ref())
        .map(|t| t.seconds as u64)
        .unwrap_or_default();

    let mut refusals = Vec::new();

    for trx in blk.transaction_traces.iter() {
        // Only failed transactions can hold a refusal. A successful one settled.
        if trx.status == eth::TransactionTraceStatus::Succeeded as i32 {
            continue;
        }

        // Walk the call tree rather than only the top-level call: the revert can come from a
        // nested call, and taking only the outermost frame loses refusals inside aggregators.
        for call in trx.calls.iter() {
            let Some(refusal) = decode(&call.return_data) else {
                continue;
            };

            refusals.push(Refusal {
                tx_hash: format!("0x{}", Hex(&trx.hash)),
                block_number: blk.number,
                timestamp,
                router: format!("0x{}", Hex(&call.address)),
                ..refusal
            });
            break; // one refusal per transaction; the first reverting frame is the one that decided
        }
    }

    Ok(Refusals { refusals })
}

/// Decodes `SettledBelowFloor(recipient, tokenIn, tokenOut, executionRate, floorRate)`.
///
/// Returns `None` for anything else, which is most reverts — a transaction can fail for a hundred
/// ordinary reasons and none of those are refusals. Counting them would inflate the one number on
/// the dashboard that has to be exact.
fn decode(data: &[u8]) -> Option<Refusal> {
    if data.len() < REVERT_LEN || data[0..4] != SETTLED_BELOW_FLOOR {
        return None;
    }

    let word = |i: usize| -> &[u8] { &data[4 + i * 32..4 + (i + 1) * 32] };
    // Addresses are right-aligned in their word.
    let addr = |i: usize| -> String { format!("0x{}", Hex(&word(i)[12..32])) };

    Some(Refusal {
        recipient: addr(0),
        token_in: addr(1),
        token_out: addr(2),
        execution_rate: u256_to_decimal(word(3)),
        floor_rate: u256_to_decimal(word(4)),
        ..Default::default()
    })
}

/// A uint256 as a decimal string. These are rates scaled by 1e18 and routinely exceed u128, so they
/// cannot be narrowed without silently corrupting the exact number the dashboard reports.
fn u256_to_decimal(word: &[u8]) -> String {
    substreams::scalar::BigInt::from_unsigned_bytes_be(word).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Real `SettledBelowFloor` revert data, encoded against the contract's own error ABI with
    /// viem. A taker selling WETH for USDC at 2,391.6 against a floor of 2,445.40 — byte-identical
    /// to what Base returns, which is the point of testing against it rather than a hand-built
    /// buffer.
    const REVERT: &str = "027e4c46\
0000000000000000000000001111113ccf1426a8e30e2bff5e005d929bf6a90a\
0000000000000000000000004200000000000000000000000000000000000006\
000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913\
000000000000000000000000000000000000000000000000000000008e8ceb80\
0000000000000000000000000000000000000000000000000000000091c1d7c0";

    #[test]
    fn decodes_a_real_revert() {
        let data = hex::decode(REVERT).unwrap();
        let r = decode(&data).expect("should decode");

        assert_eq!(r.recipient, "0x1111113ccf1426a8e30e2bff5e005d929bf6a90a");
        assert_eq!(r.token_in, "0x4200000000000000000000000000000000000006");
        assert_eq!(r.token_out, "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
        assert_eq!(r.execution_rate, "2391600000");
        assert_eq!(r.floor_rate, "2445400000");
        // The floor held: what would have settled is below what was signed for.
        assert!(r.execution_rate.parse::<u128>().unwrap() < r.floor_rate.parse::<u128>().unwrap());
    }

    /// Most reverts are ordinary failures. Counting them would inflate the one number on the
    /// dashboard that has to be exact.
    #[test]
    fn ignores_other_reverts() {
        // Error(string) — the everyday revert.
        let other = hex::decode("08c379a0".to_owned() + &"00".repeat(160)).unwrap();
        assert!(decode(&other).is_none());

        // Right selector, truncated payload. Must not decode a partial refusal.
        let short = hex::decode("027e4c46".to_owned() + &"00".repeat(64)).unwrap();
        assert!(decode(&short).is_none());

        assert!(decode(&[]).is_none());
    }
}
