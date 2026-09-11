import type { Address, Hex } from "viem";
import { CHAIN, HYPERSYNC } from "./chain.ts";
import { REVERT_REASONS } from "./revert-selectors.ts";

/// Refusals, counted where they actually exist: transactions that reverted.
///
/// This is the one number the index cannot produce, and the reason is structural rather than a gap
/// in the schema. A refused fill reverts, the whole transaction is rolled back, and a rolled-back
/// transaction emits no logs — so there is nothing for a subgraph to index. `recordRefusal` sat in
/// the subgraph's `quality.ts` unreferenced for exactly this reason, and the daily snapshot reported
/// `refusals: 0` while the chain carried real ones.
///
/// It matters more than the shape of the gap suggests: the refusal is the product. A screen that
/// reports zero refusals while the guard is doing its job is worse than no screen.
///
/// The selector table is generated from the contracts by `scripts/gen-revert-selectors.mjs`.
///
/// It is generated rather than written because the hand-written version had 12 of 16 selectors
/// wrong, and wrongly in a way nothing surfaces: a bad selector decodes a real floor refusal as
/// `unknown`, so the counter reads zero exactly when the guard is working.

/// The floor doing its job, as opposed to a call that failed for some other reason. Only these are
/// counted as refusals on the headline; everything else is reported separately rather than folded
/// in, because a malformed mandate is not the guard holding a line.
export const FLOOR_REASONS = new Set(["SettledBelowFloor", "StaleReference"]);

export interface Refusal {
  hash: Hex;
  blockNumber: string;
  from: Address;
  /// The decoded custom error name, or null when the revert carried no recognisable selector.
  reason: string | null;
  selector: Hex | null;
  /// Present for `SettledBelowFloor`, which is the only one carrying the numbers a viewer wants.
  executionRate?: string;
  floorRate?: string;
  tokenIn?: Address;
  tokenOut?: Address;
  /// Whose floor was hit. A refusal belongs to the recipient, not to the sender that was turned
  /// away — without it a board cannot tell its own refusals from another vault's.
  recipient?: Address;
  /// Present for `BadGuardianSignature`: the guardian the registry wanted a lowering signed by.
  guardian?: Address;
}

/// Decode a revert return payload into a reason and, for `SettledBelowFloor`, its arguments.
///
/// Pure and offline so it can be tested against payloads captured from the chain rather than only
/// exercised by a live query.
export function decodeRevert(
  data: Hex | null | undefined,
): Pick<Refusal, "reason" | "selector" | "executionRate" | "floorRate" | "tokenIn" | "tokenOut" | "recipient" | "guardian"> {
  if (!data || data.length < 10) return { reason: null, selector: null };
  const selector = data.slice(0, 10).toLowerCase() as Hex;
  const reason = REVERT_REASONS[selector] ?? null;
  const word = (i: number) => data.slice(10 + i * 64, 10 + (i + 1) * 64);

  // BadGuardianSignature(address recipient, address guardian, bytes32 digest): a floor lowering
  // signed by someone other than the guardian. Whose floor it was, and whose signature was wanted.
  if (reason === "BadGuardianSignature") {
    if (word(1).length < 64) return { reason, selector };
    return { reason, selector, recipient: `0x${word(0).slice(24)}` as Address, guardian: `0x${word(1).slice(24)}` as Address };
  }
  if (reason !== "SettledBelowFloor") return { reason, selector };

  // SettledBelowFloor(address recipient, address tokenIn, address tokenOut, uint256 executionRate,
  // uint256 floorRate) — five 32-byte words after the selector, none of them dynamic.
  if (word(4).length < 64) return { reason, selector };
  return {
    reason,
    selector,
    /*
     * Word 0, and it decides who a refusal belongs to. Without it every vault's board shows every
     * other vault's refusals — the interface cannot filter what the payload does not name, and
     * the argument was being decoded past rather than read.
     */
    recipient: (`0x${word(0).slice(24)}`) as Address,
    tokenIn: (`0x${word(1).slice(24)}`) as Address,
    tokenOut: (`0x${word(2).slice(24)}`) as Address,
    executionRate: BigInt(`0x${word(3)}`).toString(),
    floorRate: BigInt(`0x${word(4)}`).toString(),
  };
}

export interface RawTx {
  block_number: number;
  hash: Hex;
  status: number;
  from: Address;
  to: Address;
  input: Hex;
  value?: Hex;
  gas?: Hex;
}

/// Every transaction sent to the router or the registry, with its status, through HyperSync.
///
/// Transactions rather than logs, because a reverted transaction has no logs and is invisible to
/// every log-shaped query. `eth_getLogs` would not merely be against the rules here, it would return
/// nothing at all. One query for both addresses; `buildReport` splits them by destination.
async function transactions(): Promise<RawTx[]> {
  if (!HYPERSYNC.token) {
    throw new Error("SUBFLOOR_HYPERSYNC_TOKEN is not set; refusals are read from transaction history, which needs HyperSync");
  }

  const out: RawTx[] = [];
  let from = Number(CHAIN.fromBlock);

  for (let page = 0; page < 50; page++) {
    const res = await fetch(HYPERSYNC.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${HYPERSYNC.token}` },
      body: JSON.stringify({
        from_block: from,
        transactions: [{ to: [CHAIN.router.toLowerCase(), CHAIN.registry.toLowerCase()] }],
        field_selection: { transaction: ["block_number", "hash", "status", "from", "to", "input", "value", "gas"] },
      }),
    });
    if (!res.ok) throw new Error(`hypersync HTTP ${res.status}`);

    const body = (await res.json()) as { data?: { transactions?: RawTx[] }[]; next_block?: number };
    for (const batch of body.data ?? []) for (const t of batch.transactions ?? []) out.push(t);

    if (!body.next_block || body.next_block <= from) break;
    from = body.next_block;
  }
  return out;
}

/// Replay one reverted call to recover its revert payload.
///
/// Replayed against the state at the end of the previous block, which is the closest an `eth_call`
/// can get without a trace: the true position is mid-block, after whatever preceded it. For a floor
/// refusal the difference does not change the outcome — the reference and the floor do not move
/// within a block — but it is an approximation and a fill that was refused for a reason that
/// *appeared* mid-block could replay differently. `eth_call` against current state is explicitly
/// allowed; the rule that bans RPC is about log history.
async function revertDataOf(tx: RawTx): Promise<Hex | null> {
  const res = await fetch(CHAIN.rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [
        { from: tx.from, to: tx.to, data: tx.input, value: tx.value ?? "0x0", gas: tx.gas ?? "0x1000000" },
        `0x${(tx.block_number - 1).toString(16)}`,
      ],
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { error?: { data?: Hex | { data?: Hex } }; result?: Hex };
  const d = body.error?.data;
  if (typeof d === "string") return d;
  if (d && typeof d === "object" && typeof d.data === "string") return d.data;
  return null;
}

export interface RefusalReport {
  /// Refusals where the guard held a line. The headline number.
  floorRefusals: number;
  /// Reverted calls that failed for some other reason, kept separate rather than inflating the above.
  otherFailures: number;
  fills: number;
  byReason: Record<string, number>;
  recent: Refusal[];
  /// Attempts to weaken a floor that the registry refused because the guardian did not sign them.
  /// Kept apart from `recent`, which is fills the floor turned away and whose rows carry rates these
  /// do not; the headline and the fill count are the router's alone.
  weakeningRefusals: number;
  weakenings: Refusal[];
  note: string;
}

/// The report from the transactions and a way to recover a revert. Pure apart from `revertOf`, so the
/// split between router and registry is testable without HyperSync or an RPC.
export async function buildReport(
  txs: RawTx[],
  revertOf: (tx: RawTx) => Promise<Hex | null>,
  limit = 25,
): Promise<RefusalReport> {
  const router = CHAIN.router.toLowerCase();
  const registry = CHAIN.registry.toLowerCase();
  const toRouter = txs.filter((t) => t.to?.toLowerCase() === router);
  const toRegistry = txs.filter((t) => t.to?.toLowerCase() === registry);

  const decodeReverted = async (list: RawTx[]): Promise<Refusal[]> => {
    const out: Refusal[] = [];
    for (const t of list.filter((x) => x.status === 0)) {
      out.push({ hash: t.hash, blockNumber: String(t.block_number), from: t.from, ...decodeRevert(await revertOf(t)) });
    }
    return out.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));
  };
  const decoded = await decodeReverted(toRouter);
  // Only the wrong signer is an attempt to weaken. A guardian's own lowering that failed on a stale
  // nonce or a lapsed deadline is a mistake, not an attack, and is not reported as one.
  const weakenings = (await decodeReverted(toRegistry)).filter((r) => r.reason === "BadGuardianSignature");

  const byReason: Record<string, number> = {};
  for (const r of decoded) byReason[r.reason ?? "unknown"] = (byReason[r.reason ?? "unknown"] ?? 0) + 1;

  return {
    floorRefusals: decoded.filter((r) => r.reason && FLOOR_REASONS.has(r.reason)).length,
    otherFailures: decoded.filter((r) => !r.reason || !FLOOR_REASONS.has(r.reason)).length,
    fills: toRouter.filter((t) => t.status === 1).length,
    byReason,
    recent: decoded.slice(0, limit),
    weakeningRefusals: weakenings.length,
    weakenings: weakenings.slice(0, limit),
    note:
      "Refusals are reverted transactions, so they carry no logs and cannot come from the index at all. Counted from transaction status via HyperSync, with each revert payload recovered by replaying the call one block earlier. " +
      "Weakenings are transactions to the registry that tried to lower a floor without the guardian's signature, recovered the same way.",
  };
}

export async function refusals(limit = 25): Promise<RefusalReport> {
  return buildReport(await transactions(), revertDataOf, limit);
}
