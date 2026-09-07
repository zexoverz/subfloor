import type { ReactNode } from 'react';
import { copy } from '../copy.ts';
import { Chip } from './Card.tsx';
import { PanicButton } from './PanicButton.tsx';
import { Ghost } from './Button.tsx';
import type { Wallet } from '../lib/wallet.ts';
import { mocked } from '../lib/mock.ts';
import type { DataSource, Screen, VaultState } from '../types.ts';

/** What the owner actually navigates between. Everything else is a state reached by flow. */
const PRIMARY: Screen[] = ['live', 'floor'];
/** Skeleton-only: onboarding happens once, the ceremony is mid-flow, the public page is a URL. */
const PREVIEW: Screen[] = ['landing', 'onboarding', 'ceremony', 'public'];

export function AppShell({
  screen,
  onNavigate,
  onPanic,
  state,
  source,
  wallet,
  children,
}: {
  screen: Screen;
  onNavigate: (s: Screen) => void;
  onPanic: () => void;
  state: VaultState;
  source: DataSource;
  wallet: Wallet;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1120px] px-[clamp(12px,3vw,28px)] pb-14">
      {/*
       * One row. The brand and the two real screens sit together on the left because they are the
       * same thing — where you are — and the status reads right to left in falling importance:
       * what the tape is showing, then what it is showing it on. The panic control is last and
       * kept apart by a rule, because a destructive control should not look like a neighbour of
       * the chips that merely state facts.
       */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-rule py-3.5">
        <span className="text-[15px] font-semibold tracking-[0.22em]">{copy.brand}</span>

        <nav className="-mb-3.5 flex gap-5 self-end" role="tablist">
          {PRIMARY.map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={screen === s}
              onClick={() => onNavigate(s)}
              className={`cursor-pointer border-b-2 bg-transparent px-0.5 pt-1 pb-3 text-[12.5px] transition-colors ${
                screen === s ? 'border-brass text-ink' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {copy.nav[s]}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3.5 text-[11px] text-faint">
          {/*
            * One badge, driven by where the numbers came from. "live" is reserved for the chain,
            * and so is the claim underneath it: "own money since Sep 8" is only true once the
            * money is actually on chain, so a fixture build does not get to say it either.
            */}
          {source === 'chain' && !mocked ? (
            <Chip live>{copy.live.live}</Chip>
          ) : (
            <Chip>{mocked ? copy.live.mock : source === 'simulated' ? copy.live.simulated : copy.live.fixtures}</Chip>
          )}
          <span>
            {state.pair.base} / {state.pair.quote}
          </span>
          <span>Base · {state.addresses.chainId}</span>
          {source === 'chain' && <span className="hidden sm:inline">own money since {state.stats.since}</span>}
          {/* The address is the one piece of wallet machinery worth showing: it says whose desk this is. */}
          {wallet.address ? (
            <span className="flex items-center gap-2">
              {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
              <Ghost onClick={wallet.disconnect}>{copy.wallet.disconnect}</Ghost>
            </span>
          ) : (
            <Ghost onClick={() => onNavigate('onboarding')}>{copy.wallet.connect}</Ghost>
          )}
        </div>

        {screen !== 'public' && (
          <div className="flex items-center gap-3.5 border-l border-rule pl-3.5">
            <PanicButton onFire={onPanic} />
          </div>
        )}
      </div>

      {/* The screens the shipped app never puts in a tab bar, marked as what they are. */}
      <div className="flex items-center gap-3 py-2 text-[10.5px] tracking-[0.1em] text-faint uppercase">
        <span>{copy.preview}</span>
        {PREVIEW.map((s) => (
          <button
            key={s}
            onClick={() => onNavigate(s)}
            aria-current={screen === s}
            className={`cursor-pointer bg-transparent tracking-[0.1em] uppercase transition-colors ${
              screen === s ? 'text-brass' : 'text-faint hover:text-muted'
            }`}
          >
            {copy.nav[s]}
          </button>
        ))}
      </div>

      <div className="pt-3">{children}</div>
    </div>
  );
}
