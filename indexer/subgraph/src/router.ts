import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { Swapped, FloorRouter } from "../generated/FloorRouter/FloorRouter";
import { FloorRegistry } from "../generated/FloorRegistry/FloorRegistry";
import { Swap, VirtualPool, FillQuality, Floor, ReferenceAnswer, ReferenceFeed, Token } from "../generated/schema";
import { recordFill } from "./quality";
import { deviationBps, effectiveFloor, ETH_USD, eventId, getAccount, getProtocol, getToken, rateOf, referenceRate, ZERO_BD, ZERO_BI } from "./shared";

/// The registry's reference configuration for one ordered pair, read from the registry itself.
///
/// Directional, and that is the point: the same two tokens are registered twice, forward one way
/// and inverted the other, and the registry applies a different formula to each. Deriving the
/// direction here from which token has more decimals is what the earlier version did, and it scored
/// every reverse fill at -9999 bps.
///
/// Cached after the first read because `setReferenceFeed` reverts `ReferenceAlreadySet` on a second
/// call, so a pair's configuration cannot change under us once it exists.
///
/// Returns null when the pair has no feed. The caller must leave the fill unscored in that case
/// rather than reach for the other direction's configuration.
function getReferenceFeed(router: Address, tokenIn: Token, tokenOut: Token): ReferenceFeed | null {
  const id = tokenIn.id.concat(tokenOut.id);
  const cached = ReferenceFeed.load(id);
  if (cached != null) return cached;

  const reg = FloorRouter.bind(router).try_FLOOR_REGISTRY();
  if (reg.reverted) return null;

  const cfg = FloorRegistry.bind(reg.value).try_referenceFeed(
    Address.fromBytes(tokenIn.id),
    Address.fromBytes(tokenOut.id),
  );
  if (cfg.reverted) return null;
  if (cfg.value.value0.equals(Address.zero())) return null;

  const f = new ReferenceFeed(id);
  f.base = tokenIn.id;
  f.quote = tokenOut.id;
  f.feed = cfg.value.value0;
  f.inverted = cfg.value.value1;
  f.stalenessBound = cfg.value.value2.toI32();
  f.scale = cfg.value.value4;
  f.save();
  return f;
}

/// The standardized entity, populated exactly as the schema defines it. Nothing SUBFLOOR-specific
/// goes in here; a consumer who knows dex-agg queries this without reading our docs.
export function handleSwapped(event: Swapped): void {
  const protocol = getProtocol(event.block);
  const tokenIn = getToken(event.params.tokenIn, event.block);
  const tokenOut = getToken(event.params.tokenOut, event.block);

  const poolId = tokenIn.id.concat(tokenOut.id);
  let pool = VirtualPool.load(poolId);
  if (pool == null) {
    pool = new VirtualPool(poolId);
    pool.protocol = protocol.id;
    pool.tokensIn = [tokenIn.id];
    pool.tokensOut = [tokenOut.id];
    pool.cumulativeVolumesIn = [ZERO_BI];
    pool.cumulativeVolumesInUSD = [ZERO_BD];
    pool.cumulativeVolumesOut = [ZERO_BI];
    pool.cumulativeVolumesOutUSD = [ZERO_BD];
    pool.cumulativeNetVolumeUSD = ZERO_BD;
    pool.cumulativeSupplySideRevenueUSD = ZERO_BD;
    pool.cumulativeProtocolSideRevenueUSD = ZERO_BD;
    pool.cumulativeTotalRevenueUSD = ZERO_BD;
    pool.cumulativeUniqueUsers = 0;
    pool.lastSnapshotDayID = 0;
  }
  pool.timestamp = event.block.timestamp;
  pool.blockNumber = event.block.number;
  pool.lastUpdateTimestamp = event.block.timestamp;
  pool.lastUpdateBlockNumber = event.block.number;
  pool.save();

  const id = eventId(event);
  const swap = new Swap(id);
  swap.hash = event.transaction.hash;
  swap.nonce = event.transaction.nonce;
  swap.logIndex = event.logIndex.toI32();
  swap.gasUsed = event.receipt ? event.receipt!.gasUsed : null;
  swap.gasLimit = event.transaction.gasLimit;
  swap.gasPrice = event.transaction.gasPrice;
  swap.protocol = protocol.id;
  swap.account = getAccount(event.params.taker).id;
  swap.blockNumber = event.block.number;
  swap.timestamp = event.block.timestamp;
  swap.virtualPool = pool.id;
  swap.tokensIn = [tokenIn.id];
  swap.amountsIn = [event.params.amountIn];
  swap.amountsInUSD = [ZERO_BD];
  swap.tokensOut = [tokenOut.id];
  swap.amountsOut = [event.params.amountOut];
  swap.amountsOutUSD = [ZERO_BD];
  swap.save();

  // The SUBFLOOR half, one hop away and keyed to the same id.
  const q = new FillQuality(id);
  q.swap = swap.id;
  q.executionRate = rateOf(event.params.amountOut, event.params.amountIn);

  // Scored against the most recent answer indexed at or before this block, which is the same one
  // settlement compared against. `referenceAgeSeconds` of -1 still means "not scored" — it happens
  // when the fill precedes any AnswerUpdated this subgraph has seen — and the daily report must
  // exclude those rather than average them in as if they were fresh.
  const ref = ReferenceAnswer.load(ETH_USD);
  const feed = getReferenceFeed(event.address, tokenIn, tokenOut);
  if (ref && feed) {
    const refRate = referenceRate(ref.answer, feed.scale, feed.inverted);
    q.referencePrice = refRate;
    q.adverseDeviationBps = deviationBps(q.executionRate, refRate);
    const age = event.block.timestamp.minus(ref.updatedAt);
    q.referenceAgeSeconds = age.lt(ZERO_BI) ? 0 : age.toI32();
  } else {
    q.referencePrice = ZERO_BI;
    q.referenceAgeSeconds = -1;
    q.adverseDeviationBps = 0;
  }

  q.maker = event.params.maker;
  q.taker = event.params.taker;

  // Both sides, because settlement checks both and only one of them is the party this product
  // protects. The maker's rate is the taker's inverted, on the reversed pair: it gave `amountOut`
  // and got `amountIn`.
  q.makerExecutionRate = rateOf(event.params.amountIn, event.params.amountOut);

  // The reverse pair has its own reference row with its own `inverted` flag, so it is read rather
  // than derived from the forward one. Held in a variable because the floor needs it too.
  let makerReference = ZERO_BI;
  if (ref) {
    const makerFeed = getReferenceFeed(event.address, tokenOut, tokenIn);
    if (makerFeed) makerReference = referenceRate(ref.answer, makerFeed.scale, makerFeed.inverted);
  }
  q.makerAdverseDeviationBps = makerReference.isZero() ? 0 : deviationBps(q.makerExecutionRate, makerReference);

  const takerFloor = Floor.load(
    Bytes.fromHexString(event.params.taker.toHexString()).concat(tokenIn.id).concat(tokenOut.id),
  );
  q.takerFloorAtFill = takerFloor == null
    ? null
    : effectiveFloor(q.referencePrice, takerFloor.maxAdverseBps, takerFloor.absoluteRate);

  // Keyed on the reversed pair, the way the registry stores it for the maker.
  const makerFloor = Floor.load(
    Bytes.fromHexString(event.params.maker.toHexString()).concat(tokenOut.id).concat(tokenIn.id),
  );
  q.makerFloorAtFill = makerFloor == null
    ? null
    : effectiveFloor(makerReference, makerFloor.maxAdverseBps, makerFloor.absoluteRate);

  q.blockNumber = event.block.number;
  q.timestamp = event.block.timestamp;
  q.save();

  // And the day's roll-up, so the report and the floor screen never walk the fills themselves.
  //
  // The **maker's** deviation, not the taker's. The floor-setting screen calibrates from this, and
  // the number a maker needs is how its own fills landed against the reference. Rolling up the
  // taker's put the counterparty's performance on the screen: it read +32 bps and looked like the
  // vault executing well, while the same fills were the vault paying 32 bps through the reference.
  recordFill(event.block, q.makerAdverseDeviationBps, q.referenceAgeSeconds);
}
