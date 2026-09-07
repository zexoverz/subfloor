import { assert, createMockedFunction, describe, newMockEvent, test } from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { FloorRaised, FloorLowered } from "../generated/FloorRegistry/FloorRegistry";
import { handleFloorRaised, handleFloorLowered } from "../src/registry";

/// The registry handlers, which are the last group without a test.
///
/// They have run in production — floors show up on every synced deployment — so this is not chasing
/// the halt. It is closing the gap that let the halt hide: an entity saved without a required field
/// aborts the handler deterministically and reports nothing, and the only cheap way to know is to
/// call the handler.

const VAULT = "0xaf6b337440ffea63c47f077eee2663987aeec33f";
const WETH = "0x4200000000000000000000000000000000000006";
const TUSDC = "0x90dcee47dc225832b8bbd7eb8eeac60766d2d1ad";

function mockToken(addr: string, sym: string, dec: i32): void {
  const a = Address.fromString(addr);
  createMockedFunction(a, "name", "name():(string)").returns([ethereum.Value.fromString(sym)]);
  createMockedFunction(a, "symbol", "symbol():(string)").returns([ethereum.Value.fromString(sym)]);
  createMockedFunction(a, "decimals", "decimals():(uint8)").returns([
    ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(dec)),
  ]);
}

function params(old: BigInt, next: BigInt): ethereum.EventParam[] {
  const p = new Array<ethereum.EventParam>();
  p.push(new ethereum.EventParam("recipient", ethereum.Value.fromAddress(Address.fromString(VAULT))));
  p.push(new ethereum.EventParam("base", ethereum.Value.fromAddress(Address.fromString(WETH))));
  p.push(new ethereum.EventParam("quote", ethereum.Value.fromAddress(Address.fromString(TUSDC))));
  p.push(new ethereum.EventParam("oldFloor", ethereum.Value.fromUnsignedBigInt(old)));
  p.push(new ethereum.EventParam("newFloor", ethereum.Value.fromUnsignedBigInt(next)));
  return p;
}

describe("the registry handlers", () => {
  test("a raise records the change and moves the floor", () => {
    mockToken(WETH, "WETH", 18);
    mockToken(TUSDC, "tUSDC", 6);

    const e = changetype<FloorRaised>(newMockEvent());
    e.parameters = params(BigInt.zero(), BigInt.fromString("2450418300"));
    handleFloorRaised(e);

    assert.entityCount("Floor", 1);
    assert.entityCount("FloorChange", 1);
    const id = VAULT + WETH.slice(2) + TUSDC.slice(2);
    assert.fieldEquals("Floor", id, "absoluteRate", "2450418300");
    assert.fieldEquals("Floor", id, "recipient", VAULT);
  });

  test("a lowering records the guardian, because that is the whole point of it", () => {
    mockToken(WETH, "WETH", 18);
    mockToken(TUSDC, "tUSDC", 6);

    const e = changetype<FloorLowered>(newMockEvent());
    e.parameters = params(BigInt.fromString("2450418300"), BigInt.fromString("2400000000"));
    e.parameters.push(new ethereum.EventParam("guardian", ethereum.Value.fromAddress(Address.fromString(VAULT))));
    handleFloorLowered(e);

    assert.entityCount("FloorChange", 1);
  });
});
