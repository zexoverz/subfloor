import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { composeBook, bounds, opcodesOf } from "../src/compose/book.ts";

/// The program the chain is running, read out of the `Shipped` log at Base Sepolia block 46533422.
///
/// The composer is checked against this rather than against a value the composer produced, because
/// the point of the check is that the TypeScript builder and `ConcentratedBook.build` in Solidity
/// agree about a wire format neither of them owns. A test that compares the composer to itself
/// proves only that it is deterministic.
const ON_CHAIN_PROGRAM = "0x020800000000000000019c0202587003000bb8514000000000000000000000000000000000000000000000000000002d2abf23404000000000000000000000000000000000000000000000000000002d64b4a3cf0d";

const LIVE = {
  referencePrice: 2478669714n,
  spreadBps: 50,
  feeBps: 3000,
  decayPeriodSeconds: 600,
  salt: 1n,
};

describe("the composer emits what the contract emits", () => {
  test("byte for byte, against the program that is live", () => {
    assert.equal(composeBook(LIVE), ON_CHAIN_PROGRAM);
  });

  test("the instructions, in the order the VM runs them", () => {
    // Salt, Decay, FeeFlatIn, XYCConcentrateSwap. Decay outside the fee: both wrap the rest of the
    // program, and the offsets Decay stores have to include the fee the taker actually paid.
    assert.deepEqual(opcodesOf(composeBook(LIVE)), [0x02, 0x9c, 0x70, 0x51]);
  });

  test("the range is symmetric around the reference in sqrt space", () => {
    const { lo, hi } = bounds(LIVE.referencePrice, LIVE.spreadBps);
    assert.ok(lo < hi);
    // sqrt(p*0.995) and sqrt(p*1.005), so the product is p to within integer truncation.
    const product = (lo * hi) / 10n ** 18n;
    const diff = product > LIVE.referencePrice ? product - LIVE.referencePrice : LIVE.referencePrice - product;
    assert.ok(diff * 10_000n / LIVE.referencePrice < 2n, "the range is not centred on the reference");
  });
});

describe("the composer refuses what cannot be shipped", () => {
  test("a zero reference is not a book", () => {
    assert.throws(() => composeBook({ ...LIVE, referencePrice: 0n }));
  });

  test("a spread of the whole range is not a book", () => {
    assert.throws(() => composeBook({ ...LIVE, spreadBps: 10_000 }));
  });

  test("a different salt is a different order, which is the point of having one", () => {
    assert.notEqual(composeBook(LIVE), composeBook({ ...LIVE, salt: 2n }));
  });
});
