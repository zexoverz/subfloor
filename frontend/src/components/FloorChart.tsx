import { useEffect, useRef, useState } from 'react';
import {
  AreaSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { BarChart3, Clock, Crosshair, ShieldCheck } from 'lucide-react';
import { copy } from '../copy.ts';
import { RowHint, type Hint } from './RowHint.tsx';
import { formatBps, formatUsd } from '../lib/rate.ts';
import type { Pair, TapeEntry, VaultState } from '../types.ts';
import { FillHint } from './Tape.tsx';

/**
 * A theme token, or a literal when it cannot be read.
 *
 * An empty string is a colour the canvas ignores, and a series drawn in nothing looks exactly like
 * a series with no data — so a token that fails to resolve would send anyone reading this straight
 * to the query instead of the stylesheet.
 */
function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/**
 * A hex token with an alpha channel, because the canvas cannot take `color-mix`.
 *
 * That function is CSS, and this chart paints into a 2D context — which silently ignores a fill it
 * cannot parse rather than warning about it. The area under the line and every bar were being
 * given one, so both drew nothing while the axis, the grid and the header all worked, which is
 * exactly the sort of failure that looks like missing data.
 */
function alpha(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const channel = Math.round(Math.min(1, Math.max(0, amount)) * 255).toString(16).padStart(2, '0');
  return `#${full}${channel}`;
}

/**
 * Distance from the floor, in basis points, with the floor as zero.
 *
 * This used to be a price chart, and a price chart could not tell the truth here. Two reasons.
 *
 * The range: twenty-four fills spanning 2490.11 to 2490.12 lock the axis to two hundredths of a
 * point, so the floor at 2460 falls off the bottom and what is left is noise drawn thick.
 *
 * And the orientation: a rate is received-per-given, so when the vault is the buyer its floor is a
 * *maximum* price. Plotted on a price axis, a fill 43 bps better than its floor appears below it —
 * the chart would state the opposite of the truth for half the fills on this venue.
 *
 * Basis points cannot do that. Above zero means the floor held, whichever side the vault was on
 * and whoever the maker was — which is also what lets the public tape draw every maker's fills on
 * one axis, against each of their own floors.
 */
/**
 * A skyline, because that is the shape this chart makes.
 *
 * A spinner says only that something is happening; bars of uneven height in the space the bars
 * will occupy say what is coming, and the panel does not change shape when it arrives. Heights
 * come from the index rather than at random so the same skeleton draws twice the same way.
 */
/** A signed bps figure, or a dash when there is nothing to show rather than a zero. */
function fmtBps(value: number | undefined, signed = false): string {
  if (value === undefined) return '—';
  return signed ? formatBps(Math.round(value)) : `+${Math.round(value)}`;
}

/** The fill under the cursor, described by the same card the tape uses. */
function ChartHint({
  at,
  tape,
  pair,
}: {
  at: { floor?: number; ref?: number; size?: number; time?: number };
  tape: TapeEntry[];
  pair: Pair;
}) {
  const fill = tape.find((e) => e.kind === 'fill' && e.ts === at.time);
  if (fill && fill.kind === 'fill') return <FillHint entry={fill} pair={pair} />;

  /*
   * No fill at that second — the crosshair sits between points, or on a row the reader filtered
   * out. The reading is still true, so it is shown rather than the card disappearing under the
   * cursor.
   */
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-[12px]">
      <dt className="flex items-center gap-2 whitespace-nowrap text-faint">
        <Clock size={12} strokeWidth={1.9} />
        {copy.desk.chartAt}
      </dt>
      <dd className="m-0 text-right font-medium">
        {at.time
          ? new Date(at.time * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
          : '—'}
      </dd>
      <dt className="flex items-center gap-2 whitespace-nowrap text-faint">
        <ShieldCheck size={12} strokeWidth={1.9} />
        {copy.desk.chartAboveFloor}
      </dt>
      <dd className="m-0 text-right font-medium text-settle">{fmtBps(at.floor)}</dd>
      <dt className="flex items-center gap-2 whitespace-nowrap text-faint">
        <Crosshair size={12} strokeWidth={1.9} />
        {copy.desk.chartVsRef}
      </dt>
      <dd className="m-0 text-right font-medium text-refuse">{fmtBps(at.ref, true)}</dd>
      <dt className="flex items-center gap-2 whitespace-nowrap text-faint">
        <BarChart3 size={12} strokeWidth={1.9} />
        {copy.desk.chartThisFill}
      </dt>
      <dd className="m-0 text-right font-medium">{at.size === undefined ? '—' : formatUsd(at.size)}</dd>
    </dl>
  );
}

function SkylineSkeleton() {
  return (
    <div className="flex h-full w-full items-end gap-[3px] px-4 pt-8 pb-10">
      {Array.from({ length: 48 }, (_, i) => {
        // Two out-of-step waves, so the run reads as a distribution rather than a pattern.
        const height = 22 + Math.abs(Math.sin(i * 0.7)) * 46 + Math.abs(Math.sin(i * 0.23)) * 26;
        return (
          <span
            key={i}
            className="flex-1 animate-pulse rounded-t bg-rule/70"
            style={{ height: `${height}%`, animationDelay: `${i * 34}ms` }}
          />
        );
      })}
    </div>
  );
}

/**
 * Windows offered only when they would change what is on screen.
 *
 * A control listing 7d and 30d over four hours of history is a control where four of the six
 * options do the same thing — it looks like a product and behaves like a decoration. So the list
 * is derived from the span that exists: a window is offered once there is more history than it
 * covers, and `all` is always there because it is the only one that cannot be empty.
 */
const WINDOWS = [
  { id: '15m', label: '15m', seconds: 15 * 60 },
  { id: '1h', label: '1h', seconds: 60 * 60 },
  { id: '6h', label: '6h', seconds: 6 * 60 * 60 },
  { id: '24h', label: '24h', seconds: 24 * 60 * 60 },
  { id: '7d', label: '7d', seconds: 7 * 24 * 60 * 60 },
] as const;

export function FloorChart({
  state,
  status = 'live',
  scope,
}: {
  state: VaultState;
  status?: 'loading' | 'live' | 'empty' | 'failed';
  scope: 'mine' | 'public';
}) {
  const box = useRef<HTMLDivElement>(null);
  const [window_, setWindow] = useState<string>('all');
  /** What the crosshair is over, so hovering the shape reads the numbers under it. */
  const [at, setAt] = useState<{ floor?: number; ref?: number; size?: number; time?: number } | null>(null);
  /** The same card the tape uses, rather than a second way of saying the same thing. */
  const [hint, setHint] = useState<Hint>(null);
  /*
   * Read through refs inside the crosshair handler. That subscription is made once, with the chart,
   * so a value captured there would be the one from the render that built it and would never move.
   */
  const tape = useRef(state.tape);
  const pair = useRef(state.pair);
  tape.current = state.tape;
  pair.current = state.pair;
  const chart = useRef<IChartApi | null>(null);
  const floorLine = useRef<ISeriesApi<'Area'> | null>(null);
  const refLine = useRef<ISeriesApi<'Line'> | null>(null);
  const volume = useRef<ISeriesApi<'Histogram'> | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const rule = cssVar('--c-rule', '#18406e');
    const faint = cssVar('--c-faint', '#7d95b6');
    const settle = cssVar('--c-settle', '#40b66b');
    const floor = cssVar('--c-floor', '#0ee6ea');
    const refuse = cssVar('--c-refuse', '#fa2b39');

    const c = createChart(box.current, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: faint,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 10,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: rule, style: LineStyle.Dotted } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.34 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: faint, style: LineStyle.Dotted }, horzLine: { color: faint, style: LineStyle.Dotted } },
      localization: { priceFormatter: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}` },
    });

    // Distance from the floor. Filled, because the area between it and zero is the guarantee.
    floorLine.current = c.addSeries(AreaSeries, {
      lineColor: settle,
      lineWidth: 2,
      topColor: alpha(settle, 0.3),
      bottomColor: alpha(settle, 0),
      priceLineVisible: false,
      lastValueVisible: true,
    });

    // Zero is the floor itself, and it is the only line here that is not measured data.
    floorLine.current.createPriceLine({
      price: 0,
      color: floor,
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: scope === 'mine' ? copy.desk.chartFloorMine : copy.desk.chartFloorPublic,
    });

    // Distance from the reference. Thin and dashed: it is context, not the promise.
    refLine.current = c.addSeries(LineSeries, {
      color: refuse,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // Volume, on its own scale in the bottom third rather than in a second chart that would need
    // its time axis kept in step with this one by hand.
    volume.current = c.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      color: alpha(floor, 0.45),
    });
    c.priceScale('volume').applyOptions({ scaleMargins: { top: 0.76, bottom: 0 } });

    /*
     * The values under the cursor. A crosshair that shows only its own coordinates makes the
     * reader estimate two lines against an axis; this reads them off directly, which is the
     * difference between a chart that can be checked and one that can only be admired.
     */
    c.subscribeCrosshairMove((param) => {
      if (!param.time || !floorLine.current || !refLine.current || !volume.current) {
        setAt(null);
        setHint(null);
        return;
      }
      const num = (v: unknown) =>
        v && typeof v === 'object' && 'value' in v ? (v as { value: number }).value : undefined;
      const reading = {
        time: param.time as number,
        floor: num(param.seriesData.get(floorLine.current)),
        ref: num(param.seriesData.get(refLine.current)),
        size: num(param.seriesData.get(volume.current)),
      };
      setAt(reading);

      /*
       * Positioned from the chart's own box, because the crosshair reports coordinates inside the
       * canvas and the card is placed against the viewport.
       */
      const rect = box.current?.getBoundingClientRect();
      if (!rect || !param.point) {
        setHint(null);
        return;
      }
      /*
       * The crosshair reports a time, and the fill at that time is what the reader is pointing at
       * — so the card is the tape's, not a second one carrying half the same numbers. A chart that
       * can only say "+43 bps" leaves out the trade that produced it.
       */
      setHint({
        content: <ChartHint at={reading} tape={tape.current} pair={pair.current} />,
        x: rect.left + param.point.x,
        y: rect.top + param.point.y,
      });
    });

    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
    };
  }, [scope]);

  useEffect(() => {
    if (!floorLine.current || !refLine.current || !volume.current) return;

    const chosen = WINDOWS.find((w) => w.id === window_);
    const newest = state.tape.reduce((max, e) => Math.max(max, e.ts), 0);
    const fills = state.tape
      .filter((e) => e.kind === 'fill')
      // Measured back from the most recent fill rather than from now: a venue that stopped trading
      // an hour ago would otherwise show an empty 15m window and look broken.
      .filter((e) => !chosen || e.ts >= newest - chosen.seconds)
      .slice()
      .sort((a, b) => a.ts - b.ts)
      // One point per second, because two fills in the same second are one x-position.
      .filter((f, i, all) => i === 0 || f.ts !== all[i - 1]?.ts);

    floorLine.current.setData(
      fills
        .filter((f) => f.bpsAboveFloor !== undefined)
        .map((f) => ({ time: f.ts as UTCTimestamp, value: f.bpsAboveFloor as number })),
    );
    refLine.current.setData(
      fills
        .filter((f) => f.vsReferenceBps !== undefined)
        .map((f) => ({ time: f.ts as UTCTimestamp, value: f.vsReferenceBps as number })),
    );
    volume.current.setData(
      fills.map((f) => ({ time: f.ts as UTCTimestamp, value: f.amount * f.price })),
    );

    /*
     * Fit the axis to what there is. Left alone the scale keeps whatever span it was given and
     * packs two dozen points into the right quarter of the panel, so most of the chart is empty
     * and the part carrying the argument is the part squeezed smallest.
     */
    chart.current?.timeScale().fitContent();
  }, [state.tape, window_]);

  const latest = [...state.tape].reverse().find((e) => e.kind === 'fill');
  /*
   * Only fills whose distance from the floor is known. `?? 0 >= 0` counted an unknown as a pass,
   * so the footer reported every fill clearing the floor on a tape where the index had recorded no
   * floor at all — the one number on this card that is a claim rather than a description.
   */
  /*
   * Only windows narrower than the history, plus `all`. Offering 7d over four hours of data is a
   * control where most options do nothing, which is worse than having fewer.
   */
  const times = state.tape.map((e) => e.ts).filter((t) => t > 0);
  const span = times.length > 1 ? Math.max(...times) - Math.min(...times) : 0;
  const offered = WINDOWS.filter((w) => span > w.seconds);

  const measured = state.tape.flatMap((e) =>
    e.kind === 'fill' && e.bpsAboveFloor !== undefined ? [e.bpsAboveFloor] : [],
  );
  const held = measured.filter((bps) => bps >= 0).length;
  const traded = state.tape
    .filter((e) => e.kind === 'fill')
    .reduce((sum, f) => sum + f.amount * f.price, 0);

  return (
    <div className="relative">
      {/*
       * The header reads the crosshair when there is one and the latest fill when there is not, so
       * the same three slots answer "where is it now" and "what was it there" without the numbers
       * moving somewhere else to do it.
       */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-4 pt-3 pb-2">
        <span className="flex items-baseline gap-2">
          <span className="t-num-lg text-settle">
            {status === 'loading' ? '—' : fmtBps(at?.floor ?? latest?.bpsAboveFloor)}
          </span>
          <span className="text-[11.5px] text-faint">
            {at ? copy.desk.chartAtCursor : copy.desk.chartAboveFloor}
          </span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="t-num text-refuse">
            {status === 'loading' ? '—' : fmtBps(at?.ref ?? latest?.vsReferenceBps, true)}
          </span>
          <span className="text-[11.5px] text-faint">{copy.desk.chartVsRef}</span>
        </span>
        <span className="ml-auto flex items-center gap-3">
          <span className="flex items-baseline gap-2">
            <span className="t-num text-ink">
              {status === 'loading' ? '—' : formatUsd(at?.size ?? traded)}
            </span>
            <span className="text-[11.5px] text-faint">
              {at ? copy.desk.chartThisFill : copy.desk.chartTraded}
            </span>
          </span>
          {offered.length > 0 && (
            <span className="flex items-center gap-0.5 rounded-lg border border-rule bg-sunken p-0.5">
              {[...offered, { id: 'all', label: 'All', seconds: 0 }].map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWindow(w.id)}
                  className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                    window_ === w.id ? 'bg-raise font-semibold text-ink' : 'text-faint hover:text-muted'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </span>
          )}
        </span>
      </div>

      <div className="relative h-[260px] w-full">
        {/*
         * The glow is a blurred wash behind the canvas rather than a filter on it. A drop-shadow
         * on the chart element blurs the gridlines and the axis text with the series, which is how
         * a chart stops being readable in exchange for looking expensive.
         */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/4 bottom-1/3 blur-2xl"
          style={{
            background:
              'radial-gradient(60% 100% at 50% 50%, color-mix(in srgb, var(--c-settle) 26%, transparent), transparent 70%)',
          }}
        />
        <div ref={box} className="relative h-full w-full" />
        <RowHint hint={hint} />

        {status !== 'live' && (
          /*
           * No background of its own. The card is already glass over the seabed, and any wash here
           * — opaque or not — paints over that glass and leaves this one panel looking like a flat
           * hole in a board made of them. The skeleton fills the space by itself, which is the job
           * a scrim was doing badly.
           */
          <div className="absolute inset-0 grid place-items-center text-[12px] text-faint">
            {status === 'loading' ? (
              <SkylineSkeleton />
            ) : (
              <span className="flex flex-col items-center gap-2.5 px-6 text-center">
                <img
                  src="/empty-chest.webp"
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="w-[168px] max-w-[46%] select-none opacity-95"
                />
                <span className="serif max-w-[42ch] text-[13px] leading-relaxed text-muted">
                  {status === 'failed' ? copy.desk.tapeUnreachable : copy.desk.tapeEmpty}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer: what the shape above is worth as a claim, which is a count rather than a curve. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-rule px-4 py-2.5 text-[11.5px] text-faint">
        <span>
          {/*
           * "0 of 0 fills stayed above your floor" is a sentence that reads as a failure. While
           * the reader is still waiting there is nothing to count, so it says so instead.
           */}
          {status === 'loading' ? (
            copy.desk.chartLoading
          ) : (
            <>
              <b className="font-semibold text-settle">{held}</b>
              {' of '}
              <b className="font-semibold text-ink">{measured.length}</b>{' '}
              {scope === 'mine' ? copy.desk.chartHeldMine : copy.desk.chartHeldPublic}
            </>
          )}
        </span>
        <span>{copy.desk.chartAxis}</span>
      </div>
    </div>
  );
}
