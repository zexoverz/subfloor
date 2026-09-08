import { assert, describe, newMockEvent, test } from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { Shipped } from "../generated/Aqua/Aqua";
import { handleShipped } from "../src/aqua";
import { classify, decode, familiesOf, unwrapShipped } from "../src/decoder";

/// Calls the handler with a real `Shipped` payload.
///
/// The subgraph would not advance past its start block on the deployment that has Shipped events,
/// while every deployment without them synced fine. graph-node commits in batches, so a handler that
/// traps rolls the whole batch back and `_meta` never moves — which is indistinguishable from never
/// starting. This runs the same handler locally so the trap is a stack trace instead of a guess.

const MAKER = "0xaf6b337440ffea63c47f077eee2663987aeec33f";
const APP = "0x03189d102286fa8cdd0fbf3578b492e67e665a27";

/// A real `Shipped` payload, captured from Base Sepolia block 46533422.
///
/// It replaced a hand-built one whose `data` was 85 bytes of program with no token pair in front of
/// it. That fixture is not a shape Aqua ever emits, and because the decoder was written against it,
/// both agreed with each other and disagreed with the chain — five of six live strategies decoded
/// into instructions nobody shipped and a concentrated book was classified as pegged.
const BLOB =
  "0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000af6b337440ffea63c47f077eee2663987aeec33f40000000002800280028002800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000007d420000000000000000000000000000000000000690dcee47dc225832b8bbd7eb8eeac60766d2d1ad020800000000000000019c0202587003000bb8514000000000000000000000000000000000000000000000000000002d2abf23404000000000000000000000000000000000000000000000000000002d64b4a3cf0d000000";

function shippedEvent(strategy: string): Shipped {
  const e = changetype<Shipped>(newMockEvent());
  e.parameters = new Array();
  e.parameters.push(new ethereum.EventParam("maker", ethereum.Value.fromAddress(Address.fromString(MAKER))));
  e.parameters.push(new ethereum.EventParam("app", ethereum.Value.fromAddress(Address.fromString(APP))));
  e.parameters.push(
    new ethereum.EventParam(
      "strategyHash",
      ethereum.Value.fromFixedBytes(Bytes.fromHexString("0x" + "11".repeat(32))),
    ),
  );
  e.parameters.push(new ethereum.EventParam("strategy", ethereum.Value.fromBytes(Bytes.fromHexString(strategy))));
  return e;
}

describe("handleShipped, against a real payload", () => {
  test("does not trap, and writes the strategy it decoded", () => {
    handleShipped(shippedEvent(BLOB));

    const id = MAKER + APP.slice(2) + "11".repeat(32);
    assert.fieldEquals("Strategy", id, "classification", "CONCENTRATED");
    assert.fieldEquals("Strategy", id, "programWrappedInOrder", "true");
    assert.fieldEquals("Strategy", id, "decodeError", "");
    assert.fieldEquals("Maker", MAKER, "strategiesActive", "1");
  });

  test("a blob that is not an Order is taken as raw bytecode rather than dropped", () => {
    handleShipped(shippedEvent("0x0208000000000000002a9c02"));
    // No assertion on contents; the point is that it returns rather than traps.
    assert.assertTrue(true);
  });

  test("an empty blob does not trap", () => {
    handleShipped(shippedEvent("0x"));
    assert.assertTrue(true);
  });
});

// --- the blob a live deployment actually emitted -------------------------------------------
//
// Captured from the `Shipped` log at Base Sepolia block 46533422, the ship that put the current
// book on the redeployed router. Not hand-built: the fixtures already in this file were, and they
// were built without the forty-byte token pair that `data` really carries, so they passed while
// five of the six live strategies decoded into instructions nobody sent.
const LIVE_BLOB = Bytes.fromHexString(BLOB);

describe("the blob a live ship actually emitted", () => {
  test("the program is Salt, Decay, FeeFlatIn, XYCConcentrateSwap and nothing else", () => {
    const s = unwrapShipped(LIVE_BLOB);
    assert.assertTrue(s.wrappedInOrder);

    const d = decode(s.program);
    assert.i32Equals(4, d.steps.length);
    assert.i32Equals(0x02, d.steps[0].opcode);
    assert.i32Equals(0x9c, d.steps[1].opcode);
    assert.i32Equals(0x70, d.steps[2].opcode);
    assert.i32Equals(0x51, d.steps[3].opcode);
  });

  test("the token pair comes out of data and stays out of the program", () => {
    const s = unwrapShipped(LIVE_BLOB);
    assert.i32Equals(40, s.pair.length);
    assert.stringEquals(
      "0x420000000000000000000000000000000000000690dcee47dc225832b8bbd7eb8eeac60766d2d1ad",
      s.pair.toHexString(),
    );
    // The failure this pins: with the pair left in, the first opcode read is 0x42 and the program
    // decodes to fifteen steps beginning with InvalidateTokenOut.
    assert.assertTrue(s.program.length == 85);
  });

  test("it classifies as the concentrated book it is", () => {
    const s = unwrapShipped(LIVE_BLOB);
    const d = decode(s.program);
    assert.stringEquals("CONCENTRATED", classify(familiesOf(d.steps)));
  });
});
