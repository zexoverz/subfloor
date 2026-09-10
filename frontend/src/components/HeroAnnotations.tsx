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
 * What each says and how long its breath is. Where it *is* comes from the shared orbit in the
 * stylesheet; all six walk the same path and are spaced by starting a sixth of a turn apart, which
 * is one negative delay rather than six sets of keyframes.
 *
 * The breathing periods are deliberately not multiples of each other. Six labels on the same clock
 * read as one animation applied six times; on 11, 12.5, 14 seconds and so on they never line up,
 * and the drawing looks like several things happening rather than one effect.
 */
const MARKS = [
  { tone: 'refuse', text: copy.landing.bubbleAgent, beat: 11 },
  { tone: 'refuse', text: copy.landing.bubbleDump, beat: 14 },
  { tone: 'floor', text: copy.refusal.unchanged, lead: copy.refusal.heading, beat: 12.5 },
  { tone: 'floor', text: copy.landing.bubbleReverted, beat: 15.5 },
  { tone: 'quiet', text: copy.landing.bubbleDevice, beat: 17 },
  { tone: 'quiet', text: copy.landing.bubbleArithmetic, beat: 13 },
] as const;

/**
 * A full turn, shared by all six, each starting a sixth of it further along.
 *
 * Four minutes. Two was still readable as movement — something the eye tracks rather than something
 * it accepts as the picture being alive — and a label that travels while you are reading the
 * sentence beside it has taken the thing it was meant to decorate.
 */
const TURN = 240;

const TONES = {
  refuse: 'border-refuse/40 bg-refuse-wash text-refuse',
  floor: 'border-floor/45 bg-floor-wash text-floor',
  quiet: 'border-rule bg-surface/80 text-muted',
} as const;

export function HeroAnnotations() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {MARKS.map((mark, i) => (
        <span
          key={mark.text}
          className={`hero-bubble absolute rounded-xl border px-2.5 py-1.5 text-center text-[11px] leading-tight whitespace-nowrap shadow-card ${TONES[mark.tone]}`}
          /*
           * One value per animation, in order, and the order is the one the class declares:
           * entrance, breath, orbit. A single value in either list is applied to all three — which
           * is how the label ended up taking six seconds to appear the first time.
           *
           * The orbit's delay is negative: it does not wait, it starts a sixth of a turn along.
           */
          style={{
            animationDuration: `600ms, ${mark.beat}s, ${TURN}s`,
            animationDelay: `${i * 0.12}s, ${i * 0.3}s, ${-(TURN / MARKS.length) * i}s`,
          }}
        >
          {'lead' in mark && <b className="block font-semibold">{mark.lead}</b>}
          {mark.text}
        </span>
      ))}
    </div>
  );
}
