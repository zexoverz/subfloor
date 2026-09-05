import { copy } from '../copy.ts';
import { formatPrice } from '../lib/rate.ts';
import type { Refusal } from '../types.ts';

/**
 * The product working, not an error. No alarm styling on the card — the only red is the attempted
 * rate, because the attempted rate is the bad thing and the card is the good thing.
 *
 * The numbers are the decoded revert arguments, which is why same-day router verification is not
 * optional: [view] has to land on a page whose failed transaction decodes into these same rates.
 */
export function RefusalCard({ entry }: { entry: Refusal }) {
  return (
    <div className="my-2 rounded-xl border border-floor/40 bg-floor/5 px-5 py-4">
      <h3 className="mb-3 text-xs font-semibold tracking-[0.14em] text-floor/90">{copy.refusal.heading}</h3>
      <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-dim">{copy.refusal.attempted}</dt>
        <dd className="num text-bad">
          {formatPrice(entry.attempted)} ({entry.attemptedBpsVsRef} bps vs ref)
        </dd>
        <dt className="text-dim">{copy.refusal.yourFloor}</dt>
        <dd className="num">
          {formatPrice(entry.floorPrice)} ({entry.floorBps} bps)
        </dd>
      </dl>
      <p className="mt-3 text-xs text-dim">
        reverted on Base mainnet · tx {entry.tx}… · <span className="text-ink">{copy.refusal.unchanged}</span>
      </p>
    </div>
  );
}
