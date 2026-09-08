import { useEffect, useState } from 'react';
import { FillBar } from './FillBar.tsx';
import { copy } from '../copy.ts';
import { formatBps, formatPrice } from '../lib/rate.ts';
import { decodeRefusal } from '../lib/refusal.ts';
import { RefusalDetail } from './RefusalCard.tsx';
import type { Fill, Pair, Refusal, TapeEntry } from '../types.ts';
import { ExternalLink } from 'lucide-react';
import { txUrl } from '../lib/chain.ts';
import { AddressChip } from './AddressChip.tsx';
import { TokenIcon } from './TokenIcon.tsx';
import { TradeMark } from './TradeMark.tsx';

/*
 * The identity column carries the trade itself — direction, pair, and the time under it — so the
 * eye lands on what happened before it lands on how much. The numeric columns then read right to
 * left in falling importance, ending on the one this product is about.
 */
const COLUMNS = ['Trade', 'Taker', 'Size', 'Price', 'vs ref', 'vs floor'];

/**
 * The tape is a ledger, so it is a table: the same six columns on every row, numbers right-aligned
 * in one mono grid. Refusals are rows in it rather than an alert somewhere else — the product
 * working belongs in the same list as the product working quietly.
 */
/**
 * Rows that admit they are not rows.
 *
 * A tape with nothing to show is not allowed to borrow sample trades to fill the space — an
 * invented fill is indistinguishable from a real one at a glance, and this is the surface the
 * whole product is read from. Waiting looks like waiting.
 */
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <tr key={i} className="border-b border-rule/40">
          <td colSpan={6} className="py-2.5">
            <span
              className="block h-3 animate-pulse rounded bg-rule/60"
              // Uneven widths, so it reads as a tape loading rather than a progress bar.
              style={{ width: `${88 - (i % 4) * 9}%`, animationDelay: `${i * 90}ms` }}
            />
          </td>
        </tr>
      ))}
    </>
  );
}

export function Tape({
  entries,
  pair,
  status = 'live',
}: {
  entries: TapeEntry[];
  pair: Pair;
  /** What the reader knows, not what the screen would like to show. */
  status?: 'loading' | 'live' | 'empty' | 'failed';
}) {
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
                className={`sticky top-0 z-10 border-b border-rule bg-sunken/80 px-4 py-3 text-[10.5px] font-medium tracking-[0.09em] text-faint uppercase backdrop-blur-sm ${
                  i === 0 ? 'text-left' : 'text-right'
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {status === 'loading' && <SkeletonRows />}
          {status !== 'loading' && entries.length === 0 && (
            <tr>
              <td colSpan={6} className="py-10 text-center text-[12px] text-faint">
                {status === 'failed' ? copy.desk.tapeUnreachable : copy.desk.tapeEmpty}
              </td>
            </tr>
          )}
          {status !== 'loading' && entries.map((entry) =>
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
        /*
         * Glass rather than a flat fill: the seabed is behind this table, and a solid row would
         * cut a hole in it. The tint is white at a few per cent, so it reads as depth over the
         * artwork rather than as a second colour competing with it.
         */
        className="tape-arrive cursor-pointer transition-colors hover:bg-white/[0.045] [&>td]:border-b [&>td]:border-rule/70"
      >
        <td className="px-4 py-3">
          <span className="flex items-center gap-3">
            <TradeMark symbol={pair.base} kind={entry.side} />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-[12.5px] font-semibold text-ink">
                {entry.side === 'bought' ? 'Buy' : 'Sell'} {pair.base}
              </span>
              {/* The time belongs under the trade, not in a column of its own competing for width. */}
              <span className="flex items-center gap-1.5 text-[10.5px] text-faint">
                {entry.time}
                {entry.hash && (
                  <>
                    ·
                    <a
                      href={txUrl(entry.hash)}
                      target="_blank"
                      rel="noreferrer"
                      // The row toggles a panel; opening the explorer must not also do that.
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 font-mono transition-colors hover:text-floor"
                      title={entry.hash}
                    >
                      {entry.tx}…
                      <ExternalLink size={9} strokeWidth={1.8} />
                    </a>
                  </>
                )}
              </span>
            </span>
          </span>
        </td>
        <td className="px-4 py-3">
          {/*
           * The counterparty, with a shape. The same taker repeated down the tape is invisible as
           * truncated hex and unmistakable as an identicon — which is the honest reading of this
           * venue right now: one bot on the other side of nearly every fill.
           */}
          {entry.taker ? <AddressChip address={entry.taker} /> : <span className="text-faint">—</span>}
        </td>
        <td className="px-4 py-3 font-mono text-[12.5px] tabular-nums">
          <span className="flex items-center justify-end gap-1.5">
            {/* Three decimals turned a 0.0003 WETH fill into "0.000" — a real trade rendered as
                nothing at all. Small sizes get the digits they need; large ones stay readable. */}
            {entry.amount < 0.01 ? entry.amount.toPrecision(2) : entry.amount.toFixed(3)}
            {/*
             * The mark rather than the ticker. The number and its unit read as one thing this way,
             * and the size column stops repeating a word the row above it already carries.
             */}
            <TokenIcon symbol={pair.base} size={14} />
          </span>
        </td>
        <td className="px-4 py-3 text-right font-mono text-[13px] font-semibold tabular-nums">
          {formatPrice(entry.price)}
        </td>
        <td className="px-4 py-3 text-right font-mono text-[12.5px] tabular-nums">
          {/*
           * Signed and coloured, because this one goes both ways and the sign is the whole
           * meaning: negative is a fill that went against the vault, which is allowed — the
           * reference is not the promise.
           */}
          {entry.vsReferenceBps === undefined ? (
            <span className="text-faint">—</span>
          ) : (
            <span className={entry.vsReferenceBps < 0 ? 'text-refuse' : 'text-settle'}>
              {formatBps(entry.vsReferenceBps)}
            </span>
          )}
        </td>
        <td className="py-3 pr-4 pl-2">
          <span className="flex items-center justify-end gap-2.5">
            <FillBar bpsAboveFloor={entry.bpsAboveFloor ?? 0} />
            <span className="w-11 text-right font-mono text-[12.5px] font-semibold tabular-nums text-settle">
              {entry.bpsAboveFloor === undefined ? (
                <span className="text-faint">—</span>
              ) : (
                `+${entry.bpsAboveFloor}`
              )}
            </span>
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
              <dt className="text-faint">reference</dt>
              <dd className="m-0 font-medium">
                {entry.referencePrice === undefined ? '—' : formatPrice(entry.referencePrice)}
              </dd>
              <dt className="text-faint">reference age</dt>
              <dd className="m-0 font-medium">
                {/*
                  * Part of the guarantee, not trivia. The guard refuses when it cannot prove its
                  * input is fresh, so a fill cleared against a stale answer cleared a different bar
                  * — and the row should not flatten that into the same line as a fresh one.
                  */}
                {entry.referenceAgeSeconds === undefined ? (
                  '—'
                ) : (
                  <span className={entry.referenceAgeSeconds > 600 ? 'text-refuse' : 'text-ink'}>
                    {entry.referenceAgeSeconds}s
                  </span>
                )}
              </dd>
              <dt className="text-faint">clear of floor</dt>
              <dd className="m-0 font-medium text-settle">
                {entry.bpsAboveFloor === undefined ? <span className="text-faint">—</span> : `+${entry.bpsAboveFloor} bps`}
              </dd>
              <dt className="text-faint">tx</dt>
              <dd className="m-0 font-medium">
                {/* Openable, because a number nobody can check is a number nobody has to believe. */}
                {entry.hash ? (
                  <a
                    href={txUrl(entry.hash)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-floor"
                  >
                    {entry.tx}…
                    <ExternalLink size={10} strokeWidth={1.7} className="text-faint" />
                  </a>
                ) : (
                  `${entry.tx}…`
                )}
              </dd>
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
        <td className="px-4 py-3 shadow-[inset_2px_0_0_var(--c-refuse)]">
          <span className="flex items-center gap-3">
            {/* The shield is the floor holding, not an alarm: the refusal is the good outcome. */}
            <TradeMark symbol={decoded.gaveSymbol} kind="refused" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-[12.5px] font-semibold">Refused</span>
              <span className="flex items-center gap-1.5 text-[10.5px] text-refuse/70">
                {entry.time}
                {entry.hash && (
                  <>
                    ·
                    <a
                      href={txUrl(entry.hash)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 font-mono transition-colors hover:text-ink"
                      title={entry.hash}
                    >
                      {entry.tx}…
                      <ExternalLink size={9} strokeWidth={1.8} />
                    </a>
                  </>
                )}
              </span>
            </span>
          </span>
        </td>
        <td className="px-4 py-3">
          {entry.from ? <AddressChip address={entry.from} /> : <span className="text-refuse/50">—</span>}
        </td>
        {/* No size, and never a zero. The revert carries rates and no amounts, because nothing
            moved — inventing one here would contradict the line directly beneath it. */}
        <td className="px-4 py-3 text-right font-mono text-[12.5px] text-refuse/50 tabular-nums">—</td>
        <td className="px-4 py-3 text-right font-mono text-[13px] font-semibold tabular-nums">
          {formatPrice(decoded.attemptedPrice)}
        </td>
        <td className="px-4 py-3 text-right font-mono text-[12.5px] tabular-nums">
          {vsRef === null ? <span className="text-refuse/50">—</span> : formatBps(vsRef)}
        </td>
        <td className="px-4 py-3 text-right font-mono text-[12.5px] font-semibold tabular-nums">
          −{decoded.bpsBelowFloor}
        </td>
      </tr>

      <tr className={`bg-refuse-wash ${fresh ? 'tape-arrive-refuse' : ''} [&>td]:border-b [&>td]:border-rule`}>
        <td colSpan={6} className="px-4 pb-3 text-left text-[11.5px] text-refuse">
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
