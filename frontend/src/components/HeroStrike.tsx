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
 * The mascot's paws rest on the bottom edge of its own crop, which is the whole reason it works
 * here: the bar goes directly under that edge and there is no gap to explain. The pose is the one
 * it already has in the seabed scene, so it is the same creature doing the same thing.
 *
 * Worth saying plainly, because it is the one thing to redirect if it reads wrong: the thing that
 * stops is now our own mascot rather than an anonymous fill. It reads as "not even this one gets
 * below the floor", which is true and is the argument. If it should instead read as the *agent*
 * being refused, the falling element wants to be a price marker in the refusal red and the mascot
 * wants to be standing on the bar watching it — a different drawing, same two parts.
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
        alt="A creature descends and comes to rest on the floor, and goes no further"
        draggable={false}
        className="hero-strike absolute left-1/2 w-[46%] -translate-x-1/2 select-none"
        style={{ bottom: `${100 - FLOOR_TOP}%` }}
      />

      <HeroAnnotations />
    </div>
  );
}
