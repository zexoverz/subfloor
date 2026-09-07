import { copy } from '../copy.ts';
import { Act } from './Button.tsx';
import type { Screen } from '../types.ts';

/**
 * The landing has a header; the app does not need one here. A visitor arriving from a link expects
 * somewhere to go and something to press, and the desk button is the only primary action on the
 * page until they have read enough to want it.
 */
export function LandingHeader({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-ground/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1100px] items-center gap-4 px-[clamp(18px,4vw,36px)] py-3.5">
        <span className="text-[15px] font-semibold tracking-[0.22em]">{copy.brand}</span>

        <nav className="ml-auto flex items-center gap-4 text-[11.5px] text-muted">
          <button onClick={() => onNavigate('public')} className="cursor-pointer hover:text-ink">
            {copy.nav.public}
          </button>
          <a
            href="https://github.com/zexoverz/subfloor"
            target="_blank"
            rel="noreferrer"
            className="hidden hover:text-ink sm:inline"
          >
            GitHub
          </a>
          {/* One action in the header. Connecting a wallet is asked for further down, once there
              is a reason to; two primary-looking buttons here make a visitor choose before reading. */}
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
