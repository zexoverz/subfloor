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
  /** How far down its section it starts, and how tall it stands. Both in the section's own terms. */
  top = '-10%',
  height = '120%',
  width = 'clamp(120px, 17vw, 300px)',
  /** Turned down where the column runs close to the edge, and left alone where it does not. */
  opacity = 0.85,
}: {
  art: string;
  side: 'left' | 'right';
  top?: string;
  height?: string;
  width?: string;
  opacity?: number;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -z-10 hidden bg-contain bg-no-repeat lg:block"
      style={{
        backgroundImage: `url(/reef/${art}.webp)`,
        backgroundPosition: side === 'left' ? 'left center' : 'right center',
        [side]: 'calc(50% - 50vw)',
        top,
        height,
        width,
        opacity,
        /*
         * Faded top and bottom, for the same reason the hero is. Each piece ends in a flat line
         * where the artwork's frame was, and a straight cut across a reef reads as a crop rather
         * than as the reef carrying on past the section.
         */
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%)',
      }}
    />
  );
}
