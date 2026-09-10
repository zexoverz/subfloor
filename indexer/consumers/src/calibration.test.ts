import { test } from "node:test";
import assert from "node:assert/strict";
import { calibrate, calibrateFrom, HOUSE_DEFAULT_BPS, MIN_SAMPLES, roundUpToDetent } from "./calibration.ts";

const provenance = { endpoint: "e", query: "q", variables: {} };

/// `n` fills at `bps` each.
const at = (n: number, bps: number) => Array.from({ length: n }, () => bps);

test("rounds up to the next 25 bps detent, and leaves a number already on one alone", () => {
  assert.equal(roundUpToDetent(41), 50);
  assert.equal(roundUpToDetent(50), 50);
  assert.equal(roundUpToDetent(51), 75);
  assert.equal(roundUpToDetent(0), 0);
});

test("below the sample threshold it says so and shows the house number", () => {
  const c = calibrateFrom(at(12, -6), 7, provenance);
  assert.equal(c.calibrated, false);
  assert.equal(c.floorBps, HOUSE_DEFAULT_BPS);
  assert.equal(c.notice, "venue history too short to calibrate — house default shown");
  assert.equal(c.p99Bps, null, "a p99 over 12 fills must not be rendered as if it were statistics");
  assert.equal(c.samples, 12);
});

test("the floor comes from the maker's worst fills, not its best", () => {
  // 99 fills 10 bps through the reference, one 120 bps through it. The worst 1% is the 120.
  const c = calibrateFrom([...at(99, -10), -120], 7, provenance);
  assert.equal(c.calibrated, true);
  assert.equal(c.p99Bps, -120);
  assert.equal(c.floorBps, 125);
});

test("fills the maker did well on cannot pull the floor inside its bad ones", () => {
  // The shape that was live on 10 Sep: a median well through the reference and a good upper tail.
  // Read from the wrong end this is a floor of 50 with the median at -51.
  const c = calibrateFrom([...at(10, -90), ...at(80, -51), ...at(10, 44)], 7, provenance);
  assert.equal(c.p50Bps, -51);
  assert.ok(c.floorBps > 51, `a floor of ${c.floorBps} bps sits inside the median fill`);
  assert.equal(c.floorBps, 100);
});

test("a maker that beat the reference even at its worst gets a floor at the reference, not above it", () => {
  const c = calibrateFrom(at(150, 20), 7, provenance);
  assert.equal(c.p99Bps, 20);
  assert.equal(c.floorBps, 0);
});

test("the response carries the query that produced it", () => {
  const c = calibrateFrom(at(200, -5), 7, { endpoint: "https://x", query: "query Q {}", variables: { since: 1 } });
  assert.equal(c.provenance.query, "query Q {}");
  assert.deepEqual(c.provenance.variables, { since: 1 });
});

test("it reads every page of the window, not only the first", async () => {
  const pages = [at(1000, -10), [...at(40, -10), -300]];
  let call = 0;
  const f = (async () =>
    new Response(JSON.stringify({ data: { fillQualities: (pages[call++] ?? []).map((b) => ({ makerAdverseDeviationBps: b })) } }), {
      status: 200,
    })) as unknown as typeof fetch;
  const c = await calibrate(7, "https://x", new Date(0), f);
  assert.equal(call, 2);
  assert.equal(c.samples, 1041);
  assert.ok(c.p99Bps! <= -10);
  assert.match(c.provenance.query, /makerAdverseDeviationBps/);
  assert.match(c.provenance.query, /referenceAgeSeconds_gte: 0/, "unscored fills stay out of the sample");
});

test("MIN_SAMPLES is still the cold-start line", () => {
  assert.equal(calibrateFrom(at(MIN_SAMPLES, -5), 7, provenance).calibrated, true);
  assert.equal(calibrateFrom(at(MIN_SAMPLES - 1, -5), 7, provenance).calibrated, false);
});
