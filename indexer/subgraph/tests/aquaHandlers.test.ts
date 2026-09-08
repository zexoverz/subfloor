import { assert, createMockedFunction, describe, newMockEvent, test } from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { Docked, Pulled, Pushed } from "../generated/Aqua/Aqua";
import { handleDocked, handlePulled, handlePushed } from "../src/aqua";

/// The three Aqua handlers that have never executed on a synced deployment.
///
/// The old Aqua had zero logs — nothing was ever shipped to it — so every version of this subgraph
/// that reached chain head did so without running any of these. Every version carrying the new Aqua,
/// which does emit, never advanced past its start block. That makes these three the remaining
/// suspects, and this file runs them.

const MAKER = "0xaf6b337440ffea63c47f077eee2663987aeec33f";
const APP = "0x03189d102286fa8cdd0fbf3578b492e67e665a27";
const TOKEN = "0x90dcee47dc225832b8bbd7eb8eeac60766d2d1ad";
const HASH = "0x1111111111111111111111111111111111111111111111111111111111111111";

function mockToken(addr: string, name: string, symbol: string, decimals: i32): void {
  const a = Address.fromString(addr);
  createMockedFunction(a, "name", "name():(string)").returns([ethereum.Value.fromString(name)]);
  createMockedFunction(a, "symbol", "symbol():(string)").returns([ethereum.Value.fromString(symbol)]);
  createMockedFunction(a, "decimals", "decimals():(uint8)").returns([
    ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(decimals)),
  ]);
}

function base(): ethereum.Event {
  const e = newMockEvent();
  e.parameters = new Array();
  return e;
}

describe("the Aqua handlers that have never run in production", () => {
  test("handlePushed reads the token and does not trap", () => {
    mockToken(TOKEN, "SUBFLOOR Test USD", "tUSDC", 6);

    const e = changetype<Pushed>(base());
    e.parameters.push(new ethereum.EventParam("maker", ethereum.Value.fromAddress(Address.fromString(MAKER))));
    e.parameters.push(new ethereum.EventParam("app", ethereum.Value.fromAddress(Address.fromString(APP))));
    e.parameters.push(new ethereum.EventParam("strategyHash", ethereum.Value.fromFixedBytes(Bytes.fromHexString(HASH))));
    e.parameters.push(new ethereum.EventParam("token", ethereum.Value.fromAddress(Address.fromString(TOKEN))));
    e.parameters.push(new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1000))));

    handlePushed(e);
    assert.fieldEquals("Token", TOKEN, "symbol", "tUSDC");
    assert.fieldEquals("Token", TOKEN, "decimals", "6");
  });

  test("handlePulled does not trap", () => {
    mockToken(TOKEN, "SUBFLOOR Test USD", "tUSDC", 6);

    const e = changetype<Pulled>(base());
    e.parameters.push(new ethereum.EventParam("maker", ethereum.Value.fromAddress(Address.fromString(MAKER))));
    e.parameters.push(new ethereum.EventParam("app", ethereum.Value.fromAddress(Address.fromString(APP))));
    e.parameters.push(new ethereum.EventParam("strategyHash", ethereum.Value.fromFixedBytes(Bytes.fromHexString(HASH))));
    e.parameters.push(new ethereum.EventParam("token", ethereum.Value.fromAddress(Address.fromString(TOKEN))));
    e.parameters.push(new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(5))));

    handlePulled(e);
    assert.assertTrue(true);
  });

  test("handleDocked for a strategy this subgraph never saw shipped returns rather than inventing one", () => {
    const e = changetype<Docked>(base());
    e.parameters.push(new ethereum.EventParam("maker", ethereum.Value.fromAddress(Address.fromString(MAKER))));
    e.parameters.push(new ethereum.EventParam("app", ethereum.Value.fromAddress(Address.fromString(APP))));
    e.parameters.push(new ethereum.EventParam("strategyHash", ethereum.Value.fromFixedBytes(Bytes.fromHexString(HASH))));

    handleDocked(e);
    assert.entityCount("Strategy", 0);
  });
});
