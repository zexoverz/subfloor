import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MandateBook, MandatesExhausted, issueBatch, mandateDigest } from "../src/vault/mandates.ts";
import { updateQuoteCalldata } from "../src/vault/ship.ts";
import type { Mandate } from "../src/vault/ship.ts";

const VAULT = "0xaf6b337440FFEa63c47f077eee2663987aEEc33f" as const;
const ROUTER = "0x03189D102286fa8cDd0fBF3578B492e67e665A27" as const;
const WETH = "0x4200000000000000000000000000000000000006" as const;
const TUSDC = "0x90dceE47Dc225832B8BbD7Eb8EeAC60766D2D1aD" as const;
const AGENT = "0x9ebdC8ACc879a8284Ae5B3CecfbD280ec307aFA3" as const;

const NOW = 1_757_000_000n;

const TEMPLATE: Omit<Mandate, "nonce"> = {
  delegate: AGENT,
  app: ROUTER,
  tokens: [WETH, TUSDC],
  maxAmounts: [10n ** 18n, 10n ** 12n],
  expiry: NOW + 86_400n,
};

const sig = ("0x" + "11".repeat(65)) as `0x${string}`;

function book(count: number, first = 10n) {
  return new MandateBook(issueBatch(TEMPLATE, first, count).map((mandate) => ({ mandate, signature: sig })));
}

describe("a book hands out the lowest mandate the chain still allows", () => {
  test("it holds every mandate it was given", () => {
    const b = book(3);
    assert.equal(b.size, 3);
    assert.equal(b.remaining(() => false, NOW), 3);
  });

  test("it spends them in the order they were approved", () => {
    const b = book(3, 10n);
    assert.equal(b.next(() => false, NOW).mandate.nonce, 10n);
    // Once the chain says 10 is revoked, 11 is next.
    assert.equal(b.next((n) => n === 10n, NOW).mandate.nonce, 11n);
  });

  test("revocation is read from the chain, not remembered", () => {
    // The owner or the guardian can revoke at any moment, and an agent that trusted its own record
    // would find out as a revert.
    const b = book(3, 10n);
    assert.equal(b.next((n) => n === 10n || n === 11n, NOW).mandate.nonce, 12n);
  });

  test("expiry takes a mandate out of the book without anyone spending it", () => {
    const b = book(2);
    assert.equal(b.remaining(() => false, NOW + 90_000n), 0);
  });
});

describe("running out stops the agent, which is the point of the book being finite", () => {
  test("an exhausted book throws rather than returning nothing", () => {
    const b = book(2, 10n);
    assert.throws(
      () => b.next((n) => n === 10n || n === 11n, NOW),
      (e: Error) => e instanceof MandatesExhausted && /Sign a new batch/.test(e.message),
    );
  });

  test("the message says how many expired versus how many were spent", () => {
    const b = book(2);
    assert.throws(
      () => b.next(() => false, NOW + 90_000n),
      (e: Error) => /2 expired/.test(e.message),
    );
  });

  test("an empty book is refused at construction, not at first use", () => {
    assert.throws(() => new MandateBook([]));
    assert.throws(() => issueBatch(TEMPLATE, 0n, 0));
  });
});

describe("the digest binds to one vault on one chain", () => {
  test("a different vault is a different digest, so a signature cannot be moved", () => {
    const m = { ...TEMPLATE, nonce: 1n };
    assert.notEqual(mandateDigest(VAULT, 84532, m), mandateDigest(TUSDC, 84532, m));
  });

  test("a different chain is a different digest", () => {
    const m = { ...TEMPLATE, nonce: 1n };
    assert.notEqual(mandateDigest(VAULT, 84532, m), mandateDigest(VAULT, 11155111, m));
  });

  test("a different nonce is a different digest, so a batch is not one signature reused", () => {
    assert.notEqual(
      mandateDigest(VAULT, 84532, { ...TEMPLATE, nonce: 1n }),
      mandateDigest(VAULT, 84532, { ...TEMPLATE, nonce: 2n }),
    );
  });
});

describe("re-quoting", () => {
  test("updateQuote carries the old hash, so there is no window without a book", () => {
    const cd = updateQuoteCalldata({
      maker: VAULT,
      tokenA: WETH,
      tokenB: TUSDC,
      program: "0x0208000000000000000151400000" as `0x${string}`,
      app: ROUTER,
      tokens: [WETH, TUSDC],
      amounts: [1n, 1n],
      mandate: { ...TEMPLATE, nonce: 10n },
      signature: sig,
      oldStrategyHash: ("0x" + "ab".repeat(32)) as `0x${string}`,
    });
    assert.ok(cd.startsWith("0x"));
    assert.ok(cd.includes("ab".repeat(32)), "the old strategy hash must be in the call");
  });
});
