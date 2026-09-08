import type { Calibration } from '../types.ts';

/**
 * How far below the reference each realized fill landed, as a distribution, with the floor drawn
 * across it in floor. The design problem this solves: the honest input is a distribution and a
 * non-quant cannot choose a percentile — so the screen shows the clump of real fills and where the
 * owner's line sits relative to it. Dragging the number is visibly moving toward or away from the
 * fills that actually happened.
 */
const SPAN_BPS = 120;
const BUCKETS = 30;

export function FloorHistogram({ calibration, floorBps }: { calibration: Calibration; floorBps: number }) {
  const counts = new Array(BUCKETS).fill(0) as number[];
  for (const bps of calibration.fillsBps) {
    const i = Math.min(BUCKETS - 1, Math.floor((Math.abs(bps) / SPAN_BPS) * BUCKETS));
    counts[i] = (counts[i] ?? 0) + 1;
  }
  const tallest = Math.max(1, ...counts);
  const floorLeft = Math.min(100, (floorBps / SPAN_BPS) * 100);
  // Past the two-thirds mark the label would hang off the right edge and give the whole sheet a
  // horizontal scrollbar, so it flips and reads back into the chart instead.
  const flipped = floorLeft > 66;

  return (
    <>
      <div className="relative m-0 flex h-[110px] items-end gap-0.5 overflow-x-clip border-b border-rule">
        {counts.map((n, i) => (
          <div
            key={i}
            className="min-h-0.5 flex-1 border-t-2 border-muted bg-sunken"
            style={{ height: `${(n / tallest) * 100}%` }}
          />
        ))}
        <div className="absolute top-[-12px] bottom-0 w-0 border-l-2 border-floor transition-[left] duration-300" style={{ left: `${floorLeft}%` }}>
          <span
            className={`absolute top-[-6px] rounded-lg bg-floor-wash px-1.5 py-0.5 text-[11px] font-semibold tracking-[0.1em] whitespace-nowrap text-floor uppercase ${
              flipped ? 'right-[7px]' : 'left-[7px]'
            }`}
          >
            your floor
          </span>
        </div>
      </div>

      <div className="mt-1.5 flex justify-between text-[11.5px] text-faint">
        <span>
          0 bps
          <br />
          <em className="not-italic opacity-75">market price</em>
        </span>
        <span>−40</span>
        <span>−80</span>
        <span>
          −120 bps
          <br />
          <em className="not-italic opacity-75">terrible</em>
        </span>
      </div>
    </>
  );
}
