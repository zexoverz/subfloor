import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { ExecutionQualityDailySnapshot, ExecutionQualitySamples } from "../generated/schema";
import { dayId, getProtocol, insertSorted, percentile } from "./shared";
import { ethereum } from "@graphprotocol/graph-ts";

/// Rolls fills and refusals into one row per day, so the daily report and the floor-setting screen
/// are a query rather than a walk over every fill.
///
/// The two callers are asymmetric on purpose. A fill contributes a deviation and a reference age; a
/// refusal contributes neither, because a refused fill has no execution rate — it never settled.
/// Counting refusals in the same row is still right: "how often did the floor hold" and "how good
/// were the fills that happened" are the two halves of one day's execution quality, and a consumer
/// that had to join them from two places would eventually join them wrong.

function snapshotFor(block: ethereum.Block): ExecutionQualityDailySnapshot {
  const day = dayId(block.timestamp);
  const id = Bytes.fromI32(day);
  let s = ExecutionQualityDailySnapshot.load(id);
  if (s == null) {
    s = new ExecutionQualityDailySnapshot(id);
    s.protocol = getProtocol(block).id;
    s.day = day;
    s.fills = 0;
    s.refusals = 0;
    s.adverseDeviationP50Bps = 0;
    s.adverseDeviationP99Bps = 0;
    s.medianReferenceAgeSeconds = 0;
  }
  s.timestamp = block.timestamp;
  return s;
}

function samplesFor(day: i32): ExecutionQualitySamples {
  const id = Bytes.fromI32(day);
  let x = ExecutionQualitySamples.load(id);
  if (x == null) {
    x = new ExecutionQualitySamples(id);
    x.deviationsBps = new Array<i32>();
    x.referenceAgesSeconds = new Array<i32>();
  }
  return x;
}

/// @param adverseDeviationBps the fill's deviation from the reference
/// @param referenceAgeSeconds -1 when the fill could not be scored, in which case it counts toward
///        `fills` but contributes to no percentile. Averaging an unscored fill in at zero would
///        pull every percentile toward the reference and make the floor look safer than the venue is.
export function recordFill(block: ethereum.Block, adverseDeviationBps: i32, referenceAgeSeconds: i32): void {
  const s = snapshotFor(block);
  s.fills = s.fills + 1;

  if (referenceAgeSeconds >= 0) {
    const x = samplesFor(s.day);
    x.deviationsBps = insertSorted(x.deviationsBps, adverseDeviationBps);
    x.referenceAgesSeconds = insertSorted(x.referenceAgesSeconds, referenceAgeSeconds);
    x.save();

    s.adverseDeviationP50Bps = percentile(x.deviationsBps, 50);
    s.adverseDeviationP99Bps = percentile(x.deviationsBps, 99);
    s.medianReferenceAgeSeconds = percentile(x.referenceAgesSeconds, 50);
  }

  s.save();
}

export function recordRefusal(block: ethereum.Block): void {
  const s = snapshotFor(block);
  s.refusals = s.refusals + 1;
  s.save();
}
