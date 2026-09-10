import { HeroAnnotations } from './HeroAnnotations.tsx';

/**
 * The hero drawing, animated as what it depicts: something descends, meets the floor, and stops.
 *
 * It was an engraved spike shattering against a brass rail — a good drawing for warm paper and the
 * wrong one for this product. It needed `brightness(1.55)` to survive the dark ground, its greys
 * belonged to a different palette from everything else on the page, and the brass was the only
 * gold on a site whose one accent is cyan. Both are gone with it.
 *
 * What replaces it is not another picture but the two things the argument is actually made of:
 *
 *   - **the floor**, drawn in the mark's own cyan, because that is what the floor is everywhere
 *     else — the tape's axis, the seabed's top edge, the owner's number. It is a bar rather than
 *     an image so it can never drift out of step with the token that defines it.
 *   - **the mascot**, coming down and stopping on it.
 *
 * The drawing is kept whole and the offset is measured instead. Cutting the file at the body's own
 * bottom edge was the first attempt and it took the paddle and the ball with it; below the body
 * there is 16.6% of soft glow, so the image is pushed down by exactly that and the bar lands under
 * the creature rather than under its shadow.
 *
 * The pose is a return rather than a landing, which is the reading this component's name already
 * had: something arrives at the floor and is sent back. Nothing gets under it.
 */

/** Where the floor sits in the frame. The drawing is built around it, not the other way round. */
const FLOOR_TOP = 74;

export function HeroStrike() {
  return (
    <div className="relative aspect-[3/2] w-full">
      {/*
       * The floor. Static, unmarked, and the one thing in the picture that never moves — which is
       * the product, so it is also the drawing.
       */}
      <div
        className="absolute inset-x-0 h-[3px] rounded-full bg-floor"
        style={{ top: `${FLOOR_TOP}%`, boxShadow: '0 0 14px 1px var(--c-floor), 0 0 40px 4px rgba(14,230,234,0.35)' }}
      />

      {/*
       * The attempt: descends into the frame, lands, holds, fades, repeats. Anchored by its bottom
       * to the floor's own top edge, so the two cannot drift apart when the container resizes.
       */}
      <img
        src="/hero-mascot.webp"
        alt="A creature meets the floor and returns what came down at it"
        draggable={false}
        className="hero-strike absolute left-1/2 w-[52%] select-none"
        /*
         * Two shifts, one transform. The half-width one centres it; the 16.6% one is measured off
         * the artwork — below the drawn body there is that much soft glow, and anchoring the file's
         * bottom edge to the bar would have floated the creature clear of the thing it is meeting.
         * A percentage on `translateY` is of the image's own height, so it stays true at every size.
         */
        style={{ bottom: `${100 - FLOOR_TOP}%`, transform: 'translate(-50%, 16.6%)' }}
      />

      <HeroAnnotations />
    </div>
  );
}
