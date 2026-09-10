/**
 * The fills a time window covers.
 *
 * Anchored on the newest **fill**, not on the newest thing in the tape, and that distinction is the
 * whole reason this is a named function with a test rather than two lines inside the chart.
 *
 * The tape carries refusals as well as fills, and they arrive from different places: fills come
 * from the index, refusals from `/api/refusals`, which walks recent transaction history. A refusal
 * is therefore routinely newer than every fill — and anchoring on it put the entire fill history
 * outside every window except "all", so 15m, 1h, 6h and 24h each drew an empty chart.
 *
 * Anchored on the newest fill rather than on the clock for a separate reason, which the chart used
 * to state and still holds: a venue that stopped trading an hour ago would otherwise show an empty
 * 15m window and look broken rather than quiet.
 */
export function fillsInWindow<T extends { kind: string; ts: number }>(
  tape: readonly T[],
  seconds: number | null,
  /*
   * Narrowed on the way out, not just filtered. The tape is a union and the caller reads fields
   * that only fills have — returning the union would have made every one of those an `any` at the
   * call site, which is how a refusal ends up being asked for its floor distance.
   */
): Extract<T, { kind: 'fill' }>[] {
  const fills = tape.filter((e): e is Extract<T, { kind: 'fill' }> => e.kind === 'fill');
  if (!seconds) return fills.slice();
  const newest = fills.reduce((max, f) => Math.max(max, f.ts), 0);
  return fills.filter((f) => f.ts >= newest - seconds);
}
