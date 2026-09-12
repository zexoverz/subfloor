import { test } from "node:test";
import assert from "node:assert/strict";
import {
  configFromEnv,
  decodeFloorRevert,
  DOCKED_TOPIC0,
  edgeBpsOf,
  liveFrom,
  rateOf,
  referenceRateFor,
  SHIPPED_TOPIC0,
} from "../src/taker/bot.ts";
import { decodeShipped, isAToB, pairOf } from "../src/taker/order.ts";

/// The blob below is a real `Shipped` payload, from
/// `contracts/test/subfloor/ShippedBlobVector.t.sol`. Reading an order off the chain is the whole
/// point of this module — rebuilding one off-chain has to match byte for byte or it quotes zero,
/// which looks like an empty book rather than like a bug.
const SHIPPED =
  "0x0000000000000000000000000000000000000000000000000000000000000020" +
  "000000000000000000000000441ee52d939e46a33919c4295e88d32458797503" +
  "0000000000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000000000000000000000060" +
  "0000000000000000000000000000000000000000000000000000000000000055" +
  "0208000000000000002a9c0202587003000bb85140000000000000000000000000000000000000000000000002b42709c936c81e09000000000000000000000000000000000000000000000002b79f382c074475a00000000000000000000000";

test("an order is read out of the shipped blob, not rebuilt", () => {
  const o = decodeShipped(SHIPPED as `0x${string}`);
  assert.equal(o.maker.toLowerCase(), "0x441ee52d939e46a33919c4295e88d32458797503");
  assert.equal(o.encoded.toLowerCase(), SHIPPED.toLowerCase(), "re-encodes to exactly what Aqua hashed");
});

test("the pair comes from the first forty bytes of data, not from the traits word", () => {
  // Traits here is zero, so anything reading a token out of it would get the zero address and the
  // direction would be wrong on every quote.
  const data = ("0x" + "11".repeat(20) + "22".repeat(20) + "0000") as `0x${string}`;
  const { tokenA, tokenB } = pairOf(data);
  assert.equal(tokenA, "0x" + "11".repeat(20));
  assert.equal(tokenB, "0x" + "22".repeat(20));
  assert.equal(isAToB(data, ("0x" + "11".repeat(20)) as `0x${string}`), true);
  assert.equal(isAToB(data, ("0x" + "22".repeat(20)) as `0x${string}`), false);
});

test("order data too short to carry a pair is refused rather than read past", () => {
  assert.throws(() => pairOf("0x1234" as `0x${string}`), /too short/);
});

test("a rate is received over given, in raw units", () => {
  assert.equal(rateOf(2_500_000_000n, 10n ** 18n), 2_500_000_000n);
  assert.throws(() => rateOf(1n, 0n), /zero given/);
});

test("edge is positive when the quote beats the reference", () => {
  assert.equal(edgeBpsOf(10_100n, 10_000n), 100);
  assert.equal(edgeBpsOf(9_900n, 10_000n), -100);
});

test("the reference rate is inverted for the side being spent", () => {
  // ETH/USD at 2500.00000000, eight-decimal feed, WETH 18, quote 6.
  const answer = 250_000_000_000n;
  const sellingWeth = referenceRateFor(true, answer, 8, 18, 6);
  const buyingWeth = referenceRateFor(false, answer, 8, 18, 6);

  // Give 1e18 WETH-raw, expect 2500e6 quote-raw: rate = 2500e6 * 1e18 / 1e18.
  assert.equal(sellingWeth, 2_500_000_000n);
  // Give 1e6 quote-raw, expect 4e14 WETH-raw: rate = 4e14 * 1e18 / 1e6.
  assert.equal(buyingWeth, 400_000_000_000_000_000_000_000_000n);
});

test("a SettledBelowFloor revert is decoded into the two rates it carries", () => {
  // selector 0x027e4c46 then recipient, tokenIn, tokenOut, executionRate, floorRate
  const data = "0x027e4c46"
    + "0".repeat(24) + "aa".repeat(20)
    + "0".repeat(24) + "bb".repeat(20)
    + "0".repeat(24) + "cc".repeat(20)
    + (398133549917984488716895195n).toString(16).padStart(64, "0")
    + (399972527139550010706335322n).toString(16).padStart(64, "0");

  const floor = decodeFloorRevert({ cause: { data } });
  assert.ok(floor, "the revert should decode");
  assert.equal(floor!.executionRate, 398133549917984488716895195n);
  assert.equal(floor!.floorRate, 399972527139550010706335322n);
});

test("an unrelated revert is not mistaken for a refusal", () => {
  assert.equal(decodeFloorRevert({ cause: { data: "0xdeadbeef" } }), null);
  assert.equal(decodeFloorRevert(new Error("connection reset")), null);
});

/// Which books a taker can see at all. It watched one address, so the house agent could ship for a
/// stranger's vault and nothing ever took it — the owner watched a book nobody filled.
const MAKER_A = ("0x" + "a1".repeat(20)) as `0x${string}`;
const MAKER_B = ("0x" + "b2".repeat(20)) as `0x${string}`;
const word = (v: string | number) => (typeof v === "number" ? v.toString(16) : v.replace(/^0x/, "")).padStart(64, "0");

/// `Shipped(maker, app, strategyHash, bytes strategy)` as Aqua emits it: four words, then the blob's
/// length and the blob. `Docked` is the same three addresses and hash with nothing after them.
function shippedLog(maker: string, hash: string, strategy: string) {
  const body = strategy.replace(/^0x/, "");
  return {
    topic0: SHIPPED_TOPIC0,
    data: ("0x" + word(maker) + word(MAKER_A) + word(hash) + word(128) + word(body.length / 2) + body) as `0x${string}`,
  };
}
const dockedLog = (hash: string) => ({
  topic0: DOCKED_TOPIC0,
  data: ("0x" + word(MAKER_A) + word(MAKER_A) + word(hash)) as `0x${string}`,
});

test("every maker's book is on offer, and only the named ones when the taker is narrowed", () => {
  const logs = [shippedLog(MAKER_A, "0x" + "11".repeat(32), SHIPPED), shippedLog(MAKER_B, "0x" + "22".repeat(32), SHIPPED)];
  assert.equal(liveFrom(logs, []).length, 2, "an empty list means the whole venue");
  assert.deepEqual(
    liveFrom(logs, [MAKER_B]).map((o) => o.strategyHash),
    ["0x" + "22".repeat(32)],
  );
});

test("a docked book is not on offer", () => {
  const hash = "0x" + "33".repeat(32);
  assert.deepEqual(liveFrom([shippedLog(MAKER_A, hash, SHIPPED), dockedLog(hash)], []), []);
});

test("SUBFLOOR_VAULT is a list of makers, and empty is every maker", () => {
  const before = process.env.SUBFLOOR_VAULT;
  try {
    process.env.SUBFLOOR_VAULT = ` ${MAKER_A}, ${MAKER_B} `;
    assert.deepEqual(configFromEnv().vaults, [MAKER_A, MAKER_B]);
    process.env.SUBFLOOR_VAULT = "";
    assert.deepEqual(configFromEnv().vaults, []);
  } finally {
    if (before === undefined) delete process.env.SUBFLOOR_VAULT;
    else process.env.SUBFLOOR_VAULT = before;
  }
});
