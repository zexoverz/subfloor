import type { ReactNode } from 'react';
import { copy } from '../copy.ts';
import { Mark } from './Mark.tsx';
import { Chip } from './Card.tsx';
import { PanicButton } from './PanicButton.tsx';
import { AccountMenu } from './AccountMenu.tsx';
import { Seabed } from './Seabed.tsx';
import type { Wallet } from '../lib/wallet.ts';
import { mocked } from '../lib/mock.ts';
import type { DataSource, Screen, VaultState } from '../types.ts';

/** What the owner actually navigates between. Everything else is a state reached by flow. */
export function AppShell({
  screen,
  onNavigate,
  onPanic,
  state,
  source,
  loading,
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
  /** True until the first read answers, so the badge does not guess in the meantime. */
  loading: boolean;
  wallet: Wallet;
  /** The panic control belongs to whoever can actually stop the agent. */
  owner: boolean;
  /** The public page is a board, not a document: it gets the width to lay one out. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {/*
        * The same texture as the landing, fixed behind the board and much quieter than it is there.
        * This screen is read for numbers, so the noise sits well under them — enough to belong to
        * the same product, not enough to compete with a price.
        */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <Seabed />
      </div>

      <div className={`mx-auto px-[clamp(12px,3vw,28px)] pb-14 ${wide ? 'max-w-[1600px]' : 'max-w-[1120px]'}`}>
      {/*
       * One row. The brand and the two real screens sit together on the left because they are the
       * same thing — where you are — and the status reads right to left in falling importance:
       * what the tape is showing, then what it is showing it on. The panic control is last and
       * kept apart by a rule, because a destructive control should not look like a neighbour of
       * the chips that merely state facts.
       */}
      {/*
       * The header sits on the seabed, so it needs a ground of its own. Its text was reading
       * straight over the drawing — a wordmark and a wallet address competing with a jellyfish —
       * and the rule underneath was drawing a line across the artwork rather than separating
       * anything, because there is no block above it to separate from.
       *
       * Full-bleed and blurred: the panels below are glass, and a header that stopped at the
       * column's edge would leave the drawing sharp either side of a blurred strip.
       *
       * `z-30` is load-bearing. `backdrop-filter` opens a stacking context, so the account menu's
       * own z-index became relative to this header rather than to the page — and the stat row
       * below, which has a blur and therefore a context of its own, painted straight through the
       * open dropdown.
       */}
      <div className="relative z-30 -mx-[clamp(12px,3vw,28px)] mb-1 panel-fill px-[clamp(12px,3vw,28px)] shadow-card backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 py-3.5">
        {/* A tab bar with one tab is not navigation. The brand is the way back out. */}
        <button
          onClick={() => onNavigate('landing')}
          className="cursor-pointer text-[15px] font-semibold tracking-[0.22em] hover:text-floor"
        >
          <span className="flex items-center gap-2.5">
            <Mark />
            {copy.brand}
          </span>
        </button>

        <div className="ml-auto flex items-center gap-3.5 text-[11px] text-faint">
          {/*
            * One badge, driven by where the numbers came from — and "fixtures" is a verdict, not a
            * default. While the first read is still out we do not know the answer yet, and saying
            * the strongest negative thing available in the meantime is the one mistake this badge
            * exists to prevent.
            */}
          {loading ? (
            <Chip>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 animate-pulse rounded-full bg-floor" />
                {copy.live.reading}
              </span>
            </Chip>
          ) : source === 'chain' && !mocked ? (
            <Chip live>{copy.live.live}</Chip>
          ) : (
            <Chip>{mocked ? copy.live.mock : source === 'simulated' ? copy.live.simulated : copy.live.fixtures}</Chip>
          )}
          <span>
            {state.pair.base} / {state.pair.quote}
          </span>
          <span>Base · {state.addresses.chainId}</span>
        </div>

        <AccountMenu wallet={wallet} />

        {owner && (
          <div className="flex items-center gap-3.5 border-l border-rule pl-3.5">
            <PanicButton onFire={onPanic} />
          </div>
        )}
        </div>
      </div>

      <div className="pt-3">{children}</div>
      </div>
    </>
  );
}
