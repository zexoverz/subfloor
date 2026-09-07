import { test } from "node:test";
import assert from "node:assert/strict";
import { calibrateFrom, HOUSE_DEFAULT_BPS, MIN_SAMPLES, roundUpToDetent } from "./calibration.ts";
import type { DailyQuality } from "./subgraph.ts";

const provenance = { endpoint: "e", query: "q", variables: {} };

function day(d: number, fills: number, p50: number, p99: number): DailyQuality {
  return {
    day: d,
    fills,
    refusals: 0,
    adverseDeviationP50Bps: p50,
    adverseDeviationP99Bps: p99,
    medianReferenceAgeSeconds: 120,
    timestamp: "0",
  };
}

test("rounds up to the next 25 bps detent, and leaves a number already on one alone", () => {
  assert.equal(roundUpToDetent(41), 50);
  assert.equal(roundUpToDetent(50), 50);
  assert.equal(roundUpToDetent(51), 75);
  assert.equal(roundUpToDetent(0), 0);
});

test("below the sample threshold it says so and shows the house number", () => {
  const c = calibrateFrom([day(1, 12, 6, 41)], 7, provenance);
  assert.equal(c.calibrated, false);
  assert.equal(c.floorBps, HOUSE_DEFAULT_BPS);
  assert.equal(c.notice, "venue history too short to calibrate — house default shown");
  assert.equal(c.p99Bps, null, "a p99 over 12 fills must not be rendered as if it were statistics");
  assert.equal(c.samples, 12);
});

test("at the threshold it calibrates from the venue and drops the notice", () => {
  const c = calibrateFrom([day(1, MIN_SAMPLES, 6, 41)], 7, provenance);
  assert.equal(c.calibrated, true);
  assert.equal(c.notice, "");
  assert.equal(c.p99Bps, 41);
  assert.equal(c.floorBps, 50);
});

test("the window's p99 is the worst day, not the average of the days", () => {
  // A mean would sit at 40 and put the floor inside the bad day, which is the day a floor is for.
  const c = calibrateFrom([day(1, 60, 5, 20), day(2, 60, 5, 60)], 7, provenance);
  assert.equal(c.p99Bps, 60);
  assert.equal(c.floorBps, 75);
});

test("p50 is weighted by fills, so a two-fill day cannot drag it", () => {
  const c = calibrateFrom([day(1, 198, 10, 30), day(2, 2, 500, 30)], 7, provenance);
  assert.equal(c.samples, 200);
  assert.equal(c.p50Bps, 15, "198 fills at 10 and 2 at 500 is 14.9, not 255");
});

test("the response carries the query that produced it", () => {
  const c = calibrateFrom([day(1, 200, 5, 20)], 7, { endpoint: "https://x", query: "query Q {}", variables: { since: 1 } });
  assert.equal(c.provenance.query, "query Q {}");
  assert.deepEqual(c.provenance.variables, { since: 1 });
});
