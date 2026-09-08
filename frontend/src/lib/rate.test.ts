import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateToPrice, priceToRate, floorPriceFromBps, bpsAbove, formatUsd } from './rate.ts';

// WETH(18) given, USDC(6) received: 2,445.40 USDC per WETH is a rate of 2_445_400_000.
test('rate and price round-trip for WETH/USDC', () => {
  assert.equal(rateToPrice(2_445_400_000n, 18, 6), 2445.4);
  assert.equal(priceToRate(2445.4, 18, 6), 2_445_400_000n);
});

// The orientation that has to survive: an 18/18 pair keeps 1e18 as "one".
test('rate and price round-trip for an 18/18 pair', () => {
  assert.equal(rateToPrice(10n ** 18n, 18, 18), 1);
  assert.equal(priceToRate(1, 18, 18), 10n ** 18n);
});

// The maker side of a settlement is scored with the pair the other way round, and micro
// precision rounded this to zero.
test('an inverted pair survives the bigint to number step', () => {
  assert.equal(rateToPrice(400_000_000_000_000_000_000_000_000n, 6, 18), 0.0004);
  assert.equal(priceToRate(0.0004, 6, 18), 400_000_000_000_000_000_000_000_000n);
});

test('a floor 100 bps under the reference is 1% under it', () => {
  assert.equal(floorPriceFromBps(2470.1, 100), 2445.399);
  assert.equal(bpsAbove(2463.1, 2445.4), 72);
});

test('a large value keeps its digit counts consistent', () => {
  // maximumFractionDigits below minimumFractionDigits throws out of toLocaleString, and every fill
  // on the testnet is worth under a dollar — so this would have shipped and broken on the first
  // hundred-dollar fill instead.
  assert.equal(formatUsd(125.5), '$126');
  assert.equal(formatUsd(0.747), '$0.75');
  assert.equal(formatUsd(0.000001), '<$0.01');
});
