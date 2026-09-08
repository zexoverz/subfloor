import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { FillBar } from './FillBar.tsx';
import { copy } from '../copy.ts';
import { formatBps, formatPrice } from '../lib/rate.ts';
import { decodeRefusal } from '../lib/refusal.ts';
import { RefusalDetail } from './RefusalCard.tsx';
import type { Fill, Pair, Refusal, TapeEntry } from '../types.ts';

const COLUMNS = ['Time', 'Side', 'Size', 'Price', 'vs ref', 'vs floor'];

/**
 * The tape is a ledger, so it is a table: the same six columns on every row, numbers right-aligned
 * in one mono grid. Refusals are rows in it rather than an alert somewhere else — the product
 * working belongs in the same list as the product working quietly.
 */
export function Tape({ entries, pair }: { entries: TapeEntry[]; pair: Pair }) {
  return (
    /*
     * The scroll box is absolute inside a relative flex child on purpose. A tape sized by its own
     * rows drives the grid row height, so the card grows every time a fill lands and the column
     * beside it stops matching. Taking the rows out of intrinsic sizing lets the card stretch to
     * whatever the row already is, and the tape fills exactly that.
     */
    <div className="relative min-h-[240px] flex-1">
      <div className="tape-scroll absolute inset-0 overflow-y-auto">
        <table className="w-full border-collapse">
        <thead>
          <tr>
            {COLUMNS.map((h, i) => (
              <th
                key={h}
                /*
                 * z-10 is load-bearing: the fill bars are positioned spans in tbody, which comes
                 * after thead in the DOM, so at z-index auto they paint straight over a sticky
                 * header that has no stacking order of its own.
                 */
                className={`sticky top-0 z-10 border-b border-rule bg-surface px-4 py-2 text-[10px] font-medium tracking-[0.09em] text-faint uppercase ${
                  i === 0 ? 'text-left' : 'text-right'
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) =>
            entry.kind === 'fill' ? (
              <FillRows key={entry.tx} entry={entry} pair={pair} />
            ) : (
              <RefusalRows key={entry.tx} entry={entry} />
            ),
          )}
        </tbody>
        </table>
      </div>
    </div>
  );
}

/** Markout lives one click behind a fill, never on the surface: the tape is for what happened. */
function FillRows({ entry, pair }: { entry: Fill; pair: Pair }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        onClick={() => setOpen(!open)}
        className="tape-arrive cursor-pointer [&>td]:border-b [&>td]:border-rule"
      >
        <td className="px-4 py-1.5 text-left whitespace-nowrap">{entry.time}</td>
        <td className={`px-4 py-1.5 ${entry.side === 'bought' ? 'text-settle' : 'text-floor'}`}>
          <span className="flex items-center justify-end gap-1.5">
            {entry.side === 'bought' ? (
              <ArrowUpRight size={13} strokeWidth={1.8} />
            ) : (
              <ArrowDownRight size={13} strokeWidth={1.8} />
            )}
            {entry.side === 'bought' ? 'buy' : 'sell'}
          </span>
        </td>
        <td className="px-4 py-1.5 text-right">
          {entry.amount.toFixed(3)} {pair.base}
        </td>
        <td className="px-4 py-1.5 text-right">{formatPrice(entry.price)}</td>
        <td className="px-4 py-1.5 text-right text-faint">
          {entry.vsReferenceBps === undefined ? '—' : entry.vsReferenceBps}
        </td>
        <td className="py-1.5 pr-4 pl-2">
          <span className="flex items-center gap-2">
            <FillBar bpsAboveFloor={entry.bpsAboveFloor} />
            <span className="w-9 text-right font-semibold text-settle">+{entry.bpsAboveFloor}</span>
          </span>
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={6} className="border-b border-rule bg-raise px-4 py-3">
            <dl className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-4 gap-y-1 text-[11.5px]">
              <dt className="text-faint">markout 30s</dt>
              <dd className="m-0 font-medium">
                {entry.markout30sBps === undefined ? '—' : formatBps(entry.markout30sBps)}
              </dd>
              <dt className="text-faint">vs CEX mid</dt>
              <dd className="m-0 font-medium">
                {entry.vsCexMidBps === undefined ? '—' : formatBps(entry.vsCexMidBps)}
              </dd>
              <dt className="text-faint">clear of floor</dt>
              <dd className="m-0 font-medium text-settle">+{entry.bpsAboveFloor} bps</dd>
              <dt className="text-faint">tx</dt>
              <dd className="m-0 font-medium">{entry.tx}…</dd>
            </dl>
            <p className="mt-2 text-[11px] text-faint">
              markout is where the reference sat 30 seconds later — the honest read on whether the fill was
              good, rather than whether it merely cleared the floor
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * A revert this decoder does not recognise is not a refusal, and the tape does not claim it is:
 * an unrelated failure rendered as "the floor held" would be a lie in the owner's favour.
 *
 * Size stays em-dash on purpose. The revert carries rates, not amounts — the fill never happened,
 * so there is no size to report, and inventing one would undo the point of decoding.
 */
function RefusalRows({ entry }: { entry: Refusal }) {
  const [open, setOpen] = useState(false);
  // The index hands them over already decoded; a revert we watched ourselves is decoded here.
  const decoded = entry.decoded ?? decodeRefusal(entry.data);

  // The refusal is the moment the demo is built around, so it holds the eye for a beat.
  const [fresh, setFresh] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setFresh(false), 1400);
    return () => clearTimeout(id);
  }, []);

  if (!decoded) return null;

  const vsRef =
    entry.referencePrice === undefined
      ? null
      : Math.round(((decoded.attemptedPrice - entry.referencePrice) / entry.referencePrice) * 10_000);

  return (
    <>
      <tr
        onClick={() => setOpen(!open)}
        title={copy.refusal.view}
        className={`cursor-pointer bg-refuse-wash text-refuse ${fresh ? 'tape-arrive-refuse' : ''}`}
      >
        <td className="px-4 py-1.5 text-left shadow-[inset_2px_0_0_var(--c-refuse)] whitespace-nowrap">
          {entry.time}
        </td>
        <td className="px-4 py-1.5 font-semibold">
          <span className="flex items-center justify-end gap-1.5">
            {/* The shield is the floor holding, not an alarm: the refusal is the good outcome. */}
            <ShieldCheck size={13} strokeWidth={1.8} />
            refused
          </span>
        </td>
        <td className="px-4 py-1.5 text-right text-refuse/60">—</td>
        <td className="px-4 py-1.5 text-right font-semibold">{formatPrice(decoded.attemptedPrice)}</td>
        <td className="px-4 py-1.5 text-right">{vsRef ?? '—'}</td>
        <td className="px-4 py-1.5 text-right font-semibold">−{decoded.bpsBelowFloor}</td>
      </tr>

      <tr className={`bg-refuse-wash ${fresh ? 'tape-arrive-refuse' : ''} [&>td]:border-b [&>td]:border-rule`}>
        <td colSpan={6} className="px-4 pb-2 text-left text-[11.5px] text-refuse">
          <b className="font-semibold">{copy.refusal.heading}</b> — the agent tried to settle at{' '}
          {formatPrice(decoded.attemptedPrice)}, the venue refused ·{' '}
          <span className="text-ink">{copy.refusal.unchanged}</span>
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={6} className="p-0">
            <RefusalDetail entry={entry} decoded={decoded} />
          </td>
        </tr>
      )}
    </>
  );
}
