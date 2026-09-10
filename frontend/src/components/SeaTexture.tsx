/**
 * The line-art seabed, as wallpaper behind a section.
 *
 * Full-bleed and behind everything, so it belongs to the window rather than to the column — a
 * texture that stops at a content edge is a panel, and this is not meant to be seen as an object at
 * all.
 *
 * **Cut along the same wave the trail draws, not along a straight line.** A horizontal fade is a
 * seam wherever it lands, and there is already a current crossing the page right above this: two
 * different edges within a hundred pixels of each other read as two accidents rather than as one
 * idea. The mask is the trail's own curve, filled below.
 *
 * It takes two mask layers to do that and keep the foot soft: the curve at its own height, pinned
 * to the top, and a fading gradient sized to whatever is left, pinned to the bottom. One layer
 * cannot, because a curve stretched to a section's full height stops being the curve.
 *
 * The curve itself is blurred, in the SVG rather than in CSS — a mask cannot be blurred from
 * outside, and a hard-filled shape gives a crisp cut, which is the thing this was meant to replace.
 * Its path runs past both sides of the viewBox so the blur has solid shape to fade into at the left
 * and right edges rather than fading the texture off the sides of the window.
 *
 * **White, not cyan.** The drawing would sit more comfortably in the floor's colour and that is
 * exactly the argument against it: cyan is what the floor is everywhere on this site — the tape's
 * axis, the seabed's top edge, the owner's own number. Spending it on wallpaper is spending the one
 * colour that has to keep meaning something.
 *
 * 6%, down from 9 — at the higher figure the shells and turtles were legible enough to be read
 * rather than felt, and a wallpaper you can read is competing with the sentences on top of it.
 * Measured on the ground it sits on: white at 6% over #020c1c composites to #111b2a, where ink
 * reads 15.19, muted 7.18 and the faintest label 5.64. It costs nothing that has to be paid back.
 */

/** The height the curve keeps for itself, whatever the section does. Matches SeaTrail's own box. */
const WAVE = 300;
/**
 * How far the lower layer reaches back up under the curve.
 *
 * The two mask layers overlap rather than meet. A blurred edge that ends exactly where the next
 * layer begins puts a faint line right where the softness was supposed to be; overlapping them
 * means the blur has nothing but solid mask underneath it to fade into.
 */
const LAP = 70;

const CUT = {
  down: `url("data:image/svg+xml,<svg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201000%20300'%20preserveAspectRatio='none'><filter%20id='s'%20x='-20%25'%20y='-20%25'%20width='140%25'%20height='140%25'%20color-interpolation-filters='sRGB'><feGaussianBlur%20stdDeviation='16'/></filter><path%20d='M-80%2024%20C%20260%2024%20300%20190%20560%20196%20S%20860%2060%201080%2034%20L1080%20400%20L-80%20400%20Z'%20fill='%23fff'%20filter='url%28%23s%29'/></svg>")`,
  up: `url("data:image/svg+xml,<svg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201000%20300'%20preserveAspectRatio='none'><filter%20id='s'%20x='-20%25'%20y='-20%25'%20width='140%25'%20height='140%25'%20color-interpolation-filters='sRGB'><feGaussianBlur%20stdDeviation='16'/></filter><path%20d='M-80%20196%20C%20260%20196%20300%2024%20560%2020%20S%20860%20150%201080%20182%20L1080%20400%20L-80%20400%20Z'%20fill='%23fff'%20filter='url%28%23s%29'/></svg>")`,
} as const;

export function SeaTexture({
  opacity = 0.06,
  /** Which way the cut bends. Give it the same one as the trail immediately above it. */
  cut = 'down',
}: {
  opacity?: number;
  cut?: keyof typeof CUT;
}) {
  const mask = `${CUT[cut]}, linear-gradient(to bottom, black 0%, black 74%, transparent 100%)`;
  const size = `100% ${WAVE}px, 100% calc(100% - ${WAVE - LAP}px)`;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 -z-20 bg-[url('/sea-pattern.webp')] bg-cover bg-center"
      style={{
        left: 'calc(50% - 50vw)',
        width: '100vw',
        opacity,
        maskImage: mask,
        WebkitMaskImage: mask,
        maskSize: size,
        WebkitMaskSize: size,
        maskPosition: 'top, bottom',
        WebkitMaskPosition: 'top, bottom',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
      }}
    />
  );
}
