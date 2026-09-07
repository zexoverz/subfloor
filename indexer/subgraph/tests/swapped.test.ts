import { assert, createMockedFunction, describe, newMockEvent, test } from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { Swapped } from "../generated/FloorRouter/FloorRouter";
import { handleSwapped } from "../src/router";

/// `handleSwapped` is where the subgraph stops.
///
/// Measured, not guessed: block 46514610 carries the first `Swapped` on the deployed router, and
/// every deployment halts at 46514340 — the last block before it with anything to index. Adding
/// `receipt: true` did not change that, so the trap is in the handler body.

const TAKER = "0x8960d9c818df91e582702f6ec7e3d058244e992b";
const MAKER = "0xaf6b337440ffea63c47f077eee2663987aeec33f";
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

function swapped(tokenIn: string, tokenOut: string, amountIn: BigInt, amountOut: BigInt): Swapped {
  const e = changetype<Swapped>(newMockEvent());
  e.parameters = new Array();
  e.parameters.push(new ethereum.EventParam("orderHash", ethereum.Value.fromFixedBytes(Bytes.fromHexString("0x" + "22".repeat(32)))));
  e.parameters.push(new ethereum.EventParam("maker", ethereum.Value.fromAddress(Address.fromString(MAKER))));
  e.parameters.push(new ethereum.EventParam("taker", ethereum.Value.fromAddress(Address.fromString(TAKER))));
  e.parameters.push(new ethereum.EventParam("tokenIn", ethereum.Value.fromAddress(Address.fromString(tokenIn))));
  e.parameters.push(new ethereum.EventParam("tokenOut", ethereum.Value.fromAddress(Address.fromString(tokenOut))));
  e.parameters.push(new ethereum.EventParam("amountIn", ethereum.Value.fromUnsignedBigInt(amountIn)));
  e.parameters.push(new ethereum.EventParam("amountOut", ethereum.Value.fromUnsignedBigInt(amountOut)));
  return e;
}

describe("handleSwapped, on the fills that actually happened", () => {
  test("tUSDC in, WETH out — the direction with a 4e26 rate", () => {
    mockToken(WETH, "WETH", 18);
    mockToken(TUSDC, "tUSDC", 6);
    handleSwapped(swapped(TUSDC, WETH, BigInt.fromI32(1200000), BigInt.fromString("481201465082246")));
    assert.entityCount("Swap", 1);
    assert.entityCount("FillQuality", 1);
  });

  test("WETH in, tUSDC out — the other direction", () => {
    mockToken(WETH, "WETH", 18);
    mockToken(TUSDC, "tUSDC", 6);
    handleSwapped(swapped(WETH, TUSDC, BigInt.fromString("180000000000000"), BigInt.fromI32(448607)));
    assert.entityCount("FillQuality", 1);
  });

  test("a zero amountIn does not divide by zero", () => {
    mockToken(WETH, "WETH", 18);
    mockToken(TUSDC, "tUSDC", 6);
    handleSwapped(swapped(TUSDC, WETH, BigInt.zero(), BigInt.fromI32(1)));
    assert.assertTrue(true);
  });
});
