import { ArrowRight } from 'lucide-react';
import { copy } from '../copy.ts';
import { Act } from './Button.tsx';
import { Seabed } from './Seabed.tsx';
import { ScrambleText } from './ScrambleText.tsx';
import type { Screen } from '../types.ts';

/**
 * The close and the footer, sharing the hero's texture so the page ends where it began.
 *
 * Every link here goes somewhere real. A footer column of plausible-looking links to pages that do
 * not exist is the same failure as a fixture presented as measured, and this page cannot afford
 * that twice.
 */
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
    <div className="relative mt-24 border-t border-rule">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px]">
        <Seabed intensity="hero" />
      </div>

      <section className="relative mx-auto max-w-[1100px] px-[clamp(18px,4vw,36px)] py-24 text-center">
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
      </section>

      <footer className="relative border-t border-rule">
        <div className="mx-auto grid max-w-[1100px] gap-10 px-[clamp(18px,4vw,36px)] py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="text-[15px] font-semibold tracking-[0.22em]">{copy.brand}</div>
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
          <p className="serif m-0 max-w-[74ch] text-[12.5px] leading-relaxed text-faint">
            {copy.landing.disclosure}
          </p>
        </div>
      </footer>
    </div>
  );
}
