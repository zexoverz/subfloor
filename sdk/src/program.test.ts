import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deadline, feeFlatIn, notionalThrottle, ProgramError, Program, requireFreshReference,
  staticBalances, uint, validateSeriesEpoch, xycConcentrateSwap,
} from "./program.ts";

/// The vectors below were produced by the instruction libraries the VM actually runs, printed by
/// `contracts/test/subfloor/EncodingVectors.t.sol`. Regenerate them with
/// `forge test --match-contract EncodingVectors -vv` and paste. Checking this encoder against
/// hand-written expectations would only prove it agrees with whoever wrote the expectations.

const VECTORS: [string, Uint8Array, string][] = [
  ["deadline_1700000000", deadline(1_700_000_000), "0x2005006553f100"],
  ["feeFlatIn_30bps", feeFlatIn(30), "0x700300001e"],
  [
    "xycConcentrate_1e18_2e18",
    xycConcentrateSwap(10n ** 18n, 2n * 10n ** 18n),
    "0x51400000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000001bc16d674ec80000",
  ],
  [
    "staticBalances_1e18_2500e6",
    staticBalances(10n ** 18n, 2500n * 10n ** 6n),
    "0x90400000000000000000000000000000000000000000000000000de0b6b3a7640000000000000000000000000000000000000000000000000000000000009502f900",
  ],
  ["seriesEpoch_7_3", validateSeriesEpoch(7, 3), "0x48080000000700000003"],
  ["freshReference_2464", requireFreshReference(2464), "0x2204000009a0"],
  ["notionalThrottle_3600_1e21", notionalThrottle(3600, 10n ** 21n), "0x271400000e10000000000000003635c9adc5dea00000"],
];

const toHex = (b: Uint8Array) => "0x" + [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

for (const [name, produced, expected] of VECTORS) {
  test(`matches the VM's own encoding: ${name}`, () => {
    assert.equal(toHex(produced), expected);
  });
}

test("big-endian, fixed width, no ABI padding", () => {
  assert.equal(toHex(uint(1, 5)), "0x0000000001");
  assert.equal(toHex(uint(0xff, 1)), "0xff");
});

test("a value too wide for its field throws instead of truncating", () => {
  // Silently narrowing a deadline or a fee produces a program that does something other than what
  // the caller asked for, and it would still be a valid program the VM happily runs.
  assert.throws(() => uint(256, 1), ProgramError);
  assert.throws(() => deadline(2n ** 41n), ProgramError);
  assert.throws(() => uint(-1, 4), ProgramError);
});

test("a program is its instructions in order, and nothing else", () => {
  const p = new Program().push(deadline(1_700_000_000)).push(feeFlatIn(30));
  assert.equal(p.hex(), "0x2005006553f100" + "700300001e");
});

test("an empty program is empty rather than a header with nothing after it", () => {
  assert.equal(new Program().hex(), "0x");
});
