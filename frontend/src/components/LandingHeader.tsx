import { copy } from '../copy.ts';
import { Wordmark } from './Wordmark.tsx';
import { Act } from './Button.tsx';
import type { Screen } from '../types.ts';

/**
 * The landing has a header; the app does not need one here. A visitor arriving from a link expects
 * somewhere to go and something to press, and the desk button is the only primary action on the
 * page until they have read enough to want it.
 *
 * **It starts below the hero.** The hero already has Launch app, and a bar carrying the same button
 * over the top of it is the same offer twice — with a rule and a blur across the drawing to pay for
 * it. So it stays out of the way until the hero has been read and slides in behind the reader, at
 * which point it is the only way back to the button.
 *
 * `visibility` as well as opacity, so a header nobody can see is also a header nothing can tab to.
 */
export function LandingHeader({ onNavigate, shown }: { onNavigate: (s: Screen) => void; shown: boolean }) {
  return (
    <header
      aria-hidden={!shown}
      className={`sticky top-0 z-30 border-b border-rule bg-ground/85 backdrop-blur transition-[opacity,transform,visibility] duration-300 ${
        shown ? 'translate-y-0 opacity-100' : 'invisible -translate-y-full opacity-0'
      }`}
    >
      <div className="mx-auto flex max-w-[1100px] items-center gap-4 px-[clamp(18px,4vw,36px)] py-3.5">
        <Wordmark height={19} />

        {/*
          * Brand and one action, nothing else. The public page and the repo are both reachable from
          * the footer, and a header link row on a single-page site is furniture: it competes with
          * the only button that matters and gives a first-time visitor somewhere to go instead of
          * something to read.
          */}
        <nav className="ml-auto flex items-center">
          <span className="w-[140px]">
            <Act primary onClick={() => onNavigate('live')}>
              {copy.landing.launchApp}
            </Act>
          </span>
        </nav>
      </div>
    </header>
  );
}
