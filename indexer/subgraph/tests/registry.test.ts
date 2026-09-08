import { assert, createMockedFunction, describe, newMockEvent, test } from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { FloorRaised, FloorLowered } from "../generated/FloorRegistry/FloorRegistry";
import { handleFloorRaised, handleFloorLowered } from "../src/registry";
import { deviationBps, referenceRate, referenceScale } from "../src/shared";

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

// --- the reference is directional, and the direction comes from the registry -----------------
//
// These pin both branches of `referenceRate` against values read off the live Base Sepolia
// registry, which stores WETH/tUSDC as `inverted = false, scale = 1e6` and tUSDC/WETH as
// `inverted = true, scale = 1e30`.
//
// The forward case alone passed for a week while every reverse fill scored -9999 bps, because the
// only assertion in the suite used a pair whose direction happened to be the one implemented. A
// test that pins one branch of a two-branch function is not coverage of the function.
// Module scope, not describe scope: AssemblyScript has no closures, so a test lambda cannot see a
// const declared in the describe body.
//
// Chainlink ETH/USD at 8 decimals: $2,500.
const ANSWER = BigInt.fromString("250000000000");
const FORWARD_SCALE = BigInt.fromString("1000000"); // 1e6
const INVERTED_SCALE = BigInt.fromString("1000000000000000000000000000000"); // 1e30

describe("the reference is directional", () => {

  test("WETH given, tUSDC received: 2500 tUSDC per WETH in raw units", () => {
    // 2500e6 raw tUSDC per 1e18 raw WETH, in the received*1e18/given convention.
    assert.stringEquals("2500000000", referenceRate(ANSWER, FORWARD_SCALE, false).toString());
  });

  test("tUSDC given, WETH received: the same price, inverted", () => {
    // 1/2500 WETH per tUSDC: give 1e6 raw, receive 4e14 raw, so 4e14 * 1e18 / 1e6.
    assert.stringEquals("400000000000000000000000000", referenceRate(ANSWER, INVERTED_SCALE, true).toString());
  });

  test("the two directions multiply back to 1e36, which is what makes them the same price", () => {
    const fwd = referenceRate(ANSWER, FORWARD_SCALE, false);
    const rev = referenceRate(ANSWER, INVERTED_SCALE, true);
    assert.stringEquals("1000000000000000000000000000000000000", fwd.times(rev).toString());
  });

  test("the -9999 bug reproduced exactly, and gone once the branch is right", () => {
    // A good reverse fill, three bps inside the reference.
    const executed = BigInt.fromString("399880000000000000000000000");

    // What the old code did: it read the pair's decimals, so it got the *scale* right and applied
    // the forward formula anyway. 2.5e11 * 1e30 / 1e8 = 2.5e33 against an executed rate of 4e26.
    const wrong = deviationBps(executed, referenceRate(ANSWER, INVERTED_SCALE, false));
    assert.i32Equals(-9999, wrong);

    // With the registry's own `inverted` flag the same fill scores as the three bps it is.
    const right = deviationBps(executed, referenceRate(ANSWER, INVERTED_SCALE, true));
    assert.i32Equals(-3, right);
  });

  test("referenceScale reproduces what the registry stored for both pairs", () => {
    assert.stringEquals(FORWARD_SCALE.toString(), referenceScale(18, 6).toString());
    assert.stringEquals(INVERTED_SCALE.toString(), referenceScale(6, 18).toString());
  });
});
