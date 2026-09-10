/**
 * The seabed continuing down the page, at the edges of the viewport.
 *
 * The hero is a scene; everything under it was a stack of panels on flat ground, and a dotted route
 * between them was too thin a thread to carry the one into the other. These are the scene itself,
 * bleeding in from the left and right of the window on either side of the column — the reader stays
 * in the water for the length of the argument.
 *
 * **Backgrounds rather than `<img>`, and that is the whole failure mode handled.** A file that is
 * not there renders as nothing at all: no broken-image glyph, no reserved box, no layout that moves
 * when it arrives. The page is complete without any of them and better with each one.
 *
 * They sit outside the 1100px column, behind everything, `aria-hidden`, and clipped by the
 * landing's own `overflow-x: clip` — art that reaches past the edge is the point, and a horizontal
 * scrollbar is not.
 *
 * `hidden lg:block` is a weight decision as much as a layout one. Below that width the column runs
 * close enough to the edge that they would sit under the text, and a background image inside a
 * `display: none` element is never fetched — so a phone downloads none of the six.
 */

export function SideReef({
  art,
  side,
  /**
   * How far the foot sits below the section's own end.
   *
   * Anchored to the bottom rather than the top, because a reef grows off a seabed and the seabed is
   * down. Hung from the top it floated: its base dissolved in mid-water halfway down the section
   * with nothing under it. Negative by default so the foot runs past the section's end and into the
   * wave that follows, which is what puts it *on* something instead of near it.
   */
  bottom = '-70px',
  width = 'clamp(140px, 18vw, 320px)',
  /** Turned down where the column runs close to the edge, and left alone where it does not. */
  opacity = 0.85,
}: {
  art: string;
  side: 'left' | 'right';
  bottom?: string;
  width?: string;
  opacity?: number;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -z-10 hidden lg:block"
      style={{ [side]: 'calc(50% - 50vw)', bottom, width, height: `calc(${width} * 1.5)` }}
    >
      <div
        className="absolute inset-0 bg-no-repeat"
        style={{
          backgroundImage: `url(/reef/${art}.webp)`,
          /*
           * The box is the picture's own shape — width from the caller, height from the 2:3 the six
           * files share — and the background fills it exactly.
           *
           * It was `contain` inside a box 120% of the section's height, which is where an earlier
           * fade went wrong: `contain` centres the picture in a taller box, so the mask dissolved
           * the empty space above and below it and left the artwork's own edges untouched.
           */
          backgroundSize: '100% 100%',
          opacity,
          /* Only the top. The foot is covered by the wave below rather than faded. */
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 16%, black 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 16%, black 100%)',
        }}
      />

    </div>
  );
}
