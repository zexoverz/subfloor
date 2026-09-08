import { assert, describe, newMockEvent, test } from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { Shipped } from "../generated/Aqua/Aqua";
import { handleShipped } from "../src/aqua";

/// Calls the handler with a real `Shipped` payload.
///
/// The subgraph would not advance past its start block on the deployment that has Shipped events,
/// while every deployment without them synced fine. graph-node commits in batches, so a handler that
/// traps rolls the whole batch back and `_meta` never moves — which is indistinguishable from never
/// starting. This runs the same handler locally so the trap is a stack trace instead of a guess.

const MAKER = "0xaf6b337440ffea63c47f077eee2663987aeec33f";
const APP = "0x03189d102286fa8cdd0fbf3578b492e67e665a27";

const BLOB =
  "0x0000000000000000000000000000000000000000000000000000000000000020" +
  "000000000000000000000000441ee52d939e46a33919c4295e88d32458797503" +
  "0000000000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000000000000000000000060" +
  "0000000000000000000000000000000000000000000000000000000000000055" +
  "0208000000000000002a9c0202587003000bb85140000000000000000000000000000000000000000000000002b42709c936c81e09000000000000000000000000000000000000000000000002b79f382c074475a00000000000000000000000";

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
