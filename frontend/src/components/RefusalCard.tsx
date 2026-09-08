import { copy } from '../copy.ts';
import { bpsAbove, formatPrice } from '../lib/rate.ts';
import type { Refusal } from '../types.ts';

/**
 * Every number here is a decoded revert argument, which is why same-day router verification is not
 * optional: [view] has to land on a page whose failed transaction decodes into these same rates —
 * the same event from two witnesses.
 */
/**
 * Takes only what it renders, not the full decoder output. A refusal arrives either decoded from
 * revert data or already decoded by the index, and this card should not care which — narrowing the
 * prop to the five numbers it actually shows is what lets both satisfy it.
 */
type Shown = { attemptedPrice: number; floorPrice: number; bpsBelowFloor: number; gaveSymbol: string; gotSymbol: string };

export function RefusalDetail({ entry, decoded }: { entry: Refusal; decoded: Shown }) {
  const vsRef = entry.referencePrice === undefined ? null : bpsAbove(decoded.attemptedPrice, entry.referencePrice);
  const floorVsRef = entry.referencePrice === undefined ? null : bpsAbove(decoded.floorPrice, entry.referencePrice);

  return (
    <div className="border-l-2 border-refuse bg-refuse-wash px-4 py-3.5">
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 text-[12.5px]">
        <dt className="text-[10.5px] tracking-[0.08em] text-faint uppercase">{copy.refusal.attempted}</dt>
        <dd className="m-0 font-semibold text-refuse">
          {formatPrice(decoded.attemptedPrice)} {decoded.gotSymbol}
          {vsRef !== null && <span className="ml-2 font-normal text-faint">{vsRef} bps vs ref</span>}
        </dd>
        <dt className="text-[10.5px] tracking-[0.08em] text-faint uppercase">{copy.refusal.yourFloor}</dt>
        <dd className="m-0 font-semibold text-floor">
          {formatPrice(decoded.floorPrice)} {decoded.gotSymbol}
          {floorVsRef !== null && <span className="ml-2 font-normal text-faint">{floorVsRef} bps</span>}
        </dd>
      </dl>
      <p className="serif mt-3 text-[13.5px] leading-relaxed text-muted">
        {decoded.bpsBelowFloor} bps under your floor, priced in {decoded.gotSymbol} per {decoded.gaveSymbol}. Reverted
        on Base mainnet, tx {entry.tx}… — <span className="text-ink">{copy.refusal.unchanged}</span>.
      </p>
    </div>
  );
}
