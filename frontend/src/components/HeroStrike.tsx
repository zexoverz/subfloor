import { HeroAnnotations } from './HeroAnnotations.tsx';

/**
 * The hero drawing.
 *
 * It was a sequence: the creature fell in, met a drawn floor, settled, faded, and did it again on a
 * seven-second loop. The bar has gone and so has the loop, and the second is the reason for the
 * first — a picture that erases itself every seven seconds is a picture the eye keeps going back to
 * check, which is exactly the attention the sentences beside it need. The mascot is simply there
 * now, and the only motion is the slow breath its wrapper already had — which stays on the wrapper
 * and not on the image, because the image is centred with a transform and a keyframe that writes
 * `transform` would take the centring with it.
 *
 * The bar went with it because it was the *sequence's* prop: a thing to land on. With nothing
 * falling there is nothing to land, and a cyan rule under a mascot with a paddle reads as a table
 * edge rather than as a floor. The argument the bar was carrying is carried by the annotation that
 * is still here, in words, and by the whole board a click away.
 */
export function HeroStrike() {
  return (
    <div className="relative aspect-[3/2] w-full">
      {/*
       * Bigger than the box, and deliberately: the drawing is most of the artwork's height in glow
       * rather than creature, so a width that fits the frame draws a creature that does not.
       */}
      <img
        src="/hero-mascot.webp"
        alt="A creature meets the floor and returns what came down at it"
        draggable={false}
        className="absolute top-1/2 left-1/2 w-[86%] -translate-x-1/2 -translate-y-1/2 select-none"
      />

      <HeroAnnotations />
    </div>
  );
}
