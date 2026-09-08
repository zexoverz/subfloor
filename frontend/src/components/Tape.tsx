import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Clock,
  Crosshair,
  ExternalLink,
  Filter,
  ShieldCheck,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { FillBar } from './FillBar.tsx';
import { copy } from '../copy.ts';
import { formatBps, formatPrice } from '../lib/rate.ts';
import { decodeRefusal } from '../lib/refusal.ts';
import { RefusalDetail } from './RefusalCard.tsx';
import type { Fill, Pair, Refusal, TapeEntry } from '../types.ts';
import { txUrl } from '../lib/chain.ts';
import { AddressChip } from './AddressChip.tsx';
import { RowHint, type Hint } from './RowHint.tsx';
import { identicon } from '../lib/identicon.ts';
import { SwapLeg } from './SwapLeg.tsx';
import { TokenIcon } from './TokenIcon.tsx';
import { TradeMark } from './TradeMark.tsx';

/*
 * The identity column carries the trade itself — direction, pair, and the time under it — so the
 * eye lands on what happened before it lands on how much. The numeric columns then read right to
 * left in falling importance, ending on the one this product is about.
 */
/*
 * Given and received, side by side, rather than "sell WETH" and a size. A row whose whole subject
 * is an exchange should not make the reader infer the other half of it.
 */
const COLUMNS = ['Sent', '', 'Received', 'Taker', 'Price', 'vs ref', 'vs floor', 'Transaction'];

/**
 * The tape is a ledger, so it is a table: the same six columns on every row, numbers right-aligned
 * in one mono grid. Refusals are rows in it rather than an alert somewhere else — the product
 * working belongs in the same list as the product working quietly.
 */
/**
 * Nothing to show, drawn rather than stated.
 *
 * An empty table with a grey sentence in it reads as something that failed to load. The chest is
 * open and there is nothing in it, which is the actual situation — and on the tape that most often
 * means a vault deployed minutes ago rather than anything wrong.
 */
function EmptyTape({ line }: { line: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <img
        src="/empty-chest.webp"
        alt=""
        aria-hidden
        draggable={false}
        /* The empty area is most of a tall panel; 132px in the middle of it read as an
           apology rather than a state. */
        className="w-[240px] max-w-[62%] select-none opacity-95"
      />
      <p className="serif m-0 max-w-[44ch] text-[13px] leading-relaxed text-muted">{line}</p>
    </div>
  );
}

/**
 * Rows that admit they are not rows.
 *
 * A tape with nothing to show is not allowed to borrow sample trades to fill the space — an
 * invented fill is indistinguishable from a real one at a glance, and this is the surface the
 * whole product is read from. Waiting looks like waiting.
 */
function SkeletonRows() {
  /*
   * One block per cell, shaped like the thing that will land in it — an identity column gets a
   * disc and two bars, a numeric column gets one short bar hard against the right edge. A single
   * wide bar per row was cheaper to write and promised a layout the table does not have, so the
   * rows jumped into a different shape the moment they arrived.
   *
   * The widths vary on the row index rather than at random, so the same skeleton draws twice the
   * same way and nothing shifts between renders.
   */
  const IDENTITY = [88, 76, 92, 80];
  const NUMBER = [56, 48, 62, 52];

  return (
    <>
      {Array.from({ length: 12 }, (_, row) => (
        <tr key={row} className="border-b border-rule/40">
          {Array.from({ length: 8 }, (_, col) => {
            const wide = col === 0 || col === 2 || col === 3;
            const arrow = col === 1;
            const width = (wide ? IDENTITY[(row + col) % 4] : NUMBER[(row + col) % 4]) ?? 64;
            return (
              <td key={col} className="px-4 py-3">
                <span
                  className={`flex items-center gap-2 ${wide ? '' : 'justify-end'}`}
                  style={{ animationDelay: `${(row * 8 + col) * 28}ms` }}
                >
                  {wide && <span className="size-[22px] shrink-0 animate-pulse rounded-full bg-rule/70" />}
                  {!arrow && (
                    <span className="flex flex-col gap-1">
                      <span
                        className="block h-2.5 animate-pulse rounded bg-rule/70"
                        style={{ width: `${width}px`, animationDelay: `${(row * 8 + col) * 28}ms` }}
                      />
                      {wide && (
                        <span
                          className="block h-2 animate-pulse rounded bg-rule/45"
                          style={{ width: `${width * 0.55}px`, animationDelay: `${(row * 8 + col) * 28 + 90}ms` }}
                        />
                      )}
                    </span>
                  )}
                </span>
              </td>
            );
          })}
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
  /*
   * One taker fills most of this tape, so the filter's real job is not sorting through many — it
   * is letting a reader confirm that. Counting them and showing the count is most of the answer
   * before anything is even selected.
   */
  const [only, setOnly] = useState<string | null>(null);
  const [hint, setHint] = useState<Hint>(null);
  /*
   * A mousemove fires per pixel, and setting state here re-renders a hundred rows each time. The
   * rows are memoised so they no longer take part, and this coalesces the remaining updates to one
   * per frame — the pointer produces far more events than the screen can show.
   */
  const frame = useRef<number | null>(null);
  const onHint = useCallback((next: Hint) => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (next === null) {
      frame.current = null;
      setHint(null);
      return;
    }
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setHint(next);
    });
  }, []);
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);
  const takers = new Map<string, number>();
  for (const e of entries) {
    const who = e.kind === 'fill' ? e.taker : e.from;
    if (who) takers.set(who.toLowerCase(), (takers.get(who.toLowerCase()) ?? 0) + 1);
  }
  const shown = only
    ? entries.filter((e) => (e.kind === 'fill' ? e.taker : e.from)?.toLowerCase() === only)
    : entries;
  /*
   * A table only stretches to its container when told to, and telling it so while it has rows
   * would space those rows out to fill the panel. So the height is only claimed when there is
   * nothing in it, which is exactly when the empty state needs somewhere to be centred.
   */
  const nothingToShow = status !== 'loading' && shown.length === 0;

  return (
    /*
     * The scroll box is absolute inside a relative flex child on purpose. A tape sized by its own
     * rows drives the grid row height, so the card grows every time a fill lands and the column
     * beside it stops matching. Taking the rows out of intrinsic sizing lets the card stretch to
     * whatever the row already is, and the tape fills exactly that.
     */
    <div className="relative min-h-[240px] flex-1">
      <div className="tape-scroll absolute inset-0 overflow-y-auto">
        <table className={`w-full border-collapse ${nothingToShow ? 'h-full' : ''}`}>
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
                className={`sticky top-0 z-10 border-b border-rule bg-sunken t-label px-4 py-3 text-faint ${
                  /*
                   * The two identity columns read left, the numeric ones read right. Taker was
                   * being lumped in with the numbers, so its heading sat over the far edge of a
                   * cell whose content starts at the near one.
                   */
                  i <= 3 ? 'text-left' : i === 7 ? 'text-left' : 'text-right'
                }`}
              >
                {h === 'Taker' && takers.size > 0 ? (
                  <TakerFilter takers={takers} only={only} onPick={setOnly} />
                ) : (
                  h
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {status === 'loading' && <SkeletonRows />}
          {status !== 'loading' && shown.length === 0 && entries.length > 0 && (
            <tr>
              <td colSpan={8} className="h-full align-middle">
                <EmptyTape line={copy.desk.noTakerRows} />
              </td>
            </tr>
          )}
          {status !== 'loading' && entries.length === 0 && (
            <tr>
              <td colSpan={8} className="h-full align-middle">
                <EmptyTape line={status === 'failed' ? copy.desk.tapeUnreachable : copy.desk.tapeEmpty} />
              </td>
            </tr>
          )}
          {status !== 'loading' && shown.map((entry) =>
            entry.kind === 'fill' ? (
              <FillRows key={entry.tx} entry={entry} pair={pair} onHint={onHint} />
            ) : (
              <RefusalRows key={entry.tx} entry={entry} onHint={onHint} />
            ),
          )}
        </tbody>
        </table>
      </div>
      <RowHint hint={hint} />
    </div>
  );
}

/**
 * Who was on the other side, and how often.
 *
 * A native `details` rather than a menu library: this opens, closes on click-away, and closes on
 * Escape without any of that being written here. The counts sit beside each address because the
 * distribution is the finding — one bot against nearly every fill — and reading it should not
 * require selecting anything.
 */
function TakerFilter({
  takers,
  only,
  onPick,
}: {
  takers: Map<string, number>;
  only: string | null;
  onPick: (who: string | null) => void;
}) {
  const total = [...takers.values()].reduce((a, b) => a + b, 0);
  return (
    <details className="group relative inline-block text-left">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 select-none hover:text-ink">
        Taker
        <Filter size={10} strokeWidth={2} className={only ? 'text-floor' : 'text-faint'} />
      </summary>
      <div className="absolute left-0 z-20 mt-2 min-w-[220px] rounded-lg border border-rule bg-surface p-1 normal-case shadow-card">
        <button
          type="button"
          onClick={(e) => {
            onPick(null);
            e.currentTarget.closest('details')?.removeAttribute('open');
          }}
          className={`flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-[11.5px] hover:bg-raise ${
            only ? 'text-muted' : 'text-ink'
          }`}
        >
          All takers
          <span className="font-mono text-faint">{total}</span>
        </button>
        {[...takers.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([who, count]) => (
            <button
              key={who}
              type="button"
              onClick={(e) => {
                onPick(who === only ? null : who);
                e.currentTarget.closest('details')?.removeAttribute('open');
              }}
              className={`flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left hover:bg-raise ${
                who === only ? 'bg-raise' : ''
              }`}
            >
              {/* Pointer-events off: inside this menu the chip is a label, and the row around it
                  is the control. Leaving it a link would send a filter click to the explorer. */}
              <span className="pointer-events-none">
                <AddressChip address={who} />
              </span>
              <span className="font-mono text-[11.5px] text-faint">{count}</span>
            </button>
          ))}
      </div>
    </details>
  );
}

/** Markout lives one click behind a fill, never on the surface: the tape is for what happened. */
/**
 * The transaction, with when it happened under it.
 *
 * Both halves answer the same question — which event was this — so they belong in one cell rather
 * than with the trade, where the time was competing for width with the amounts.
 */
function TxCell({ hash, stub, time }: { hash?: string; stub: string; time: string }) {
  return (
    <span className="flex flex-col leading-tight">
      {hash ? (
        <a
          href={txUrl(hash)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 font-mono text-[12px] font-medium text-floor hover:underline"
          title={hash}
        >
          {stub}…
          <ExternalLink size={10} strokeWidth={1.8} />
        </a>
      ) : (
        /* Sample rows have no hash and therefore no link — the honest difference between them. */
        <span className="font-mono text-[12px] text-faint">{stub}…</span>
      )}
      <span className="text-[11.5px] text-faint">{time}</span>
    </span>
  );
}

/**
 * What a fill is, and how it did — shown on hover rather than hidden behind a click.
 *
 * Exported because the chart hovers the same fills. Two cards describing one thing drift the first
 * time either is touched, and the numbers here are the ones the product is judged on.
 */
export function FillHint({ entry, pair }: { entry: Fill; pair: Pair }) {
  const gave = entry.gave ?? { amount: entry.amount, symbol: pair.base };
  const got = entry.got;
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-[12px]">
      {/*
       * The trade itself first. The row shows it too, but a card that opens over a table has to
       * say which line it belongs to — otherwise reading the numbers means looking away to check
       * which row the cursor is still on.
       */}
      <dt className="flex items-center gap-2 whitespace-nowrap text-faint">
        <ArrowUpRight size={12} strokeWidth={1.9} />
        sent
      </dt>
      <dd className="m-0 flex items-center justify-end gap-1.5 font-medium">
        {gave.amount < 0.01 ? gave.amount.toPrecision(2) : gave.amount.toFixed(4)}
        <span className="text-muted">{gave.symbol}</span>
        <TokenIcon symbol={gave.symbol} size={15} />
      </dd>
      <dt className="flex items-center gap-2 whitespace-nowrap text-faint">
        <ArrowDownLeft size={12} strokeWidth={1.9} />
        received
      </dt>
      <dd className="m-0 flex items-center justify-end gap-1.5 font-medium">
        {got ? (
          <>
            {got.amount < 0.01 ? got.amount.toPrecision(2) : got.amount.toFixed(4)}
            <span className="text-muted">{got.symbol}</span>
            <TokenIcon symbol={got.symbol} size={15} />
          </>
        ) : (
          '—'
        )}
      </dd>
      <dt className="flex items-center gap-2 whitespace-nowrap text-faint">
        <UserRound size={12} strokeWidth={1.9} />
        taker
      </dt>
      <dd className="m-0 flex items-center justify-end gap-1.5">
        {entry.taker ? (
          <>
            <span className="font-mono text-[11.5px] text-muted">
              {entry.taker.slice(0, 6)}…{entry.taker.slice(-4)}
            </span>
            {/*
             * The blockie, not the chip. Inside a card the address is a fact being reported, and
             * the chip is a link — a second way out of a panel that is already hovering over the
             * row it describes.
             */}
            <img
              src={identicon(entry.taker)}
              alt=""
              aria-hidden
              className="size-[15px] shrink-0 rounded-full"
            />
          </>
        ) : (
          '—'
        )}
      </dd>
      <dd className="col-span-2 m-0 border-t border-rule/60" />
      {/* An icon per line, because four rows of identical grey labels read as one block of text. */}
      <dt className="flex items-center gap-2 whitespace-nowrap text-faint">
        <Crosshair size={12} strokeWidth={1.9} />
        reference
      </dt>
      <dd className="m-0 text-right font-medium">
        {entry.referencePrice === undefined ? '—' : `$${formatPrice(entry.referencePrice)}`}
      </dd>
      <dt className="flex items-center gap-2 whitespace-nowrap text-faint">
        <Clock size={12} strokeWidth={1.9} />
        reference age
      </dt>
      <dd className="m-0 text-right font-medium">
        {/*
         * Part of the guarantee, not trivia. The guard refuses when it cannot prove its input is
         * fresh, so a fill cleared against a stale answer cleared a different bar.
         */}
        {entry.referenceAgeSeconds === undefined ? (
          '—'
        ) : (
          <span className={entry.referenceAgeSeconds > 600 ? 'text-refuse' : 'text-ink'}>
            {entry.referenceAgeSeconds}s
          </span>
        )}
      </dd>
      <dt className="flex items-center gap-2 whitespace-nowrap text-faint">
        <ShieldCheck size={12} strokeWidth={1.9} />
        clear of floor
      </dt>
      <dd className="m-0 text-right font-medium text-settle">
        {entry.bpsAboveFloor === undefined ? '—' : `+${entry.bpsAboveFloor} bps`}
      </dd>
      <dt className="flex items-center gap-2 whitespace-nowrap text-faint">
        <TrendingUp size={12} strokeWidth={1.9} />
        markout 30s
      </dt>
      <dd className="m-0 text-right font-medium">
        {entry.markout30sBps === undefined ? '—' : formatBps(entry.markout30sBps)}
      </dd>
      <dd className="col-span-2 m-0 mt-1 border-t border-rule/60 pt-2.5 text-[11.5px] leading-relaxed text-faint">
        {copy.desk.markoutNote}
      </dd>
    </dl>
  );
}

const FillRows = memo(function FillRows({
  entry,
  pair,
  onHint,
}: {
  entry: Fill;
  pair: Pair;
  onHint: (hint: Hint) => void;
}) {
  /*
   * Both legs of one swap are worth the same thing, so one figure serves both — but it has to be
   * read off the dollar leg. Multiplying an amount by the pair price only works when the amount is
   * in the base token: on a reverse fill it valued 1.5 tUSDC at six hundredths of a cent.
   */
  const quoteLeg = entry.gave?.symbol === pair.base ? entry.got : entry.gave;
  const usdIn = quoteLeg?.amount ?? entry.amount * entry.price;

  return (
    <>
      <tr
        onMouseMove={(e) => onHint({ content: <FillHint entry={entry} pair={pair} />, x: e.clientX, y: e.clientY })}
        onMouseLeave={() => onHint(null)}
        /*
         * Glass rather than a flat fill: the seabed is behind this table, and a solid row would
         * cut a hole in it. The tint is white at a few per cent, so it reads as depth over the
         * artwork rather than as a second colour competing with it.
         */
        className="tape-arrive transition-colors hover:bg-white/[0.045] [&>td]:border-b [&>td]:border-rule/70"
      >
        <td className="py-3 pr-2 pl-4">
          <SwapLeg amount={entry.gave?.amount ?? entry.amount} symbol={entry.gave?.symbol ?? pair.base} usd={usdIn} />
        </td>
        <td className="px-1 py-3 text-center text-faint">
          <ArrowRight size={13} strokeWidth={2} className="inline" />
        </td>
        <td className="py-3 pr-4 pl-2">
          <SwapLeg amount={entry.got?.amount ?? null} symbol={entry.got?.symbol ?? pair.quote} usd={usdIn} muted />
        </td>
        <td className="px-4 py-3">
          {/*
           * The counterparty, with a shape. The same taker repeated down the tape is invisible as
           * truncated hex and unmistakable as an identicon — which is the honest reading of this
           * venue right now: one bot on the other side of nearly every fill.
           */}
          {entry.taker ? <AddressChip address={entry.taker} /> : <span className="text-faint">—</span>}
        </td>
        <td className="t-num-lg px-4 py-3 text-right">${formatPrice(entry.price)}</td>
        <td className="t-num px-4 py-3 text-right">
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
            <span className="t-num w-11 text-right text-settle">
              {entry.bpsAboveFloor === undefined ? <span className="text-faint">—</span> : `+${entry.bpsAboveFloor}`}
            </span>
          </span>
        </td>
        <td className="px-4 py-3">
          <TxCell hash={entry.hash} stub={entry.tx} time={entry.time} />
        </td>
      </tr>

    </>
  );
});



/**
 * A revert this decoder does not recognise is not a refusal, and the tape does not claim it is:
 * an unrelated failure rendered as "the floor held" would be a lie in the owner's favour.
 *
 * Size stays em-dash on purpose. The revert carries rates, not amounts — the fill never happened,
 * so there is no size to report, and inventing one would undo the point of decoding.
 */
/**
 * The refusal's five numbers, on hover like every other row.
 *
 * It kept a click of its own because the detail is the argument rather than a footnote — but that
 * made the most important row on the tape the only one that behaved differently, and a reader who
 * had learned to hover everything else would never find it.
 */
function RefusalHint({
  decoded,
  vsRef,
}: {
  decoded: { attemptedPrice: number; floorPrice: number; bpsBelowFloor: number; gaveSymbol: string; gotSymbol: string };
  vsRef: number | null;
}) {
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-[12px]">
      <dt className="flex items-center gap-2 whitespace-nowrap text-faint">
        <ArrowDown size={12} strokeWidth={1.9} />
        tried to settle at
      </dt>
      <dd className="m-0 text-right font-medium text-refuse">${formatPrice(decoded.attemptedPrice)}</dd>
      <dt className="flex items-center gap-2 whitespace-nowrap text-faint">
        <ShieldCheck size={12} strokeWidth={1.9} />
        your floor
      </dt>
      <dd className="m-0 text-right font-medium text-floor">${formatPrice(decoded.floorPrice)}</dd>
      <dt className="flex items-center gap-2 whitespace-nowrap text-faint">
        <Crosshair size={12} strokeWidth={1.9} />
        below the floor by
      </dt>
      <dd className="m-0 text-right font-medium text-refuse">−{decoded.bpsBelowFloor} bps</dd>
      {vsRef !== null && (
        <>
          <dt className="flex items-center gap-2 whitespace-nowrap text-faint">
            <TrendingUp size={12} strokeWidth={1.9} />
            vs reference
          </dt>
          <dd className="m-0 text-right font-medium">{formatBps(vsRef)}</dd>
        </>
      )}
      <dd className="col-span-2 m-0 mt-1 border-t border-rule/60 pt-2.5 text-[11.5px] leading-relaxed text-faint">
        {copy.refusal.hint}
      </dd>
    </dl>
  );
}

const RefusalRows = memo(function RefusalRows({ entry, onHint }: { entry: Refusal; onHint: (hint: Hint) => void }) {
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
        onMouseMove={(e) =>
          onHint({
            content: <RefusalHint decoded={decoded} vsRef={vsRef} />,
            x: e.clientX,
            y: e.clientY,
          })
        }
        onMouseLeave={() => onHint(null)}
        title={copy.refusal.view}
        className={`cursor-pointer bg-refuse-wash text-refuse ${fresh ? 'tape-arrive-refuse' : ''}`}
      >
        <td className="py-3 pr-2 pl-4 shadow-[inset_2px_0_0_var(--c-refuse)]">
          <span className="flex items-center gap-3">
            {/* The shield is the floor holding, not an alarm: the refusal is the good outcome. */}
            <TradeMark symbol={decoded.gaveSymbol} kind="refused" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-[13px] font-semibold">Refused</span>
              {/*
               * No amounts on either leg, and never a zero. The revert carries rates only, because
               * nothing moved — a number here would contradict the line directly beneath the row.
               */}
              <span className="text-[11.5px] text-refuse/70">{decoded.gaveSymbol}</span>
            </span>
          </span>
        </td>
        <td className="px-1 py-3 text-center text-refuse/50">
          <ArrowRight size={13} strokeWidth={2} className="inline" />
        </td>
        <td className="py-3 pr-4 pl-2">
          <span className="flex items-center gap-2">
            <TokenIcon symbol={decoded.gotSymbol} size={22} />
            <span className="flex flex-col leading-tight">
              <span className="text-[13px] font-semibold text-refuse/70">
                — <span className="font-medium">{decoded.gotSymbol}</span>
              </span>
              <span className="text-[11.5px] text-refuse/50">nothing received</span>
            </span>
          </span>
        </td>
        <td className="px-4 py-3">
          {entry.from ? <AddressChip address={entry.from} /> : <span className="text-refuse/50">—</span>}
        </td>
        <td className="t-num-lg px-4 py-3 text-right">${formatPrice(decoded.attemptedPrice)}</td>
        <td className="t-num px-4 py-3 text-right">
          {vsRef === null ? <span className="text-refuse/50">—</span> : formatBps(vsRef)}
        </td>
        <td className="t-num px-4 py-3 text-right font-semibold">−{decoded.bpsBelowFloor}</td>
        <td className="px-4 py-3">
          <TxCell hash={entry.hash} stub={entry.tx} time={entry.time} />
        </td>
      </tr>

      <tr className={`bg-refuse-wash ${fresh ? 'tape-arrive-refuse' : ''} [&>td]:border-b [&>td]:border-rule`}>
        <td colSpan={8} className="px-4 pb-3 text-left text-[11.5px] text-refuse">
          <b className="font-semibold">{copy.refusal.heading}</b> — the agent tried to settle at{' '}
          {formatPrice(decoded.attemptedPrice)}, the venue refused ·{' '}
          <span className="text-ink">{copy.refusal.unchanged}</span>
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={8} className="p-0">
            <RefusalDetail entry={entry} decoded={decoded} />
          </td>
        </tr>
      )}
    </>
  );
});
