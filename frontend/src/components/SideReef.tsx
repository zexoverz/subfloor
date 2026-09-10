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
/** Soft at the top, wave-cut at the foot. Stretched to the box, which is the picture's own shape. */
const WAVE_FOOT =
  `url("data:image/svg+xml,<svg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201000%201500'%20preserveAspectRatio='none'><defs><linearGradient%20id='g'%20x1='0'%20y1='0'%20x2='0'%20y2='1'><stop%20offset='0'%20stop-color='%23fff'%20stop-opacity='0'/><stop%20offset='0.16'%20stop-color='%23fff'%20stop-opacity='1'/><stop%20offset='1'%20stop-color='%23fff'%20stop-opacity='1'/></linearGradient><filter%20id='s'%20x='-10%25'%20y='-10%25'%20width='120%25'%20height='120%25'%20color-interpolation-filters='sRGB'><feGaussianBlur%20stdDeviation='22'/></filter></defs><path%20d='M-60%20-40%20H1060%20V1300%20C%20800%201400%20660%201250%20430%201340%20S%20130%201420%20-60%201330%20Z'%20fill='url%28%23g%29'%20filter='url%28%23s%29'/></svg>")`;

export function SideReef({
  art,
  side,
  /** How far down its section it starts, and how tall it stands. Both in the section's own terms. */
  top = '6%',
  width = 'clamp(140px, 18vw, 320px)',
  /** Turned down where the column runs close to the edge, and left alone where it does not. */
  opacity = 0.85,
}: {
  art: string;
  side: 'left' | 'right';
  top?: string;
  width?: string;
  opacity?: number;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -z-10 hidden bg-no-repeat lg:block"
      style={{
        backgroundImage: `url(/reef/${art}.webp)`,
        /*
         * The box is the picture's own shape — width from the caller, height from the 2:3 the six
         * files share — and the background fills it exactly.
         *
         * It was `contain` inside a box 120% of the section's height, which is where the fade below
         * went wrong: `contain` centres the picture in a taller box, so the mask was dissolving the
         * empty space above and below it and leaving the artwork's own edges untouched. That is the
         * hard line across the reef. A box the picture fits exactly puts the fade back on the
         * picture.
         */
        backgroundSize: '100% 100%',
        [side]: 'calc(50% - 50vw)',
        top,
        width,
        height: `calc(${width} * 1.5)`,
        opacity,
        /*
         * Soft at the top, and cut along a wave at the foot.
         *
         * A linear fade at the bottom was still a horizontal edge, just a blurred one — and a
         * horizontal edge across a reef reads as a crop however soft it is. The base goes under a
         * wave instead, which is the same shape the trail draws and the texture is cut along, so
         * every edge on this page is the one idea rather than four different ones.
         *
         * One SVG doing both: a gradient fill for the top, a wavy lower boundary, and a blur over
         * the pair. The path runs past all four sides of the viewBox so the blur has solid shape to
         * fade into at the edges rather than dissolving the picture off them.
         */
        maskImage: WAVE_FOOT,
        WebkitMaskImage: WAVE_FOOT,
      }}
    />
  );
}
