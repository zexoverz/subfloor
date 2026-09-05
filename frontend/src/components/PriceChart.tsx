import { useEffect, useRef } from 'react';
import { AreaSeries, createChart, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { floorPriceFromBps, rateToPrice } from '../lib/rate.ts';
import type { VaultState } from '../types.ts';

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

export function PriceChart({ state }: { state: VaultState }) {
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
    const brass = cssVar('--c-brass');

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
      color: brass,
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: 'your floor',
    });

    // The absolute backstop: what holds if the reference goes quiet.
    fills.current.createPriceLine({
      price: rateToPrice(state.floor.absoluteRate, state.pair.baseDecimals, state.pair.quoteDecimals),
      color: brass,
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
      .map((e) => ({ time: e.ts as UTCTimestamp, value: e.price }))
      .sort((a, b) => a.time - b.time)
      .filter((p, i, all) => i === 0 || p.time !== all[i - 1]?.time);

    fills.current.setData(points);
    reference.current.setData(points.map((p) => ({ time: p.time, value: state.reference.price })));
  }, [state.tape, state.reference.price]);

  return <div ref={box} className="h-[300px] w-full" />;
}
