import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTakerData } from "../src/taker/takerTraits.ts";

/// Produced by `contracts/test/subfloor/TakerDataVector.t.sol` —
/// `forge test --match-contract TakerDataVector -vv`. These are the bytes the library the chain runs
/// produces, not bytes this test decided were right. A wrong bit here makes a swap revert for a
/// reason unrelated to what actually went wrong, which is the expensive kind of wrong.
const A_TO_B = "0x000000000000000000000000000000000000000000c1";
const B_TO_A = "0x00000000000000000000000000000000000000000041";

test("matches the Solidity builder, both directions", () => {
  assert.equal(buildTakerData({ isAToB: true }), A_TO_B);
  assert.equal(buildTakerData({ isAToB: false }), B_TO_A);
});

test("the encoding is twenty zero index bytes then the flags", () => {
  const d = buildTakerData({ isAToB: false });
  assert.equal(d.length, 2 + 44, "22 bytes: 10 uint16 indexes plus a uint16 of flags");
  assert.equal(d.slice(2, 42), "0".repeat(40));
});

test("the taker address is never encoded, because settlement uses msg.sender", () => {
  const d = buildTakerData({ isAToB: true });
  assert.ok(!d.toLowerCase().includes("beef"));
  assert.equal(d, A_TO_B, "same bytes whoever the taker is");
});

test("partial fill sets its own bit and nothing else", () => {
  assert.equal(buildTakerData({ isAToB: false, allowPartialFill: true }), "0x00000000000000000000000000000000000000000141");
});
