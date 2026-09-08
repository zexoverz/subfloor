import { useEffect, useRef } from 'react';
import { AreaSeries, createChart, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { floorPriceFromBps, rateToPrice } from '../lib/rate.ts';
import type { VaultState } from '../types.ts';
import { copy } from '../copy.ts';

/**
 * Fills over time, with the floor drawn across them.
 *
 * Deliberately not a TradingView embed. An embedded widget plots an exchange's own feed, which is
 * not what this vault traded and cannot carry the one line that matters — so this is TradingView's
 * charting library with our data in it: the price of every fill, and the owner's floor as a price
 * line the series is never allowed to cross.
 *
 * The reference is the second line. Where a fill sits between the two is the whole product.
 */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function PriceChart({
  state,
  status = 'live',
}: {
  state: VaultState;
  /*
   * The chart draws whatever is in `state.tape`, so while the reader is still asking it was
   * drawing nothing — or worse, sample fills — as a price history. A chart is read faster than a
   * table and argued with less, so an invented line is the most persuasive wrong thing on the
   * page. It waits instead.
   */
  status?: 'loading' | 'live' | 'empty' | 'failed';
}) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const fills = useRef<ISeriesApi<'Area'> | null>(null);
  const reference = useRef<ISeriesApi<'Area'> | null>(null);

  // Build once. Colours are read from the theme tokens so light and dark both work.
  useEffect(() => {
    if (!box.current) return;

    const ink = cssVar('--c-ink');
    const rule = cssVar('--c-rule');
    const faint = cssVar('--c-faint');
    const settle = cssVar('--c-settle');
    const floor = cssVar('--c-floor');

    const c = createChart(box.current, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: faint,
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: { vertLines: { color: rule, style: LineStyle.Dotted }, horzLines: { color: rule, style: LineStyle.Dotted } },
      rightPriceScale: { borderColor: rule },
      timeScale: { borderColor: rule, timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: faint, labelBackgroundColor: ink }, horzLine: { color: faint, labelBackgroundColor: ink } },
      localization: { priceFormatter: (p: number) => p.toFixed(2) },
    });

    reference.current = c.addSeries(AreaSeries, {
      lineColor: faint,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      topColor: 'transparent',
      bottomColor: 'transparent',
      priceLineVisible: false,
      lastValueVisible: false,
    });

    fills.current = c.addSeries(AreaSeries, {
      lineColor: settle,
      lineWidth: 2,
      topColor: `color-mix(in srgb, ${settle} 22%, transparent)`,
      bottomColor: 'transparent',
      priceLineVisible: false,
    });

    // The floor. Brass, solid, labelled — the one line on this chart that is not market data.
    fills.current.createPriceLine({
      price: floorPriceFromBps(state.reference.price, state.floor.maxAdverseBps),
      color: floor,
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: 'your floor',
    });

    // The absolute backstop: what holds if the reference goes quiet.
    fills.current.createPriceLine({
      price: rateToPrice(state.floor.absoluteRate, state.pair.baseDecimals, state.pair.quoteDecimals),
      color: floor,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: false,
      title: 'backstop',
    });

    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
    };
  }, [state.reference.price, state.floor, state.pair]);

  // Feed the series. Refusals are not fills and never enter the line — a refused price is a price
  // that did not happen, and drawing it would put the series through the floor.
  useEffect(() => {
    if (!fills.current || !reference.current) return;

    const points = state.tape
      .filter((e) => e.kind === 'fill')
      /*
       * A price the library refuses is an exception thrown during render, which takes the whole
       * board with it — so one unusable point must cost its own row and nothing else. The bound is
       * the library's own: it rejects anything outside ±9.007e13.
       */
      .filter((e) => Number.isFinite(e.price) && Math.abs(e.price) < 9e13)
      .map((e) => ({ time: e.ts as UTCTimestamp, value: e.price }))
      .sort((a, b) => a.time - b.time)
      .filter((p, i, all) => i === 0 || p.time !== all[i - 1]?.time);

    fills.current.setData(points);
    reference.current.setData(points.map((p) => ({ time: p.time, value: state.reference.price })));
  }, [state.tape, state.reference.price]);

  return (
    <div className="relative h-[300px] w-full">
      <div ref={box} className="h-full w-full" />
      {status !== 'live' && (
        /*
         * Covered rather than merely empty. A chart with axes and no line still reads as a price
         * history that happens to be flat, which is a claim; this says what is actually going on.
         */
        <div className="absolute inset-0 grid place-items-center bg-surface/85 text-[12px] text-faint">
          {status === 'loading' ? (
            <span className="flex items-center gap-2">
              <span className="size-1.5 animate-pulse rounded-full bg-floor" />
              {copy.desk.chartLoading}
            </span>
          ) : (
            <span className="flex flex-col items-center gap-2.5 px-6 text-center">
              {/* Smaller than the tape's: the chart is the shorter of the two panels. */}
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
  );
}
