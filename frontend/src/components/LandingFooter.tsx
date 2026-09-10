import { ArrowRight } from 'lucide-react';
import { copy } from '../copy.ts';
import { Act } from './Button.tsx';
import { Wordmark } from './Wordmark.tsx';
import { Seabed } from './Seabed.tsx';
import { CUT, WAVE } from './SeaTexture.tsx';
import { ScrambleText } from './ScrambleText.tsx';
import type { Screen } from '../types.ts';

/**
 * The close and the footer, sharing the hero's texture so the page ends where it began.
 *
 * Every link here goes somewhere real. A footer column of plausible-looking links to pages that do
 * not exist is the same failure as a fixture presented as measured, and this page cannot afford
 * that twice.
 */
/**
 * Where the trail's box begins, measured up from the footer: the trail's own bottom margin plus its
 * height. The mask's wave band is that same height and is pinned to the top of this element, so the
 * two curves land on each other rather than merely near each other.
 */
const CREST = 40 + WAVE;

const LINKS = {
  project: [
    ['GitHub', 'https://github.com/zexoverz/subfloor'],
    ['Base', 'https://basescan.org'],
  ],
  built: [
    ['1inch Aqua', 'https://github.com/1inch/swap-vm'],
    ['Ledger', 'https://developers.ledger.com'],
    ['The Graph', 'https://thegraph.com'],
  ],
  standard: [['ERC-8377', 'https://github.com/ethereum/ERCs/pull/1935']],
} as const;

export function LandingFooter({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  return (
    <div className="relative mt-24">
      {/*
       * The seabed reaches up to the trail above it rather than starting at the footer's own edge.
       *
       * It used to begin here, under a border, with a band of dead ground between it and the last
       * section — a straight rule and an empty gap on the one part of the page that is supposed to
       * be the water closing over. It is pulled up past the trail now and cut along the same curve
       * the trail draws, so the dotted line is its surface.
       *
       * `CREST` is where that curve sits above the footer: the trail's own 40px margin plus the
       * distance from its box's top down to the crest.
       */}
      <div
        className="pointer-events-none absolute inset-x-0"
        style={{
          top: `-${CREST}px`,
          height: `${420 + CREST}px`,
          maskImage: `${CUT.down}, linear-gradient(black, black)`,
          WebkitMaskImage: `${CUT.down}, linear-gradient(black, black)`,
          maskSize: `100% ${WAVE}px, 100% calc(100% - ${WAVE - 70}px)`,
          WebkitMaskSize: `100% ${WAVE}px, 100% calc(100% - ${WAVE - 70}px)`,
          maskPosition: 'top, bottom',
          WebkitMaskPosition: 'top, bottom',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
        }}
      >
        {/*
         * The drawing fills the whole of it, anchored at the foot.
         *
         * A gradient in the gap was the wrong answer twice over: it never quite met the artwork,
         * which left a dark lens between them, and it was standing in for a picture that could
         * simply be there. `object-bottom` is what makes the taller frame work — the reef stays
         * where it is and the extra height is spent on the water above it, which is the part of
         * the drawing a taller frame ought to be showing.
         */}
        <Seabed intensity="hero" anchor="bottom" />
      </div>

      <section className="relative mx-auto max-w-[1100px] px-[clamp(18px,4vw,36px)] py-24 text-center">
        {/*
         * The reading ground for the close — a veil rather than a panel: full width, no edge,
         * densest across the band the words sit in.
         *
         * On the section rather than on the artwork's box, and that is the whole of it. A gradient
         * whose stops are percentages of a 684px picture lands in the middle of the water; the
         * words are further down than that box reaches, so it darkened the sea and left the
         * sentences on the light. Here the percentages are the words' own.
         *
         * Filling the frame with the drawing had put a light shaft directly behind the headline:
         * the brightest pixel under it measured #eaffff, where white reads 1.04. Not a legibility
         * quibble — a headline nobody can read on the last thing they see.
         */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-screen"
          style={{
            left: 'calc(50% - 50vw)',
            background:
              'linear-gradient(to bottom, transparent 0%, color-mix(in srgb, var(--c-ground) 91%, transparent) 22%, color-mix(in srgb, var(--c-ground) 91%, transparent) 82%, transparent 100%)',
          }}
        />

        <div className="relative">
          <h2 className="m-0 text-[clamp(26px,4.6vw,42px)] leading-[1.1] font-semibold tracking-tight text-balance">
            <ScrambleText text={copy.landing.closeTitle} onVisible speed={20} />
          </h2>
          <p className="serif mx-auto mt-4 max-w-[46ch] text-[16px] leading-relaxed text-muted">
            {copy.landing.closeStandfirst}
          </p>

          <div className="mx-auto mt-8 w-full max-w-[220px]">
            <Act primary onClick={() => onNavigate('live')}>
              <span className="flex items-center justify-center gap-2">
                {copy.landing.launchApp}
                <ArrowRight size={14} strokeWidth={1.8} />
              </span>
            </Act>
          </div>

          <p className="serif mx-auto mt-8 max-w-[52ch] text-[14px] leading-relaxed text-ink">{copy.scope}.</p>
        </div>
      </section>

      <footer className="relative border-t border-rule">
        <div className="mx-auto grid max-w-[1100px] gap-10 px-[clamp(18px,4vw,36px)] py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Wordmark height={20} />
            <p className="serif mt-2 max-w-[30ch] text-[14px] leading-relaxed text-muted">
              {copy.landing.footerTagline}
            </p>
            <p className="mt-4 text-[11.5px] text-faint">{copy.landing.footerRights}</p>
          </div>

          {(
            [
              [copy.landing.footerProject, LINKS.project],
              [copy.landing.footerBuilt, LINKS.built],
              [copy.landing.footerStandard, LINKS.standard],
            ] as const
          ).map(([heading, links]) => (
            <div key={heading}>
              <h3 className="m-0 text-[11.5px] tracking-[0.11em] text-faint uppercase">{heading}</h3>
              <ul className="mt-3 list-none space-y-2 p-0 text-[12.5px]">
                {links.map(([label, href]) => (
                  <li key={label}>
                    <a href={href} target="_blank" rel="noreferrer" className="text-muted hover:text-floor">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* The disclosure stays verbatim, and stays where a reader ends up rather than in a modal. */}
        <div className="mx-auto max-w-[1100px] border-t border-rule px-[clamp(18px,4vw,36px)] py-6">
          <p className="serif m-0 max-w-[74ch] text-[12.5px] leading-relaxed text-faint">{copy.landing.disclosure}</p>
        </div>
      </footer>
    </div>
  );
}
