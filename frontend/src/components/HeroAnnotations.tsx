import { copy } from '../copy.ts';

/**
 * Two labels over the drawing, in sequence: what the compromised agent tried, and what the venue
 * did about it. The picture is static and the argument is a sequence, so the labels carry the beat
 * the drawing cannot.
 *
 * Red is the attempted price and brass is the floor, exactly as in the refusal card on the desk —
 * the colours mean the same thing here as they do there, or they mean nothing anywhere.
 */
export function HeroAnnotations() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <span
        className="hero-bubble absolute rounded-lg border border-refuse/40 bg-refuse-wash px-2.5 py-1.5 text-[11px] leading-tight text-refuse shadow-card"
        style={{ left: '2%', top: '10%', animationDelay: '0s' }}
      >
        {copy.landing.bubbleAgent}
      </span>

      <span
        className="hero-bubble absolute rounded-lg border border-brass/45 bg-brass-wash px-2.5 py-1.5 text-[11px] leading-tight text-brass shadow-card"
        style={{ left: '46%', top: '58%', animationDelay: '1.9s' }}
      >
        <b className="block font-semibold">{copy.refusal.heading}</b>
        {copy.refusal.unchanged}
      </span>
    </div>
  );
}
