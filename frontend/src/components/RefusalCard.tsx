import { copy } from '../copy.ts';
import { bpsAbove, formatPrice } from '../lib/rate.ts';
import type { DecodedRefusal } from '../lib/refusal.ts';
import type { Refusal } from '../types.ts';

/**
 * The product working, not an error. No alarm styling on the card — the only red is the attempted
 * price, because the attempted price is the bad thing and the card is the good thing.
 *
 * Every number here is a decoded revert argument, which is why same-day router verification is not
 * optional: [view] has to land on a page whose failed transaction decodes into these same rates,
 * the same event from two witnesses.
 */
export function RefusalCard({ entry, decoded }: { entry: Refusal; decoded: DecodedRefusal }) {
  const vsReference =
    entry.referencePrice === undefined ? null : bpsAbove(decoded.attemptedPrice, entry.referencePrice);
  const floorVsReference =
    entry.referencePrice === undefined ? null : bpsAbove(decoded.floorPrice, entry.referencePrice);

  return (
    <div className="my-2 rounded-xl border border-floor/40 bg-floor/5 px-5 py-4">
      <h3 className="mb-3 text-xs font-semibold tracking-[0.14em] text-floor/90">{copy.refusal.heading}</h3>

      <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-dim">{copy.refusal.attempted}</dt>
        <dd className="num text-bad">
          {formatPrice(decoded.attemptedPrice)}
          {vsReference !== null && <span className="text-dim"> ({vsReference} bps vs ref)</span>}
        </dd>
        <dt className="text-dim">{copy.refusal.yourFloor}</dt>
        <dd className="num">
          {formatPrice(decoded.floorPrice)}
          {floorVsReference !== null && <span className="text-dim"> ({floorVsReference} bps)</span>}
        </dd>
      </dl>

      <p className="mt-3 text-xs text-dim">
        {decoded.bpsBelowFloor} bps under your floor, in {decoded.gotSymbol} per {decoded.gaveSymbol}
      </p>
      <p className="mt-1 text-xs text-dim">
        reverted on Base mainnet · tx {entry.tx}… · <span className="text-ink">{copy.refusal.unchanged}</span>
      </p>
    </div>
  );
}
