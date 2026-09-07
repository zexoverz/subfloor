import { HeroAnnotations } from './HeroAnnotations.tsx';

/**
 * The hero drawing, animated as what it depicts: a fill attempts, meets the floor, and stops.
 *
 * One PNG, clipped into two layers. The rail is the bottom band and is never touched — it is the
 * fixed thing in the picture and in the product. Everything above it is the attempt, and it is the
 * only part that moves.
 *
 * `RAIL_TOP` is measured off the image, not guessed: the brass band occupies rows 779–846 of 1024,
 * so it begins at 76.1%. The first attempt cut at 72% and left the debris stranded in the static
 * layer — fragments hanging over the rail with no arrow to explain them. Change the drawing and
 * this number has to be measured again.
 */
const RAIL_TOP = 76.1;

/**
 * The static layer reaches a hair above the cut so it owns the boundary row outright.
 *
 * A soft crossfade was the wrong instinct here: both layers are the same pixels, and alpha
 * compositing two half-transparent copies of one image does not reconstruct it — 0.5 over 0.5
 * gives 0.75, so the feather itself printed as a band. The overlap is instead a single pixel of
 * the rail's own opaque top edge, where drawing it twice looks identical to drawing it once.
 */
const OVERLAP = 0.12;

export function HeroStrike() {
  const hide = (e: { currentTarget: HTMLImageElement }) => (e.currentTarget.style.display = 'none');

  return (
    <div className="relative">
      {/* The floor: static, always there, unmarked. */}
      <img
        src="/hero.png"
        alt=""
        onError={hide}
        className="w-full"
        style={{ clipPath: `inset(${RAIL_TOP - OVERLAP}% 0 0 0)` }}
      />

      {/* The attempt: descends into the frame, holds, fades, repeats. */}
      <img
        src="/hero.png"
        alt="A falling fill stops dead against a brass floor and shatters upward"
        onError={hide}
        // `inset-0` would stretch this copy to the container's height and scale it a fraction
        // differently from the static one, which misregisters the two by a subpixel and prints as
        // a line. Left and top only, so both copies scale from the same width.
        className="hero-strike absolute top-0 left-0 w-full"
        style={{ clipPath: `inset(0 0 ${100 - RAIL_TOP}% 0)` }}
      />

      <HeroAnnotations />
    </div>
  );
}
