import type { IndexView } from "../market/index-reads.ts";

/// What the loop may do. There is no "sell everything" and no arbitrary call: the delegate surface
/// is ship, dock, updateQuote and rescueApproval, and the policy vocabulary matches it exactly so a
/// decision this module cannot express is also one the key cannot sign.
export type Action =
  | { kind: "hold"; why: string }
  | { kind: "requote"; why: string }
  | { kind: "recenter"; why: string; referencePrice: bigint }
  | { kind: "dock"; why: string }
  /// Nothing is wrong with the market; the agent has simply run out of the authority it was given.
  /// A separate outcome from `dock` because the operator's next move is different: sign a batch,
  /// not investigate a feed.
  | { kind: "unauthorised"; why: string };

export interface PolicyInputs {
  /// How many signed mandates remain. Re-quoting spends one, so a loop with none can decide to
  /// re-centre and then be unable to act on it — better to say so than to compute a decision that
  /// cannot be carried out.
  mandatesRemaining?: number;
  index: IndexView;
  /// Chain head, to tell a stalled index from a quiet one.
  chainHead: number;
  /// Seconds. Beyond this the reference is not fresh enough to quote against.
  maxReferenceAgeSeconds: number;
  /// Blocks. Beyond this the index is too far behind to be reasoned from.
  maxIndexLagBlocks: number;
  /// Now, in unix seconds.
  now: number;
  /// Mid from the venue we are pricing against, raw units, 1e18 scaled.
  venueMid: bigint | null;
  /// The reference the current book was centred on.
  centredOn: bigint | null;
  /// How far the mid may drift from the centre before re-centring, in bps.
  recenterBps: number;
}

/// The decision, and every branch that stops trading comes before every branch that trades.
///
/// That ordering is the fail-closed rule expressed in control flow rather than in a comment: there
/// is no path to `requote` or `recenter` that has not already passed every reason to dock. The
/// registry refuses a bad fill at settlement whatever this returns — but a loop that quotes into a
/// market it cannot see is still wrong, and "the guard would have caught it" is not a reason to be
/// careless upstream of the guard.
export function decide(i: PolicyInputs): Action {
  if (i.index.hasIndexingErrors) {
    return { kind: "dock", why: "the index reports indexing errors; its answers cannot be trusted" };
  }

  const lag = i.chainHead - i.index.indexedBlock;
  if (lag > i.maxIndexLagBlocks) {
    return { kind: "dock", why: `the index is ${lag} blocks behind the chain, past the ${i.maxIndexLagBlocks} bound` };
  }

  if (i.index.reference === null) {
    return { kind: "dock", why: "the index has seen no reference answer; there is nothing to price against" };
  }

  const age = i.now - i.index.reference.updatedAt;
  if (age > i.maxReferenceAgeSeconds) {
    return { kind: "dock", why: `the reference is ${age}s old, past the ${i.maxReferenceAgeSeconds}s bound` };
  }

  if (i.venueMid === null) {
    return { kind: "dock", why: "no venue mid; quoting would be against a price we do not have" };
  }

  // Authority before market. Every branch below spends a mandate, and an agent that has run out has
  // not encountered a problem with the venue — it has reached the end of what its owner signed for.
  // Reporting that as a dock would send someone to look at a feed that is fine.
  if (i.mandatesRemaining !== undefined && i.mandatesRemaining === 0) {
    return {
      kind: "unauthorised",
      why: "no signed mandate left; the agent stops until a new batch is signed on the device",
    };
  }

  // Only now is trading on the table.

  const ours = i.index.strategies.filter((s) => s.programWrappedInOrder);
  if (ours.length === 0) {
    return { kind: "requote", why: "nothing is shipped; the book has to exist before it can be adjusted" };
  }

  if (i.centredOn === null) {
    return { kind: "recenter", why: "the shipped book's centre is unknown", referencePrice: i.venueMid };
  }

  const drift = driftBps(i.venueMid, i.centredOn);
  if (Math.abs(drift) > i.recenterBps) {
    return {
      kind: "recenter",
      why: `the mid has moved ${drift} bps from the book's centre, past the ${i.recenterBps} bps band`,
      referencePrice: i.venueMid,
    };
  }

  return { kind: "hold", why: `the mid is ${drift} bps from centre and the reference is ${age}s old` };
}

/// Signed drift of `mid` from `centre`, in bps. Integer arithmetic throughout: these are raw-unit
/// rates in the same 1e18 convention settlement uses, and putting them through a float is how a
/// price ends up a few wei different from the one the chain checked.
export function driftBps(mid: bigint, centre: bigint): number {
  if (centre === 0n) return 0;
  return Number(((mid - centre) * 10_000n) / centre);
}
