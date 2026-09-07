import type { ReactNode } from 'react';
import { copy } from '../copy.ts';
import { Chip } from './Card.tsx';
import { PanicButton } from './PanicButton.tsx';
import { AccountMenu } from './AccountMenu.tsx';
import type { Wallet } from '../lib/wallet.ts';
import { mocked } from '../lib/mock.ts';
import type { DataSource, Screen, VaultState } from '../types.ts';

/** What the owner actually navigates between. Everything else is a state reached by flow. */
/**
 * The three pages someone navigates between. Onboarding happens once, the ceremony is reached from
 * the step or the action that needs it, and the landing page is where a visitor arrives — none of
 * them belong in a tab bar, and a row of links to screens a user cannot use made the whole thing
 * read as a demo of itself.
 */
const PRIMARY: Screen[] = ['live'];

export function AppShell({
  screen,
  onNavigate,
  onPanic,
  state,
  source,
  wallet,
  owner,
  wide = false,
  children,
}: {
  screen: Screen;
  onNavigate: (s: Screen) => void;
  onPanic: () => void;
  state: VaultState;
  source: DataSource;
  wallet: Wallet;
  /** The panic control belongs to whoever can actually stop the agent. */
  owner: boolean;
  /** The public page is a board, not a document: it gets the width to lay one out. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`mx-auto px-[clamp(12px,3vw,28px)] pb-14 ${wide ? 'max-w-[1600px]' : 'max-w-[1120px]'}`}>
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
        </div>

        <AccountMenu wallet={wallet} />

        {owner && (
          <div className="flex items-center gap-3.5 border-l border-rule pl-3.5">
            <PanicButton onFire={onPanic} />
          </div>
        )}
      </div>

      <div className="pt-3">{children}</div>
    </div>
  );
}
