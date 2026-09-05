import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeErrorResult } from 'viem';
import { decodeRefusal, SETTLED_BELOW_FLOOR, SETTLED_BELOW_FLOOR_SELECTOR } from './refusal.ts';
import { USDC, WETH } from './tokens.ts';

const RECIPIENT = '0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a' as const;

// A taker selling WETH for USDC at 2,391.6 against a floor of 2,445.40.
const takerRefusal = encodeErrorResult({
  abi: [SETTLED_BELOW_FLOOR],
  args: [RECIPIENT, WETH, USDC, 2_391_600_000n, 2_445_400_000n],
});

test('the selector is the one the contract reverts with', () => {
  assert.equal(takerRefusal.slice(0, 10), SETTLED_BELOW_FLOOR_SELECTOR);
});

test('revert data becomes the numbers the card renders', () => {
  const r = decodeRefusal(takerRefusal);
  assert.ok(r);
  assert.equal(r.attemptedPrice, 2391.6);
  assert.equal(r.floorPrice, 2445.4);
  assert.equal(r.bpsBelowFloor, 220);
  assert.equal(r.gaveSymbol, 'WETH');
  assert.equal(r.gotSymbol, 'USDC');
});

// checkSettlement scores the maker with the pair the other way round, so a maker-side refusal
// arrives with the tokens swapped. Decimals come from the decoded addresses for exactly this.
test('a maker-side refusal decodes upright, not inverted', () => {
  const makerRefusal = encodeErrorResult({
    abi: [SETTLED_BELOW_FLOOR],
    args: [RECIPIENT, USDC, WETH, 400_000_000_000_000_000_000_000_000n, 409_000_000_000_000_000_000_000_000n],
  });
  const r = decodeRefusal(makerRefusal);
  assert.ok(r);
  assert.equal(r.gaveSymbol, 'USDC');
  assert.equal(r.gotSymbol, 'WETH');
  assert.equal(r.attemptedPrice, 0.0004);   // WETH per USDC, i.e. 2,500 the other way up
  assert.equal(r.bpsBelowFloor, 220);
});

test('a revert this decoder does not recognise is not a refusal', () => {
  // Claiming "the floor held" on an unrelated revert would be a lie in the owner's favour.
  assert.equal(decodeRefusal('0xdeadbeef'), null);
  assert.equal(decodeRefusal(`${SETTLED_BELOW_FLOOR_SELECTOR}00`), null);
});

test('an unknown token is not rendered rather than guessed', () => {
  const unknown = encodeErrorResult({
    abi: [SETTLED_BELOW_FLOOR],
    args: [RECIPIENT, '0x00000000000000000000000000000000deadbeef', USDC, 1n, 2n],
  });
  assert.equal(decodeRefusal(unknown), null);
});
