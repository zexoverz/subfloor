import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { Swapped } from "../generated/FloorRouter/FloorRouter";
import { Swap, VirtualPool, FillQuality, Floor } from "../generated/schema";
import { eventId, getAccount, getProtocol, getToken, rateOf, ZERO_BD, ZERO_BI } from "./shared";

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

  // The reference join lands with the Chainlink AnswerUpdated data source. Until then these carry
  // zero rather than a guess, and referenceAgeSeconds of -1 marks "not yet scored" so a report
  // built on unscored fills is visibly wrong rather than quietly averaged.
  q.referencePrice = ZERO_BI;
  q.referenceAgeSeconds = -1;
  q.adverseDeviationBps = 0;

  const floorId = Bytes.fromHexString(event.params.taker.toHexString()).concat(tokenIn.id).concat(tokenOut.id);
  const floor = Floor.load(floorId);
  q.floorAtFill = floor == null ? null : floor.absoluteRate;

  q.blockNumber = event.block.number;
  q.timestamp = event.block.timestamp;
  q.save();
}
