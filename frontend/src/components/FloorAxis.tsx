import type { Calibration } from '../types.ts';

/**
 * One axis, everything on it. Fills, the percentile markers, the reference and the floor handle
 * share one horizontal price axis, so "where do fills actually land" and "where is my floor" are
 * the same picture and dragging the handle is visibly moving into or away from the cloud.
 *
 * The reference sits at the right edge (zero adverse deviation); everything is drawn in bps
 * because that is what the registry stores, while the type above it is always a price.
 */
const SPAN_BPS = 400;

const positionOf = (bps: number) => (1 - Math.min(Math.abs(bps), SPAN_BPS) / SPAN_BPS) * 100;

export function FloorAxis({ calibration, floorBps }: { calibration: Calibration; floorBps: number }) {
  return (
    <div className="relative my-6 h-24 select-none">
      <div className="absolute inset-x-0 top-0 bottom-11">
        {calibration.fillsBps.map((bps, i) => (
          <span
            key={i}
            className="absolute size-[5px] -translate-x-1/2 rounded-full bg-dim/60"
            style={{ left: `${positionOf(bps)}%`, bottom: `${(i * 7) % 26}px` }}
          />
        ))}
      </div>

      <div className="absolute inset-x-0 bottom-8 h-px bg-line" />

      {[
        ['p50', calibration.p50Bps],
        ['p99', calibration.p99Bps],
      ].map(([name, bps]) => (
        <div
          key={name as string}
          className="absolute bottom-2 -translate-x-1/2 text-center text-[11px] whitespace-nowrap text-dim"
          style={{ left: `${positionOf(bps as number)}%` }}
        >
          <span className="mx-auto mb-1 block h-3 w-px bg-line" />
          {name} {bps} bps
        </div>
      ))}

      <div className="absolute bottom-7 h-3.5 w-0.5 -translate-x-1/2 bg-reference" style={{ left: '100%' }} />
      <div
        className="absolute bottom-6 h-5 w-3.5 -translate-x-1/2 rounded-sm bg-floor shadow-lg shadow-floor/40"
        style={{ left: `${positionOf(floorBps)}%` }}
      />
    </div>
  );
}
