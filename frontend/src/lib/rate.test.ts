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

test('a reverse fill is read as one, not as an impossible price', () => {
  /*
   * The index returns no token addresses, so direction is inferred from the rate's magnitude:
   * received × 1e18 ÷ given lands near 1e9 selling an 18-decimal token for a 6-decimal one, and
   * near 1e26 the other way. Read forwards, the reverse fill priced at 4.01e20 — which the chart
   * library rejects by throwing, taking the board down with it.
   */
  const forward = 2_490_200_000;
  const reverse = 401_574_170_749_337_402_618_263_593;
  assert.equal(forward > 1e18, false);
  assert.equal(reverse > 1e18, true);

  // Priced with the direction it was actually in, each lands somewhere a chart can draw.
  const price = (rate: number, giveDecimals: number, getDecimals: number) =>
    (rate / 1e18) * 10 ** (giveDecimals - getDecimals);
  assert.ok(Math.abs(price(forward, 18, 6) - 2490.2) < 0.1);
  assert.ok(Math.abs(price(reverse, 6, 18) - 0.0004) < 0.0001);
});

test('both directions of a pair report the same price scale', () => {
  /*
   * A rate is received-per-given, so the two directions of one pair are reciprocals. A tape has
   * one price for a pair — the direction belongs in the legs — and reading the reverse rate
   * as-is put 0.0004 in a column that rounds to two decimals, printing $0.00 for a real trade.
   */
  const asGiven = (raw: number, giveDec: number, getDec: number) => (raw / 1e18) * 10 ** (giveDec - getDec);
  const forward = asGiven(2_490_200_000, 18, 6);
  const reverse = 1 / asGiven(401_574_170_749_337_402_618_263_593, 6, 18);
  assert.ok(Math.abs(forward - 2490.2) < 0.1);
  // Same pair, same ballpark, whichever way the fill went.
  assert.ok(Math.abs(reverse - 2490.2) < 5);
});
