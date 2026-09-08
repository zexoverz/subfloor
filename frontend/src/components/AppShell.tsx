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

      {/*
       * The top padding is not whitespace taste, it is where the drawing is.
       *
       * Measured down the artwork: the top row has 51% of its pixels too bright for ink text, and
       * it stays above 45% for the first tenth of the picture, because that band is the water
       * surface and the light comes through it. It falls off fast after that. Dropping the header
       * out of the first tenth is the cheap half of the fix; the shadow on the text is the half
       * that actually carries it, and neither replaces the other.
       *
       * 10vh rather than a fixed number, because the drawing is `object-cover`: the bright band is
       * a fraction of the picture, so what has to clear it is a fraction of the viewport. A fixed
       * 80px clears it on a laptop and clears nothing on a tall monitor.
       */}
      <div className={`mx-auto px-[clamp(12px,3vw,28px)] pt-[clamp(28px,10vh,120px)] pb-14 ${wide ? 'max-w-[1600px]' : 'max-w-[1120px]'}`}>
      {/*
       * One row. The brand and the two real screens sit together on the left because they are the
       * same thing — where you are — and the status reads right to left in falling importance:
       * what the tape is showing, then what it is showing it on. The panic control is last and
       * kept apart by a rule, because a destructive control should not look like a neighbour of
       * the chips that merely state facts.
       */}
      {/*
       * The header sits straight on the seabed, with no ground of its own.
       *
       * It had one, and the reason it had one is measured: half the drawing's top band — 49.7% of
       * it — is bright enough that #e9f1fb text falls under 4.5 against it, because that band is
       * the water surface and the light comes through it. So the panel is gone but the problem is
       * not, and a shadow does the work instead: it darkens only the pixels under the glyphs
       * rather than a strip across the artwork, which is the difference between protecting the
       * text and covering the picture.
       *
       * `z-30` is still load-bearing, for a different reason than before. The blur that used to
       * open this stacking context is gone, but the stat row below has one of its own, and without
       * a context here the open account menu paints underneath it.
       */}
      <div className="on-art relative z-30 mb-1">
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

        {/*
         * The status chips moved from the right end to sit beside the wordmark, and the reason is
         * the drawing rather than taste.
         *
         * Measured across the header band in 5% columns: 0-30% of the width is clean, 30-80% is
         * blown out — 100% of its pixels too bright for ink text, because the light shafts are a
         * vertical column through the middle — and 80-100% is clean again. The wordmark was always
         * safe and the account menu was always safe; what sat on the glare was this cluster, whose
         * left edge reached back to about 60%.
         *
         * So the row now keeps text at the two ends and leaves the middle, where the light is, with
         * nothing on it. The order is unchanged: still what the tape is showing, then what it is
         * showing it on.
         */}
        <div className="flex items-center gap-3.5 text-[11px] text-faint">
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

        <div className="ml-auto flex items-center gap-3.5">
          <AccountMenu wallet={wallet} />

          {owner && (
            <div className="flex items-center gap-3.5 border-l border-rule pl-3.5">
              <PanicButton onFire={onPanic} />
            </div>
          )}
        </div>
        </div>
      </div>

      <div className="pt-3">{children}</div>
      </div>
    </>
  );
}
