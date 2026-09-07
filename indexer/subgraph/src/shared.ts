import { Address, BigDecimal, BigInt, Bytes, dataSource, ethereum } from "@graphprotocol/graph-ts";
import { ERC20 } from "../generated/Aqua/ERC20";
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
  // Read from the deployment rather than hardcoded, so the mainnet and Sepolia manifests cannot
  // disagree with the row they write. `dataSource.network()` returns the manifest's own value.
  p.network = dataSource.network() == "base" ? "BASE" : "BASE_SEPOLIA";
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
  // Read from the token itself. This costs three eth_calls once per token for the life of the
  // subgraph — `Token.load` above returns early for everything already seen — and the earlier
  // version deferred all three to the Token API, which published `decimals: 18` for USDC. A
  // consumer deriving a human amount off that is out by a factor of 10^12, and a standardized
  // schema is exactly the thing people read without checking.
  const erc20 = ERC20.bind(address);
  const name = erc20.try_name();
  const symbol = erc20.try_symbol();
  const decimals = erc20.try_decimals();
  // Fall back rather than revert: a token that does not implement the optional metadata methods
  // is still a token, and dropping the fill would lose real volume to cosmetics.
  t.name = name.reverted ? "" : name.value;
  t.symbol = symbol.reverted ? "" : symbol.value;
  t.decimals = decimals.reverted ? 18 : decimals.value;
  t.cumulativeVolume = ZERO_BI;
  t.cumulativeVolumeUSD = ZERO_BD;
  t.lastSnapshotDayID = 0;
  t.lastUpdateTimestamp = block.timestamp;
  t.lastUpdateBlockNumber = block.number;
  t.save();
  return t;
}

/// @dev Every non-nullable field on the entity has to be set before `save`, or graph-node aborts the
///      handler — deterministically, on every retry, which halts the subgraph at that block while
///      still reporting `hasIndexingErrors: false`. This one shipped with only `id` set and did not
///      fire for a week, because no `Swapped` event had ever been indexed: the previous testnet
///      deployment never took a fill. The first real fill stopped the index dead.
export function getAccount(address: Address): Account {
  const id = Bytes.fromHexString(address.toHexString());
  const existing = Account.load(id);
  if (existing) return existing;

  const a = new Account(id);
  a.cumulativeVolumeUSD = ZERO_BD;
  a.swapCount = 0;
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
/// The reference row's id. Not an address: see the note on ReferenceAnswer in the schema.
export const ETH_USD = Bytes.fromUTF8("ETH/USD");

/// Feed decimals for Base ETH/USD, verified on chain.
export const FEED_DECIMALS = 8;

/// The reference rate in the canonical convention, from a raw feed answer.
///
/// This mirrors `FloorRegistry._referenceRate` exactly, and it has to: the whole point of the index
/// is that a stranger can recompute what settlement computed. Drift here and the daily report
/// quietly disagrees with the chain.
///
///     forward:   answer * scale / 10**feedDecimals
///     inverted:  10**feedDecimals * scale / answer
///     scale   =  1e18 * 10**quoteDecimals / 10**baseDecimals
///
/// Both branches, and the `inverted` flag comes from the registry rather than being guessed from
/// which token has more decimals. The registry registers WETH/tUSDC forward and tUSDC/WETH
/// inverted; a version of this function that had only the forward branch scored every reverse fill
/// at -9999 bps, which reads as a clamp and is really a reference 10^24 out of scale.
export function referenceRate(answer: BigInt, scale: BigInt, inverted: boolean): BigInt {
  if (answer.isZero()) return ZERO_BI;
  const unit = pow10(FEED_DECIMALS);
  return inverted ? unit.times(scale).div(answer) : answer.times(scale).div(unit);
}

/// `1e18 * 10**quoteDecimals / 10**baseDecimals`, the registry's own `scale`.
export function referenceScale(baseDecimals: number, quoteDecimals: number): BigInt {
  return RATE_ONE.times(pow10(quoteDecimals)).div(pow10(baseDecimals));
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

/// Days since the Unix epoch. The id every daily snapshot is keyed on.
export function dayId(timestamp: BigInt): i32 {
  return timestamp.toI32() / 86400;
}

/// Insert into an ascending array, keeping it sorted. The day's fills are counted in tens or
/// hundreds, so an insertion is cheaper than sorting on every read and far cheaper than making
/// every consumer sort for itself.
export function insertSorted(xs: Array<i32>, x: i32): Array<i32> {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) / 2;
    if (xs[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  const out = new Array<i32>();
  for (let i = 0; i < lo; i++) out.push(xs[i]);
  out.push(x);
  for (let i = lo; i < xs.length; i++) out.push(xs[i]);
  return out;
}

/// Nearest-rank percentile on an ascending array. `p` is 0-100.
///
/// Nearest-rank rather than interpolated on purpose: the floor-setting screen reads p99 and turns it
/// into a price a human signs, and an interpolated p99 returns a deviation no fill actually had.
/// The number on that screen should be one the venue really produced.
export function percentile(sorted: Array<i32>, p: i32): i32 {
  if (sorted.length == 0) return 0;
  let rank = (p * sorted.length) / 100;
  if (rank >= sorted.length) rank = sorted.length - 1;
  return sorted[rank];
}
