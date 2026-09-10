/**
 * The dotted way between one section and the next, with something living on it.
 *
 * The page is a scene at the top and a stack of panels below it, and the join was abrupt in both
 * directions — the artwork stopped, and then nothing on the rest of the page remembered it. This is
 * what carries the seabed down through the argument: a route, drawn the way a route is drawn, and a
 * creature travelling it.
 *
 * Decoration, and only that. `aria-hidden`, no text, nothing to press — a screen reader gets the
 * sections and none of this, which is right, because none of it says anything the sections do not.
 */

/**
 * Drawn on a 48-unit grid, in strokes rather than fills, so one `currentColor` sets each of them
 * and the weight stays even between creatures at any size.
 */
const CREATURES = {
  crab: (
    <>
      <ellipse cx="24" cy="27" rx="11" ry="7.5" />
      <circle cx="20" cy="25" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="28" cy="25" r="1.1" fill="currentColor" stroke="none" />
      <path d="M21 30q3 2 6 0" />
      <path d="M18 20.5v-3" />
      <path d="M30 20.5v-3" />
      <circle cx="18" cy="16.5" r="1.3" />
      <circle cx="30" cy="16.5" r="1.3" />
      <path d="M13 24 8 20q-2-1.5-3 .5" />
      <path d="M5 20.5q2.5-2 4 .5" />
      <path d="M35 24l5-4q2-1.5 3 .5" />
      <path d="M43 20.5q-2.5-2-4 .5" />
      <path d="M14 31l-5 3" />
      <path d="M15 34l-4 4" />
      <path d="M34 31l5 3" />
      <path d="M33 34l4 4" />
    </>
  ),
  shark: (
    <>
      <path d="M11 24c5-7 15-9 22-7 5 1.5 8 4.5 10 7-2 2.5-5 5.5-10 7-7 2-17 0-22-7z" />
      <path d="M11 24 4 17v14z" />
      <path d="M24 17.5l3.5-6.5 4 6" />
      <path d="M22 30l1.5 5.5 4.5-4" />
      <circle cx="37" cy="22.5" r="1.15" fill="currentColor" stroke="none" />
      <path d="M41 26.5q-3 .8-5 .3" />
      <path d="M30 21q1.5 2.5 0 5" />
      <path d="M27 20.5q1.5 3 0 6" />
    </>
  ),
  star: (
    <>
      <path d="M24 8l5.5 11.5L42 21l-9 8.5 2.4 12L24 35.5 12.6 41.5 15 29.5 6 21l12.5-1.5z" />
      <circle cx="21" cy="23" r="1" fill="currentColor" stroke="none" />
      <circle cx="27" cy="23" r="1" fill="currentColor" stroke="none" />
      <path d="M22 27q2 1.5 4 0" />
    </>
  ),
  octopus: (
    <>
      <path d="M12 26a12 10 0 0 1 24 0z" />
      <circle cx="20" cy="22" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="28" cy="22" r="1.15" fill="currentColor" stroke="none" />
      <path d="M21 25.5q3 2 6 0" />
      <path d="M13 26q-1 6 2 7t2-5" />
      <path d="M19 26q-1 7 2 8t2-5" />
      <path d="M27 26q1 7-2 8t-2-5" />
      <path d="M33 26q1 6-2 7t-2-5" />
    </>
  ),
  fish: (
    <>
      <path d="M10 24q7-8 18-6 7 1.5 10 6-3 4.5-10 6-11 2-18-6z" />
      <path d="M10 24 4 18v12z" />
      <circle cx="31" cy="22" r="1.1" fill="currentColor" stroke="none" />
      <path d="M22 19q2 5 0 10" />
    </>
  ),
} as const;

export type Creature = keyof typeof CREATURES;

export function SeaTrail({
  creature,
  /** Which way the route bends, so two in a row do not draw the same shape twice. */
  down = true,
}: {
  creature: Creature;
  down?: boolean;
}) {
  const path = down ? 'M0 6 C 300 6 340 74 620 74 S 880 20 1000 20' : 'M0 74 C 300 74 340 6 620 6 S 880 60 1000 60';

  return (
    <div className="pointer-events-none relative my-6 h-20 w-full" aria-hidden>
      {/*
        * `preserveAspectRatio="none"` so the route spans whatever width the column has, and
        * `vector-effect` so stretching it does not stretch the stroke with it. Dashes rather than
        * dots for the same reason: a round dot pulled across 1000 units is an oval.
        */}
      <svg
        viewBox="0 0 1000 80"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full text-floor/35"
      >
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="1 14"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* On the route rather than beside it: the bend's own end, which is where a traveller would be. */}
      <svg
        viewBox="0 0 48 48"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`absolute size-[52px] text-floor/70 ${down ? 'top-7 left-[56%]' : 'top-0 left-[56%]'}`}
      >
        {CREATURES[creature]}
      </svg>
    </div>
  );
}
