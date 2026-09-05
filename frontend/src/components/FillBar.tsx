/**
 * One fill's distance from the floor. The floor is the fixed left edge and the reference a dashed
 * tick: the floor is the axis of the product, so it is the axis of the chart.
 */
export function FillBar({ bpsAboveFloor, spanBps = 120 }: { bpsAboveFloor: number; spanBps?: number }) {
  const width = Math.min(100, (bpsAboveFloor / spanBps) * 100);
  return (
    <div className="relative h-4 border-l-2 border-floor">
      <div className="absolute top-[5px] left-0 h-1.5 rounded-full bg-line" style={{ width: `${width}%` }} />
      <div className="absolute inset-y-0 right-0 border-l border-dashed border-reference" />
      <div
        className="absolute top-0.5 h-3 w-2 -translate-x-1/2 rounded-sm bg-good"
        style={{ left: `${width}%` }}
      />
    </div>
  );
}
