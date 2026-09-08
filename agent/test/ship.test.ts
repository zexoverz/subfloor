import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { encodeShippedOrder, shipCalldata, dockCalldata, ShipError, type Mandate } from "../src/vault/ship.ts";
import { buildOrder } from "../../sdk/src/index.ts";

const WETH = "0x4200000000000000000000000000000000000006";
const TUSDC = "0x90dceE47Dc225832B8BbD7Eb8EeAC60766D2D1aD";
const VAULT = "0xaf6b337440FFEa63c47f077eee2663987aEEc33f";
const ROUTER = "0x03189D102286fa8cDd0fBF3578B492e67e665A27";

const PROGRAM =
  "0x020800000000000000019c0202587003000bb8514000000000000000000000000000000000000000000000000000002d2abf23404000000000000000000000000000000000000000000000000000002d64b4a3cf0d" as const;

/// The blob `Aqua.ship` actually carried, read out of the `Shipped` log at Base Sepolia block
/// 46533422. The encoder is checked against this rather than against its own output, because the
/// thing being tested is agreement with Solidity about a layout neither side owns — and this repo
/// has already shipped a decoder and a fixture that agreed with each other and not with the chain.
const ON_CHAIN_BLOB = "0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000af6b337440ffea63c47f077eee2663987aeec33f40000000002800280028002800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000007d420000000000000000000000000000000000000690dcee47dc225832b8bbd7eb8eeac60766d2d1ad020800000000000000019c0202587003000bb8514000000000000000000000000000000000000000000000000000002d2abf23404000000000000000000000000000000000000000000000000000002d64b4a3cf0d000000";

const MANDATE: Mandate = {
  delegate: "0x9ebdC8ACc879a8284Ae5B3CecfbD280ec307aFA3",
  app: ROUTER,
  tokens: [WETH, TUSDC],
  maxAmounts: [10n ** 18n, 10n ** 12n],
  nonce: 6n,
  expiry: 4102444800n,
};

describe("the shipped blob matches what the chain carried", () => {
  test("byte for byte", () => {
    const order = buildOrder({ maker: VAULT, tokenA: WETH, tokenB: TUSDC, program: PROGRAM });
    assert.equal(encodeShippedOrder(order).toLowerCase(), ON_CHAIN_BLOB.toLowerCase());
  });
});

describe("ship refuses what would revert on chain", () => {
  const base = {
    maker: VAULT, tokenA: WETH, tokenB: TUSDC, program: PROGRAM,
    app: ROUTER as `0x${string}`,
    tokens: [WETH, TUSDC] as `0x${string}`[],
    amounts: [4_000_000_000_000_000n, 10_000_000_000n],
    mandate: MANDATE,
    signature: ("0x" + "11".repeat(65)) as `0x${string}`,
  };

  test("a well-formed ship encodes", () => {
    assert.ok(shipCalldata(base).startsWith("0x"));
  });

  test("an amount above the mandate cap is caught before it costs a nonce", () => {
    assert.throws(
      () => shipCalldata({ ...base, amounts: [2n * 10n ** 18n, 10_000_000_000n] }),
      (e: Error) => e instanceof ShipError && /above the mandate cap/.test(e.message),
    );
  });

  test("a token the mandate does not cover is caught", () => {
    assert.throws(
      () => shipCalldata({ ...base, mandate: { ...MANDATE, tokens: [WETH], maxAmounts: [10n ** 18n] } }),
      (e: Error) => e instanceof ShipError && /does not cover/.test(e.message),
    );
  });

  test("a mandate for a different app is caught, because it is the binding that matters", () => {
    assert.throws(
      () => shipCalldata({ ...base, mandate: { ...MANDATE, app: WETH } }),
      (e: Error) => e instanceof ShipError && /authorises app/.test(e.message),
    );
  });

  test("mismatched tokens and amounts are caught", () => {
    assert.throws(() => shipCalldata({ ...base, amounts: [1n] }), ShipError);
  });
});

describe("dock", () => {
  test("encodes with the pair, which is what releases the inventory", () => {
    const cd = dockCalldata(ROUTER, ("0x" + "ab".repeat(32)) as `0x${string}`, [WETH, TUSDC]);
    assert.ok(cd.startsWith("0x"));
    assert.ok(cd.length > 200);
  });
});
