/**
 * One fill's distance from the floor. The floor is the fixed left edge and the reference a dashed
 * tick on the right: the floor is the axis of the product, so it is the axis of the chart. A number
 * alone tells you the fill was 72 bps clear; the bar tells you what 72 bps looks like against every
 * other fill in the column.
 */
export function FillBar({ bpsAboveFloor, spanBps = 140 }: { bpsAboveFloor: number; spanBps?: number }) {
  const width = Math.max(2, Math.min(100, (bpsAboveFloor / spanBps) * 100));
  return (
    <span className="relative inline-block h-3 w-full border-l-2 border-brass align-middle">
      <span className="absolute top-[4px] left-0 h-1 rounded-full bg-settle/45" style={{ width: `${width}%` }} />
      <span className="absolute inset-y-0 right-0 border-l border-dashed border-faint/60" />
      <span className="absolute top-0 h-3 w-[3px] bg-settle" style={{ left: `calc(${width}% - 1px)` }} />
    </span>
  );
}
