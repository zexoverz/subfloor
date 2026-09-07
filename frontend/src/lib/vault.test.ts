import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { pickVault } from './vault.ts';

const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;
const OURS = '0x441EE52d939E46A33919C4295e88d32458797503' as const;
const ZERO = '0x0000000000000000000000000000000000000000' as const;

test('a wallet with no vault of its own reads ours', () => {
  assert.equal(pickVault([], OURS), OURS);
});

test('a wallet that deployed one reads its own, never ours', () => {
  assert.equal(pickVault([A], OURS), A);
});

test('deploying twice means the second', () => {
  assert.equal(pickVault([A, B], OURS), B);
});

test('an unanswered factory is not an answer of "none"', () => {
  // null is "we have not been told", and it must fall back rather than claim they own nothing.
  assert.equal(pickVault(null, OURS), OURS);
});

test('a zero address is not a vault', () => {
  assert.equal(pickVault([ZERO], OURS), OURS);
});
