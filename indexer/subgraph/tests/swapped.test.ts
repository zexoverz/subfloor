import { assert, createMockedFunction, describe, newMockEvent, test } from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { Swapped } from "../generated/FloorRouter/FloorRouter";
import { handleSwapped } from "../src/router";
import { ETH_USD, eventId } from "../src/shared";
import { ReferenceAnswer, Floor } from "../generated/schema";

/// `handleSwapped` is where the subgraph stops.
///
/// Measured, not guessed: block 46514610 carries the first `Swapped` on the deployed router, and
/// every deployment halts at 46514340 — the last block before it with anything to index. Adding
/// `receipt: true` did not change that, so the trap is in the handler body.

const TAKER = "0x8960d9c818df91e582702f6ec7e3d058244e992b";
const MAKER = "0xaf6b337440ffea63c47f077eee2663987aeec33f";
const WETH = "0x4200000000000000000000000000000000000006";
const TUSDC = "0x90dcee47dc225832b8bbd7eb8eeac60766d2d1ad";
const REGISTRY = "0x47c7abb1ffbf37ed4bcfcb20f6648b5c0cc86123";
const FEED = "0x4adc67696ba383f43dd60a9e78f2c97fbbfc7cb1";

/// The registry's reference configuration, as read off the live Base Sepolia deployment.
///
/// Both directions, with the values the registry actually stored: WETH/tUSDC forward at scale 1e6,
/// tUSDC/WETH inverted at scale 1e30. Mocking only one of them is how the reverse direction went
/// unscored for a week.
/// A live ETH/USD answer, $2,500 at the feed's eight decimals.
///
/// Without this every fill takes the unscored branch, which is what the first version of these
/// tests did: they asserted a FillQuality row appeared and never noticed that referencePrice was
/// zero and the deviation was a default rather than a measurement.
function seedReference(): void {
  const r = new ReferenceAnswer(ETH_USD);
  r.aggregator = Address.fromString(FEED);
  r.answer = BigInt.fromString("250000000000");
  r.updatedAt = BigInt.fromI32(1757000000);
  r.roundId = BigInt.fromI32(1);
  r.blockNumber = BigInt.fromI32(46514610);
  r.save();
}

/// A tolerance-only floor for the maker, which is the shape this deployment actually configures:
/// 100 bps below the reference and no absolute backstop.
///
/// Seeded because without it nothing exercises the difference between the floor that binds and the
/// backstop, and a mutation putting `absoluteRate` back on the row passes every other test.
function seedMakerFloor(): void {
  const id = Bytes.fromHexString(MAKER).concat(Bytes.fromHexString(WETH)).concat(Bytes.fromHexString(TUSDC));
  const f = new Floor(id);
  f.recipient = Bytes.fromHexString(MAKER);
  f.base = Bytes.fromHexString(WETH);
  f.quote = Bytes.fromHexString(TUSDC);
  f.maxAdverseBps = 100;
  f.absoluteRate = BigInt.zero();
  f.updatedAtBlock = BigInt.fromI32(1);
  f.updatedAt = BigInt.fromI32(1);
  f.save();
}

function mockReferenceFeeds(routerAddr: Address): void {
  createMockedFunction(routerAddr, "FLOOR_REGISTRY", "FLOOR_REGISTRY():(address)")
    .returns([ethereum.Value.fromAddress(Address.fromString(REGISTRY))]);

  const sig = "referenceFeed(address,address):(address,bool,uint32,uint8,uint256)";

  createMockedFunction(Address.fromString(REGISTRY), "referenceFeed", sig)
    .withArgs([
      ethereum.Value.fromAddress(Address.fromString(WETH)),
      ethereum.Value.fromAddress(Address.fromString(TUSDC)),
    ])
    .returns([
      ethereum.Value.fromAddress(Address.fromString(FEED)),
      ethereum.Value.fromBoolean(false),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(86400)),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(8)),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromString("1000000")),
    ]);

  createMockedFunction(Address.fromString(REGISTRY), "referenceFeed", sig)
    .withArgs([
      ethereum.Value.fromAddress(Address.fromString(TUSDC)),
      ethereum.Value.fromAddress(Address.fromString(WETH)),
    ])
    .returns([
      ethereum.Value.fromAddress(Address.fromString(FEED)),
      ethereum.Value.fromBoolean(true),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(86400)),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(8)),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromString("1000000000000000000000000000000")),
    ]);
}

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
    const ev = swapped(TUSDC, WETH, BigInt.fromI32(1200000), BigInt.fromString("481201465082246"));
    mockReferenceFeeds(ev.address);
    seedReference();
    seedMakerFloor();
    handleSwapped(ev);
    assert.entityCount("Swap", 1);
    assert.entityCount("FillQuality", 1);

    // The rate itself, and then the score. Asserting only that a FillQuality row exists is what let
    // the reverse direction sit at -9999 bps through a green test run: the row was always written,
    // it was the number in it that was fiction.
    const id = eventId(ev).toHexString();
    assert.fieldEquals("FillQuality", id, "executionRate", "401001220901871666666666666");
    assert.fieldEquals("FillQuality", id, "referencePrice", "400000000000000000000000000");
    assert.fieldEquals("FillQuality", id, "adverseDeviationBps", "25");

    // The same fill from the vault's side. Settlement scores both, and this is the one the product
    // protects — scoring only the taker is what made the headline number a statement about the
    // counterparty rather than about us.
    assert.fieldEquals("FillQuality", id, "maker", MAKER);
    assert.fieldEquals("FillQuality", id, "taker", TAKER);
    // The taker gave 1.2 tUSDC and got 4.812e14 WETH; the maker gave that WETH and got the tUSDC,
    // so its rate is the inverse on the reversed pair.
    assert.fieldEquals("FillQuality", id, "makerExecutionRate", "2493757993");

    // And the two deviations point opposite ways, which is the whole reason both are recorded: a
    // fill the taker beat the reference on is a fill the maker paid through it.
    assert.fieldEquals("FillQuality", id, "adverseDeviationBps", "25");
    assert.fieldEquals("FillQuality", id, "makerAdverseDeviationBps", "-24");

    // The floor that binds, not the backstop. The backstop here is zero; storing it would say this
    // fill was measured against nothing.
    assert.fieldEquals("FillQuality", id, "makerFloorAtFill", "2475000000");
  });

  test("WETH in, tUSDC out — the other direction", () => {
    mockToken(WETH, "WETH", 18);
    mockToken(TUSDC, "tUSDC", 6);
    const ev = swapped(WETH, TUSDC, BigInt.fromString("180000000000000"), BigInt.fromI32(448607));
    mockReferenceFeeds(ev.address);
    seedReference();
    seedMakerFloor();
    handleSwapped(ev);
    assert.entityCount("FillQuality", 1);

    const id = eventId(ev).toHexString();
    assert.fieldEquals("FillQuality", id, "referencePrice", "2500000000");
    assert.fieldEquals("FillQuality", id, "executionRate", "2492261111");
    assert.fieldEquals("FillQuality", id, "adverseDeviationBps", "-30");
  });

  test("a zero amountIn does not divide by zero", () => {
    mockToken(WETH, "WETH", 18);
    mockToken(TUSDC, "tUSDC", 6);
    const ev = swapped(TUSDC, WETH, BigInt.zero(), BigInt.fromI32(1));
    mockReferenceFeeds(ev.address);
    seedReference();
    seedMakerFloor();
    handleSwapped(ev);
    assert.assertTrue(true);
  });
});
