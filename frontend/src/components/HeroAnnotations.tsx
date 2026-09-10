import { copy } from '../copy.ts';

/**
 * Labels over the drawing: what a compromised agent asks for, and what the venue does about it.
 * The picture no longer runs a sequence, so these carry the argument's two sides on their own.
 *
 * Red is the attempt and floor is the floor, exactly as in the refusal card on the desk — the
 * colours mean the same thing here as they do there, or they mean nothing anywhere. The quiet ones
 * are neither side: they are what the mechanism is, and a third colour for them would imply a third
 * party.
 *
 * Every line is a thing that happens. There is no room at this size for a sentence that is only
 * nearly true, and a drawing decorated with claims is the one thing this page cannot afford.
 */
/**
 * Where each one sits, how long its breath is, and when it starts.
 *
 * Anchored to whichever edge each is nearest, and none hangs more than 2% outside the frame — the
 * page's own side padding is 18px on a small screen, so a wider overhang buys a horizontal scrollbar.
 * With the drawing at 86% of the box there is no clear water left in the middle, and a label over
 * the creature's face is a label nobody can read on a drawing nobody can see. Percentages from the
 * far edge also mean the right-hand ones cannot run off it, which `left: 58%` did.
 *
 * The periods are deliberately not multiples of each other. Six labels breathing on the same clock
 * read as one animation applied six times; on 5.2, 6.1, 7.3 seconds and so on they never line up,
 * and the drawing looks like several things happening rather than one effect.
 */
const MARKS = [
  { at: { left: '-2%', top: '2%' }, tone: 'refuse', text: copy.landing.bubbleAgent, beat: 5.2, in: 0 },
  { at: { right: '-2%', top: '-2%' }, tone: 'refuse', text: copy.landing.bubbleDump, beat: 6.7, in: 0.5 },
  { at: { left: '-2%', bottom: '14%' }, tone: 'floor', text: copy.refusal.unchanged, lead: copy.refusal.heading, beat: 6.1, in: 0.3 },
  { at: { right: '-2%', bottom: '30%' }, tone: 'floor', text: copy.landing.bubbleReverted, beat: 7.3, in: 1.1 },
  { at: { right: '6%', bottom: '0%' }, tone: 'quiet', text: copy.landing.bubbleDevice, beat: 8.1, in: 0.8 },
  { at: { left: '14%', bottom: '-2%' }, tone: 'quiet', text: copy.landing.bubbleArithmetic, beat: 5.9, in: 1.4 },
] as const;

const TONES = {
  refuse: 'border-refuse/40 bg-refuse-wash text-refuse',
  floor: 'border-floor/45 bg-floor-wash text-floor',
  quiet: 'border-rule bg-surface/80 text-muted',
} as const;

export function HeroAnnotations() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {MARKS.map((mark) => (
        <span
          key={mark.text}
          className={`hero-bubble absolute rounded-xl border px-2.5 py-1.5 text-[11px] leading-tight shadow-card ${TONES[mark.tone]}`}
          /* One value per animation, in order: the entrance is fixed, the breath is this one's own.
             A single duration here would be applied to both and the label would take six seconds to
             appear. */
          style={{
            ...mark.at,
            animationDuration: `600ms, ${mark.beat}s`,
            animationDelay: `${mark.in}s, ${mark.in}s`,
          }}
        >
          {'lead' in mark && <b className="block font-semibold">{mark.lead}</b>}
          {mark.text}
        </span>
      ))}
    </div>
  );
}
