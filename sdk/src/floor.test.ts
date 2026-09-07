import { test } from "node:test";
import assert from "node:assert/strict";
import { adverseDeviationBps, BPS, effectiveFloor, FloorError, ONE, rateOf, relativeFloor, wouldSettle } from "./floor.ts";

test("a rate is what you received over what you gave", () => {
  // 1 WETH in, 2500 USDC out, in raw units: 2500e6 * 1e18 / 1e18
  assert.equal(rateOf(2500n * 10n ** 6n, ONE), 2500n * 10n ** 6n);
});

test("a rate over zero given is refused rather than returned as zero or infinity", () => {
  assert.throws(() => rateOf(1n, 0n), FloorError);
});

test("the relative floor rounds up, because a floor is a minimum", () => {
  // 3 * 9999 / 10000 truncates to 2; the floor must be 3, not 2, or it is weaker than configured.
  assert.equal(relativeFloor(3n, 1), 3n);
  assert.equal(relativeFloor(10_000n, 100), 9_900n);
});

test("a tolerance of exactly 10000 bps means only a backstop can bind", () => {
  assert.equal(relativeFloor(2500n, Number(BPS)), 0n);
  assert.equal(effectiveFloor(2500n, Number(BPS), 999n), 999n);
});

test("the effective floor is the stronger of the two, in both directions", () => {
  assert.equal(effectiveFloor(10_000n, 100, 5_000n), 9_900n, "relative binds");
  assert.equal(effectiveFloor(10_000n, 100, 9_950n), 9_950n, "backstop binds");
});

test("a tolerance outside 0..10000 is refused", () => {
  assert.throws(() => relativeFloor(1n, 10_001), FloorError);
  assert.throws(() => relativeFloor(1n, -1), FloorError);
});

test("deviation is positive when the fill is worse than the reference", () => {
  assert.equal(adverseDeviationBps(9_900n, 10_000n), 100);
  assert.equal(adverseDeviationBps(10_100n, 10_000n), -100, "better than reference is a negative deviation");
});

test("settlement is at-or-above, so a fill exactly on the floor is allowed", () => {
  assert.equal(wouldSettle(100n, 100n), true);
  assert.equal(wouldSettle(99n, 100n), false);
});
