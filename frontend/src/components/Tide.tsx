/**
 * Water at the foot of a panel.
 *
 * Four bands, each deeper than the last and each travelling at its own period, so they never come
 * into step and the stack reads as depth rather than as one shape repeated. It is the same water
 * the landing page's currents are made of, and the one ornament this product can carry without it
 * being about something else: it is a floor, in a product whose whole argument is that there is a
 * bottom.
 *
 * Behind everything and out of the accessibility tree — it says nothing the numbers do not.
 *
 * **The opacities are measured, not chosen.** Where all four overlap they compound: at 10/9/8/10
 * the union is 0.32, which over the sunken ground reaches #055464 and drops `text-faint` to 2.78.
 * At 6/5/4.5/6 the union is 0.20 and the ground is #03394b, where faint reads 4.05 and muted 5.15.
 * Anything sitting on the deep end wants to be muted or better.
 */
const BANDS = [
  { y: 18, opacity: 0.06, cls: 'well-tide-slow' },
  { y: 27, opacity: 0.05, cls: '' },
  { y: 36, opacity: 0.045, cls: 'well-tide-slow well-tide-deep' },
  { y: 45, opacity: 0.06, cls: 'well-tide-deep' },
] as const;

export function Tide({
  height = 76,
  /**
   * A multiplier on all four, for a panel whose own ground is lighter than the well's.
   *
   * The same water on `--c-surface` rather than `--c-sunken` composites to #04425b, where
   * `text-faint` measures 3.54 — and the feature cards put faint labels right in it. At half depth
   * the ground is #022f4a and faint reads 4.54. The bands are still four and still moving; there
   * is simply less of them, which is what a lighter panel can carry.
   */
  depth = 1,
}: {
  height?: number;
  depth?: number;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden"
      style={{ height }}
    >
      {BANDS.map((band) => (
        <svg
          key={band.y}
          viewBox="0 0 1200 60"
          preserveAspectRatio="none"
          className={`well-tide ${band.cls} absolute bottom-0 h-full`}
          fill="var(--c-floor)"
          opacity={band.opacity * depth}
        >
          <path
            d={`M0 ${band.y} Q 75 ${band.y - 18} 150 ${band.y} T 300 ${band.y} T 450 ${band.y} T 600 ${band.y} T 750 ${band.y} T 900 ${band.y} T 1050 ${band.y} T 1200 ${band.y} V60 H0 Z`}
          />
        </svg>
      ))}
    </div>
  );
}
