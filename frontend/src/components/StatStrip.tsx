import { copy } from '../copy.ts';
import { formatBps } from '../lib/rate.ts';
import type { Stats } from '../types.ts';

/**
 * Zone 1: the submission line as UI. On submission morning the claim is read off this strip, so
 * every figure here is one the index can prove — refusals included, which is why they are a
 * headline stat and never buried.
 */
export function StatStrip({ stats, showLive = true }: { stats: Stats; showLive?: boolean }) {
  const items: [string, string | number][] = [
    [copy.stats.fills, stats.fills],
    [copy.stats.median, formatBps(stats.medianVsMidBps)],
    [copy.stats.worst, formatBps(stats.worstFillAboveFloorBps)],
    [copy.stats.refused, stats.refused],
    [copy.stats.since, stats.since],
  ];
  return (
    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
      {items.map(([label, value]) => (
        <div key={label}>
          <span className="block text-[11px] tracking-[0.08em] text-dim uppercase">{label}</span>
          <b className="num text-lg font-semibold">{value}</b>
        </div>
      ))}
      {showLive && stats.live && (
        <div className="ml-auto self-center text-xs text-good">● {copy.live.live}</div>
      )}
    </div>
  );
}
