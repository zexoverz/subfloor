import type { ReactNode } from 'react';
import { copy } from '../copy.ts';
import { PairIcons } from './PairIcons.tsx';
import { ChainlinkMark } from './TokenIcon.tsx';
import { addressUrl } from '../lib/chain.ts';
import { floorPriceFromBps, formatPrice } from '../lib/rate.ts';

/**
 * The floor, set two ways at once because two different people set it.
 *
 * The price is the headline and it is typed: a non-quant chooses "never below 2,445", not a
 * deviation. The slider drags in bps with 25-point detents because that is what the registry
 * stores, and it is how someone who thinks in basis points wants to move. Both are the same
 * number, so editing either updates the other — which is also how the screen teaches that a
 * price and a distance from the reference are the same fact.
 */
const MIN_BPS = 25;
const MAX_BPS = 400;
const DETENT = 25;

const toBps = (price: number, reference: number) => {
  const raw = ((reference - price) / reference) * 10_000;
  return Math.min(MAX_BPS, Math.max(MIN_BPS, Math.round(raw / DETENT) * DETENT));
};

/** One detent, in the direction the label names. Named so it is not a bare glyph to a screen reader. */
function Nudge({
  to,
  onChange,
  disabled,
  label,
  children,
}: {
  to: number;
  onChange: (bps: number) => void;
  disabled: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(to)}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="pushable push-quiet push-sm mb-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg text-[15px] leading-none"
    >
      {children}
    </button>
  );
}

export function FloorControl({
  bps,
  referencePrice,
  quote,
  base,
  fillsBps,
  feed,
  onChange,
}: {
  bps: number;
  referencePrice: number;
  quote: string;
  base: string;
  /** Every realized fill in bps, so the warning can count rather than assert. */
  fillsBps?: number[];
  /** The oracle the relative floor is a function of. Linked, because "the reference" is a claim
   *  until someone can open it. */
  feed?: `0x${string}` | null;
  onChange: (bps: number) => void;
}) {
  const price = floorPriceFromBps(referencePrice, bps);
  /*
   * Two hazards, not one, and the control used to colour only the first.
   *
   * **Too tight** is measured: a floor inside the realized distribution would have refused fills
   * that were fine, and a vault that fails closed through ordinary trading is unusable. This counts
   * what the number would have cost against fills that actually happened.
   *
   * **Too loose** is the opposite end and it was silent — cyan, the colour that means the owner's
   * number is doing its job, while the label directly under it read "riskier". A control that
   * colours one end and not the other is telling two stories, and the one it told at −400 bps was
   * the wrong one.
   *
   * The threshold for loose is a choice, not a measurement, and it is written as one: more than
   * twice as far out as anything that has ever happened here. There is no measured number for
   * "protects too little" — a floor is not wrong for being generous, it just stops being a floor —
   * so the colour goes quiet rather than red. Red is reserved for the hazard that has a count
   * behind it.
   */
  const worst = fillsBps?.length ? Math.max(...fillsBps.map(Math.abs)) : 0;
  const refused = fillsBps?.filter((fill) => Math.abs(fill) >= bps).length ?? 0;
  const tooTight = refused > 0;
  const tooLoose = !tooTight && worst > 0 && bps > worst * 2;
  /** The one colour that means "this is a good floor", spent only where that is true. */
  const tone = tooTight ? 'text-refuse' : tooLoose ? 'text-muted' : 'text-floor';
  const accent = tooTight ? 'accent-refuse' : tooLoose ? 'accent-muted' : 'accent-floor';

  return (
    <div className="well mb-5 rounded-xl bg-sunken px-4 py-3.5">
      <label className="block text-center text-[11.5px] tracking-[0.09em] text-faint uppercase">
        {copy.onboarding.worstPrice}
      </label>

      {/*
        * Typed as a price, and prefixed as money. The number the owner reasons about is never a
        * percentage — and the quote token is a dollar stablecoin, so the sign is what it is rather
        * than decoration.
        */}
      {/*
        * The sign and the number are one object, so the input is as wide as its own text rather
        * than as wide as the card. Full width with centred text puts the digits in the middle and
        * leaves the `$` stranded at the far left edge, which reads as two things that happen to be
        * on the same line.
        *
        * `tabular-nums` is what makes the `ch` width honest: in proportional digits a `ch` is the
        * width of a zero and nothing else, so the box would breathe as the price changed.
        */}
      <div className="mt-1 flex items-baseline justify-center">
        <span
          className={`text-[clamp(18px,4vw,22px)] leading-none font-semibold tabular-nums ${tone}`}
          aria-hidden
        >
          $
        </span>
        <input
          inputMode="decimal"
          value={formatPrice(price)}
          onChange={(e) => {
            const typed = Number(e.target.value.replace(/[^0-9.]/g, ''));
            if (typed > 0) onChange(toBps(typed, referencePrice));
          }}
          style={{ width: `${formatPrice(price).length}ch` }}
          className={`border-0 bg-transparent text-center text-[clamp(26px,7vw,34px)] leading-none font-semibold tracking-tight tabular-nums outline-none ${tone}`}
        />
      </div>

      {/*
        * The pair as its own icons rather than as "tUSDC per WETH". The two marks say which two
        * tokens without spending a line on their names, and the price above already reads as
        * one-in-terms-of-the-other.
        *
        * The reference carries Chainlink's mark and links to the feed itself. It is the contract
        * every relative floor here is a pure function of, so "the reference" stays a claim until
        * someone can open it.
        */}
      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[11px] text-faint">
        <PairIcons base={base} quote={quote} size={16} ring="ring-sunken" />
        <span className="flex items-center gap-1.5">
          <ChainlinkMark />
          {feed ? (
            <a href={addressUrl(feed)} target="_blank" rel="noreferrer" className="hover:text-floor">
              {copy.floor.reference} ${formatPrice(referencePrice)}
            </a>
          ) : (
            <>
              {copy.floor.reference} ${formatPrice(referencePrice)}
            </>
          )}
        </span>
      </div>

      {/*
        * Dragged in bps, in the detents the registry stores — and nudged by one detent either side,
        * because a slider is for finding roughly the right place and a button is for landing on the
        * exact one. The direction is the same as the slider's and the same as the labels under it:
        * left is fewer bps and safer, right is more and riskier.
        */}
      <div className="mt-3 flex items-center gap-2.5">
        <Nudge
          to={Math.max(MIN_BPS, bps - DETENT)}
          onChange={onChange}
          disabled={bps <= MIN_BPS}
          label={copy.floor.safer}
        >
          −
        </Nudge>
        <input
          type="range"
          min={MIN_BPS}
          max={MAX_BPS}
          step={DETENT}
          value={bps}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`min-w-0 flex-1 ${accent}`}
        />
        <Nudge
          to={Math.min(MAX_BPS, bps + DETENT)}
          onChange={onChange}
          disabled={bps >= MAX_BPS}
          label={copy.floor.riskier}
        >
          +
        </Nudge>
      </div>
      {fillsBps && (
        <p className={`mt-2 text-center text-[11px] ${tooTight ? 'text-refuse' : 'text-muted'}`}>
          {tooTight
            ? copy.floor.tooTight.replace('{n}', String(refused)).replace('{total}', String(fillsBps.length))
            : (tooLoose ? copy.floor.tooLoose : copy.floor.clear).replace('{n}', String(bps - worst))}
        </p>
      )}

      <div className="flex justify-between text-[11.5px] text-faint">
        <span>safer · −{MIN_BPS} bps</span>
        <span className={`font-medium ${tone}`}>−{bps} bps</span>
        <span>−{MAX_BPS} bps · riskier</span>
      </div>
    </div>
  );
}
