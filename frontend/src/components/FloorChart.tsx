import { useEffect, useRef } from 'react';
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
import { copy } from '../copy.ts';
import { formatBps, formatUsd } from '../lib/rate.ts';
import type { VaultState } from '../types.ts';

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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
  const chart = useRef<IChartApi | null>(null);
  const floorLine = useRef<ISeriesApi<'Area'> | null>(null);
  const refLine = useRef<ISeriesApi<'Line'> | null>(null);
  const volume = useRef<ISeriesApi<'Histogram'> | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const rule = cssVar('--c-rule');
    const faint = cssVar('--c-faint');
    const settle = cssVar('--c-settle');
    const floor = cssVar('--c-floor');
    const refuse = cssVar('--c-refuse');

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
      topColor: `color-mix(in srgb, ${settle} 30%, transparent)`,
      bottomColor: 'transparent',
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
      color: `color-mix(in srgb, ${floor} 45%, transparent)`,
    });
    c.priceScale('volume').applyOptions({ scaleMargins: { top: 0.76, bottom: 0 } });

    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
    };
  }, [scope]);

  useEffect(() => {
    if (!floorLine.current || !refLine.current || !volume.current) return;

    const fills = state.tape
      .filter((e) => e.kind === 'fill')
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
  }, [state.tape]);

  const latest = [...state.tape].reverse().find((e) => e.kind === 'fill');
  const held = state.tape.filter((e) => e.kind === 'fill' && (e.bpsAboveFloor ?? 0) >= 0).length;
  const traded = state.tape
    .filter((e) => e.kind === 'fill')
    .reduce((sum, f) => sum + f.amount * f.price, 0);

  return (
    <div className="relative">
      {/* Header: the three numbers a reader wants before they read the shape. */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-4 pt-3 pb-2">
        <span className="flex items-baseline gap-2">
          <span className="t-num-lg text-settle">
            {latest?.bpsAboveFloor === undefined ? '—' : `+${latest.bpsAboveFloor}`}
          </span>
          <span className="text-[11.5px] text-faint">{copy.desk.chartAboveFloor}</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="t-num text-refuse">
            {latest?.vsReferenceBps === undefined ? '—' : formatBps(latest.vsReferenceBps)}
          </span>
          <span className="text-[11.5px] text-faint">{copy.desk.chartVsRef}</span>
        </span>
        <span className="ml-auto flex items-baseline gap-2">
          <span className="t-num text-ink">{formatUsd(traded)}</span>
          <span className="text-[11.5px] text-faint">{copy.desk.chartTraded}</span>
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

        {status !== 'live' && (
          <div className="absolute inset-0 grid place-items-center bg-surface/85 text-[12px] text-faint">
            {status === 'loading' ? (
              <span className="flex items-center gap-2">
                <span className="size-1.5 animate-pulse rounded-full bg-floor" />
                {copy.desk.chartLoading}
              </span>
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
          <b className="font-semibold text-settle">{held}</b>
          {' of '}
          <b className="font-semibold text-ink">{state.tape.filter((e) => e.kind === 'fill').length}</b>{' '}
          {scope === 'mine' ? copy.desk.chartHeldMine : copy.desk.chartHeldPublic}
        </span>
        <span>{copy.desk.chartAxis}</span>
      </div>
    </div>
  );
}
