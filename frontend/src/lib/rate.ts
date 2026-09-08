/**
 * The rate convention, in one place. Every rate in the system is
 *
 *     rate = received_raw * 1e18 / given_raw
 *
 * from the point of view of the party being scored; higher is better for that party. Get the
 * orientation backwards and every number on every screen is wrong in a way that still looks
 * plausible, which is why this file has a test and no component does the arithmetic inline.
 */
const RATE_ONE = 10n ** 18n;

/**
 * Fixed-point precision for the bigint -> number step. Nano, not micro: the maker side of a
 * settlement is scored with the pair inverted (WETH per USDC, ~0.0004), and micro truncated that
 * to zero. Exact for prices between ~1e-9 and ~9e6, which covers both orientations of this pair.
 *
 * ponytail: a pair outside that band needs a decimal string rather than a JS number.
 */
const PRECISION = 1_000_000_000n;

/** rate -> a human price, `quote` units per one `base` unit. */
export function rateToPrice(rate: bigint, baseDecimals: number, quoteDecimals: number): number {
  const scaled = (rate * 10n ** BigInt(baseDecimals) * PRECISION) / (10n ** BigInt(quoteDecimals) * RATE_ONE);
  return Number(scaled) / Number(PRECISION);
}

/** The inverse, for anything the user types or drags. */
export function priceToRate(price: number, baseDecimals: number, quoteDecimals: number): bigint {
  const scaled = BigInt(Math.round(price * Number(PRECISION)));
  return (scaled * 10n ** BigInt(quoteDecimals) * RATE_ONE) / (10n ** BigInt(baseDecimals) * PRECISION);
}

/** A floor expressed as max adverse deviation from the reference, as a price. */
export function floorPriceFromBps(referencePrice: number, maxAdverseBps: number): number {
  return referencePrice * (1 - maxAdverseBps / 10_000);
}

/** How far a realized price sits above a floor, in bps. */
export function bpsAbove(price: number, floorPrice: number): number {
  return Math.round(((price - floorPrice) / floorPrice) * 10_000);
}

export function formatPrice(price: number): string {
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * A quote-token amount, as money.
 *
 * The quote here is a dollar stablecoin — tUSDC on the testnet, USDC on mainnet — so one unit is
 * one dollar by construction, and the reference every fill is scored against is a Chainlink
 * ETH/USD answer. The dollar sign is therefore describing the quote asset, not a conversion
 * anybody performed.
 *
 * Small values keep their cents; a fill of a ten-thousandth of an ether is worth well under a
 * dollar, and rounding it to $1 would make every row on this testnet look the same size.
 */
export function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) return '<$0.01';
  /*
   * Both digit counts move together. Setting a maximum below the minimum throws a RangeError out
   * of toLocaleString — so dropping the cents on large values, while leaving the minimum at two,
   * would have taken the tape down on the first fill worth a hundred dollars. Every fill on this
   * testnet is worth well under one, which is exactly why it would have shipped unnoticed.
   */
  const digits = value < 100 ? 2 : 0;
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatBps(n: number): string {
  return `${n > 0 ? '+' : ''}${n} bps`;
}
