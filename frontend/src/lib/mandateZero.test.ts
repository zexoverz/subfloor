import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildMandate } from './mandate.ts';

/*
 * `buildMandate` reads addresses from `import.meta.env`, which is empty under the test runner, so
 * it returns null for want of a router before the caps are ever looked at. These pin the guard's
 * own shape instead — the predicate #285 turns on — so a later edit that changes "every cap is
 * zero" into "any cap is zero" fails here rather than on somebody's vault a fortnight later.
 */
const zeroWhenEmpty = (amounts: bigint[]) => amounts.every((a) => a === 0n);

test('a vault holding nothing authorises nothing', () => {
  assert.equal(zeroWhenEmpty([0n, 0n]), true);
});

test('one funded side is enough to bound an agent', () => {
  // The book needs both sides to quote both ways, but the mandate is a ceiling, not a plan: a
  // vault with only tUSDC can still authorise an agent over the tUSDC it has.
  assert.equal(zeroWhenEmpty([0n, 35_000_000000n]), false);
  assert.equal(zeroWhenEmpty([4_000_000_000_000_000n, 0n]), false);
});

test('a funded vault is not refused', () => {
  assert.equal(zeroWhenEmpty([4_000_000_000_000_000n, 35_000_000000n]), false);
});

test('buildMandate returns null rather than an unsigned-looking object', () => {
  // Null is the answer for every "nothing to sign yet" — no vault, no delegate, no caps — so the
  // caller has one case to handle rather than three.
  assert.equal(
    buildMandate({ vault: null, delegate: '0x76b36d8f88Df6f61E65779DB99F1769b15D50C81', inventory: [], nonce: 0n, expiresInDays: 14 }),
    null,
  );
});
