import { Address, BigDecimal, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { DexAggProtocol, Token, Account } from "../generated/schema";

export const PROTOCOL_ID = Bytes.fromUTF8("subfloor-base");
export const ZERO_BI = BigInt.zero();
export const ZERO_BD = BigDecimal.zero();
export const RATE_ONE = BigInt.fromString("1000000000000000000");

/// The protocol row the standardized schema hangs everything off.
///
/// Every field below is required by schema-dex-agg v1.0.2 and was read off the schema rather than
/// remembered — the first attempt at this function invented `totalValueLockedUSD`,
/// `cumulativeVolumeUSD` and `totalPoolCount`, none of which exist on this entity. Adopting a
/// standard means writing what it says, not what a DEX schema usually says.
///
/// `slug` is what makes the one-query-shape-across-venues claim work: a consumer filters on it and
/// nothing else about the query changes.
export function getProtocol(block: ethereum.Block): DexAggProtocol {
  const existing = DexAggProtocol.load(PROTOCOL_ID);
  if (existing) {
    existing.lastUpdateTimestamp = block.timestamp;
    existing.lastUpdateBlockNumber = block.number;
    existing.save();
    return existing;
  }

  const p = new DexAggProtocol(PROTOCOL_ID);
  p.name = "SUBFLOOR";
  p.slug = "aqua";
  p.schemaVersion = "1.0.2";
  p.subgraphVersion = "1.0.0";
  p.methodologyVersion = "1.0.0";
  p.network = "BASE";
  p.type = "GENERIC";
  p.feeType = "FIXED_TRADING_FEE";
  p.cumulativeNetVolumeUSD = ZERO_BD;
  p.cumulativeSupplySideRevenueUSD = ZERO_BD;
  p.cumulativeProtocolSideRevenueUSD = ZERO_BD;
  p.cumulativeTotalRevenueUSD = ZERO_BD;
  p.cumulativeUniqueUsers = 0;
  p.lastSnapshotDayID = 0;
  p.lastUpdateTimestamp = block.timestamp;
  p.lastUpdateBlockNumber = block.number;
  p.save();
  return p;
}

export function getToken(address: Address, block: ethereum.Block): Token {
  const id = Bytes.fromHexString(address.toHexString());
  const existing = Token.load(id);
  if (existing) return existing;

  const t = new Token(id);
  // Metadata comes from the Token API rather than three eth_calls per unseen token. Nothing
  // upstream is indexed, so unseen tokens arrive in bulk on every Pulled and Pushed.
  t.name = "";
  t.symbol = "";
  t.decimals = 18;
  t.cumulativeVolume = ZERO_BI;
  t.cumulativeVolumeUSD = ZERO_BD;
  t.lastSnapshotDayID = 0;
  t.lastUpdateTimestamp = block.timestamp;
  t.lastUpdateBlockNumber = block.number;
  t.save();
  return t;
}

export function getAccount(address: Address): Account {
  const id = Bytes.fromHexString(address.toHexString());
  const existing = Account.load(id);
  if (existing) return existing;

  const a = new Account(id);
  a.save();
  return a;
}

export function eventId(event: ethereum.Event): Bytes {
  return event.transaction.hash.concatI32(event.logIndex.toI32());
}

/// The canonical rate convention, identical to the contracts': received * 1e18 / given, from one
/// party's point of view, higher is better for that party. Keeping the indexer's arithmetic the
/// same as settlement's is what lets the daily report be checked against the chain.
export function rateOf(received: BigInt, given: BigInt): BigInt {
  if (given.isZero()) return ZERO_BI;
  return received.times(RATE_ONE).div(given);
}

/// The Base ETH/USD aggregator, which is what emits `AnswerUpdated`. The proxy address that
/// FloorRegistry is configured with emits nothing.
export const ETH_USD_AGGREGATOR = Bytes.fromHexString("0x05c84a58fe042275b37db038baacd15f410c7bb0");

/// Feed decimals for Base ETH/USD, verified on chain.
export const FEED_DECIMALS = 8;

/// The reference rate in the canonical convention, from a raw feed answer.
///
/// This mirrors `FloorRegistry._referenceRate` exactly, and it has to: the whole point of the index
/// is that a stranger can recompute what settlement computed. Drift here and the daily report
/// quietly disagrees with the chain.
///
///     forward:  answer * scale / 10**feedDecimals
///     scale  =  1e18 * 10**quoteDecimals / 10**baseDecimals
export function referenceRate(answer: BigInt, baseDecimals: number, quoteDecimals: number): BigInt {
  const scale = RATE_ONE.times(pow10(quoteDecimals)).div(pow10(baseDecimals));
  return answer.times(scale).div(pow10(FEED_DECIMALS));
}

export function pow10(n: number): BigInt {
  let out = BigInt.fromI32(1);
  const ten = BigInt.fromI32(10);
  for (let i = 0; i < (n as i32); i++) out = out.times(ten);
  return out;
}

/// Signed deviation of a realised rate from the reference, in bps. Negative is worse than the
/// reference for the party being scored.
export function deviationBps(executionRate: BigInt, reference: BigInt): i32 {
  if (reference.isZero()) return 0;
  const diff = executionRate.minus(reference).times(BigInt.fromI32(10000));
  return diff.div(reference).toI32();
}
