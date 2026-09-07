/// Floor arithmetic, in one place and in the same direction the registry uses.
///
/// The rate convention is the one thing worth getting right before anything else: a rate is
/// `received * 1e18 / given`, in raw token units, from one party's point of view. Higher is better
/// for that party. Both sides of a fill compute their own rate this way and look up their own floor,
/// which is why the check is symmetric and why "the maker's rate" and "the taker's rate" are
/// reciprocals rather than the same number.

export const ONE = 10n ** 18n;
export const BPS = 10_000n;

export class FloorError extends Error {}

/// The realized rate of a fill, from the point of view of whoever gave `given` and received
/// `received`.
export function rateOf(received: bigint, given: bigint): bigint {
  if (given === 0n) throw new FloorError("a rate over zero given is not a rate");
  return (received * ONE) / given;
}

/// The floor implied by a reference rate and a tolerance.
///
/// Rounded up, because the floor is a minimum: truncating would make it marginally weaker than what
/// was configured, which is the wrong direction for a guarantee. This mirrors the `Math.Rounding.Ceil`
/// in `FloorRegistry.effectiveFloor`.
export function relativeFloor(referenceRate: bigint, maxAdverseBps: number): bigint {
  if (maxAdverseBps < 0 || maxAdverseBps > Number(BPS)) throw new FloorError(`bps out of range: ${maxAdverseBps}`);
  // A tolerance of exactly 10000 means "any adverse deviation is acceptable": the relative component
  // contributes nothing and only a backstop can bind.
  if (BigInt(maxAdverseBps) === BPS) return 0n;
  const num = referenceRate * (BPS - BigInt(maxAdverseBps));
  return num % BPS === 0n ? num / BPS : num / BPS + 1n;
}

/// The stronger of the reference-relative floor and the absolute backstop, which is what actually
/// binds at settlement.
export function effectiveFloor(referenceRate: bigint, maxAdverseBps: number, absoluteRate: bigint): bigint {
  const relative = relativeFloor(referenceRate, maxAdverseBps);
  return relative > absoluteRate ? relative : absoluteRate;
}

/// How far a rate sits from the reference, in bps. Positive means worse than the reference for the
/// party whose rate this is.
export function adverseDeviationBps(rate: bigint, referenceRate: bigint): number {
  if (referenceRate === 0n) throw new FloorError("no reference to deviate from");
  return Number(((referenceRate - rate) * BPS) / referenceRate);
}

export function wouldSettle(rate: bigint, floorRate: bigint): boolean {
  return rate >= floorRate;
}
