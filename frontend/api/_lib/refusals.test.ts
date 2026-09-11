import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Address, Hex } from "viem";
import { buildReport, decodeRevert, FLOOR_REASONS, type RawTx } from "./refusals.ts";
import { REVERT_REASONS } from "./revert-selectors.ts";
import { CHAIN } from "./chain.ts";

/// The attack leg of the lowering demo on 11 Sep, tx 0x7a6c423e…, replayed at the block before it
/// landed: BadGuardianSignature(vault 0x1168…, guardian 0x9ebd…, digest 0x7287bdfa…). The house
/// agent's key signed a floor lowering and the registry wanted the guardian's.
const BAD_GUARDIAN =
  "0x5760fd80" +
  "0000000000000000000000001168c48a74055486bc4d1e7036d3b1ac4bb75586" +
  "0000000000000000000000009ebdc8acc879a8284ae5b3cecfbd280ec307afa3" +
  "7287bdfa3c9a19299f45a4cfb5b5b64fed64c78eeda4936bc3bc72734ff56b4d";

/// A guardian's own lowering sent with a nonce already spent: WrongNonce(expected 1, got 0).
const WRONG_NONCE =
  "0xa3c996d3" +
  "0000000000000000000000000000000000000000000000000000000000000001" +
  "0000000000000000000000000000000000000000000000000000000000000000";

function tx(to: Address, status: number, hash: string, block: number): RawTx {
  return { block_number: block, hash: hash as Hex, status, from: "0xffcc8ee26a9aa8c3b4dddbf4a5ae957cbd509242", to, input: "0x" };
}

describe("a floor lowering the registry refused", () => {
  test("a real BadGuardianSignature payload names the vault and the guardian it wanted", () => {
    const d = decodeRevert(BAD_GUARDIAN as Hex);
    assert.equal(d.reason, "BadGuardianSignature");
    assert.equal(d.recipient?.toLowerCase(), "0x1168c48a74055486bc4d1e7036d3b1ac4bb75586");
    assert.equal(d.guardian?.toLowerCase(), "0x9ebdc8acc879a8284ae5b3cecfbd280ec307afa3");
  });

  test("lands in weakenings, and leaves the fills, the headline and the tape the router's", async () => {
    const txs = [
      tx(CHAIN.router, 1, "0x01", 10),
      tx(CHAIN.router, 0, "0x02", 11),
      tx(CHAIN.registry, 0, "0x03", 12),
      // The guardian's own lowering that went through: a registry success, which is not a fill.
      tx(CHAIN.registry, 1, "0x04", 13),
    ];
    const revertOf = async (t: RawTx) => (t.hash === "0x02" ? SETTLED_BELOW_FLOOR : t.hash === "0x03" ? BAD_GUARDIAN : null) as Hex | null;
    const r = await buildReport(txs, revertOf);
    assert.equal(r.fills, 1);
    assert.equal(r.floorRefusals, 1);
    assert.deepEqual(r.recent.map((x) => x.hash), ["0x02"]);
    assert.equal(r.weakeningRefusals, 1);
    assert.equal(r.weakenings[0]?.hash, "0x03");
    assert.equal(r.weakenings[0]?.guardian?.toLowerCase(), "0x9ebdc8acc879a8284ae5b3cecfbd280ec307afa3");
  });

  test("a guardian's own lowering that failed on a stale nonce is not an attack", async () => {
    const r = await buildReport([tx(CHAIN.registry, 0, "0x05", 14)], async () => WRONG_NONCE as Hex);
    assert.equal(r.weakeningRefusals, 0);
    assert.deepEqual(r.weakenings, []);
  });
});

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
