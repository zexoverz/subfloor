import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decodeRevert, FLOOR_REASONS } from "./refusals.ts";
import { REVERT_REASONS } from "./revert-selectors.ts";

/// The payload below was produced by `cast abi-encode` against the contract's own error signature,
/// carrying the arguments of the refusal this deployment actually produced:
/// SettledBelowFloor(vault, WETH, tUSDC, executionRate 2491790571, floorRate 2495000000).
const SETTLED_BELOW_FLOOR =
  "0x027e4c46" +
  "000000000000000000000000af6b337440ffea63c47f077eee2663987aeec33f" +
  "0000000000000000000000004200000000000000000000000000000000000006" +
  "00000000000000000000000090dcee47dc225832b8bbd7eb8eeac60766d2d1ad" +
  "000000000000000000000000000000000000000000000000000000009485b4eb" +
  "0000000000000000000000000000000000000000000000000000000094b6adc0";

describe("decoding a refusal", () => {
  test("a real SettledBelowFloor payload decodes to its name and both rates", () => {
    const d = decodeRevert(SETTLED_BELOW_FLOOR as `0x${string}`);
    assert.equal(d.reason, "SettledBelowFloor");
    assert.equal(d.executionRate, "2491790571");
    assert.equal(d.floorRate, "2495000000");
    assert.equal(d.tokenIn?.toLowerCase(), "0x4200000000000000000000000000000000000006");
    assert.equal(d.tokenOut?.toLowerCase(), "0x90dcee47dc225832b8bbd7eb8eeac60766d2d1ad");
  });

  test("the refused rate is below the floor, which is the whole claim", () => {
    const d = decodeRevert(SETTLED_BELOW_FLOOR as `0x${string}`);
    assert.ok(BigInt(d.executionRate!) < BigInt(d.floorRate!));
  });

  test("a floor refusal counts on the headline and a malformed mandate does not", () => {
    // Both are reverts; only one is the guard holding a line.
    assert.ok(FLOOR_REASONS.has("SettledBelowFloor"));
    assert.ok(!FLOOR_REASONS.has("BadMandateSignature"));
  });

  test("an unrecognised selector is reported as unknown rather than guessed at", () => {
    const d = decodeRevert("0xdeadbeef" + "00".repeat(32) as `0x${string}`);
    assert.equal(d.reason, null);
    assert.equal(d.selector, "0xdeadbeef");
  });

  test("empty and truncated revert data do not throw", () => {
    assert.equal(decodeRevert(null).reason, null);
    assert.equal(decodeRevert("0x" as `0x${string}`).reason, null);
    // A selector that says SettledBelowFloor with no arguments behind it: name it, claim no numbers.
    const short = decodeRevert("0x027e4c46" as `0x${string}`);
    assert.equal(short.reason, "SettledBelowFloor");
    assert.equal(short.executionRate, undefined);
  });

  test("the generated table carries the errors the guard actually reverts with", () => {
    assert.equal(REVERT_REASONS["0x027e4c46"], "SettledBelowFloor");
    assert.equal(REVERT_REASONS["0x50ee0156"], "StaleReference");
    assert.equal(REVERT_REASONS["0xb0dc091d"], "NoGuardianRegistered");
  });
});

/// The screen and the counter must agree on what a refusal is.
///
/// `src/lib/refusal.ts` decodes the revert for the card Zikri renders; this module classifies every
/// revert the guard can produce so the counter can separate a floor holding from a malformed call.
/// They are deliberately separate — the server has no business importing browser helpers — which
/// means nothing stops them drifting apart except this.
///
/// It is not hypothetical: the table in this module was hand-written and had `SettledBelowFloor` at
/// `0x73d1c7ef`, while the screen had the right one all along. The counter would have reported zero
/// refusals against a card rendering one.
import { SETTLED_BELOW_FLOOR_SELECTOR } from "../../src/lib/refusal.ts";

test("the counter and the refusal card agree on the selector", () => {
  assert.equal(REVERT_REASONS[SETTLED_BELOW_FLOOR_SELECTOR], "SettledBelowFloor");
});
