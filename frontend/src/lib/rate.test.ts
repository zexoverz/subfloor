import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateToPrice, priceToRate, floorPriceFromBps, bpsAbove } from './rate.ts';

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

test('a floor 100 bps under the reference is 1% under it', () => {
  assert.equal(floorPriceFromBps(2470.1, 100), 2445.399);
  assert.equal(bpsAbove(2463.1, 2445.4), 72);
});
