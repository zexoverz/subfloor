import { copy } from '../copy.ts';
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

export function FloorControl({
  bps,
  referencePrice,
  quote,
  base,
  fillsBps,
  onChange,
}: {
  bps: number;
  referencePrice: number;
  quote: string;
  base: string;
  /** Every realized fill in bps, so the warning can count rather than assert. */
  fillsBps?: number[];
  onChange: (bps: number) => void;
}) {
  const price = floorPriceFromBps(referencePrice, bps);
  /*
   * The hazard is tightness, not looseness. A floor inside the realized distribution would have
   * refused fills that were fine, and a vault that fails closed through ordinary trading is
   * unusable; sitting past the worst fill is the point, not the risk. So the warning counts what
   * this number would have cost against fills that actually happened.
   */
  const refused = fillsBps?.filter((fill) => Math.abs(fill) >= bps).length ?? 0;
  const tooTight = refused > 0;

  return (
    <div className="mb-5 rounded-[2px] border border-rule bg-sunken px-4 py-3.5">
      <label className="block text-center text-[10.5px] tracking-[0.09em] text-faint uppercase">
        {copy.onboarding.worstPrice}
      </label>

      {/* Typed as a price. The number the owner reasons about is never a percentage. */}
      <input
        inputMode="decimal"
        value={formatPrice(price)}
        onChange={(e) => {
          const typed = Number(e.target.value.replace(/[^0-9.]/g, ''));
          if (typed > 0) onChange(toBps(typed, referencePrice));
        }}
        className={`mt-1 w-full border-0 bg-transparent text-center text-[clamp(26px,7vw,34px)] leading-none font-semibold tracking-tight outline-none ${
          tooTight ? 'text-refuse' : 'text-brass'
        }`}
      />
      <p className="mt-1.5 text-center text-[11px] text-faint">
        {quote} per {base} · reference {formatPrice(referencePrice)}
      </p>

      {/* Dragged in bps, in the detents the registry stores. */}
      <input
        type="range"
        min={MIN_BPS}
        max={MAX_BPS}
        step={DETENT}
        value={bps}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`mt-3 w-full ${tooTight ? 'accent-refuse' : 'accent-brass'}`}
      />
      {fillsBps && (
        <p className={`mt-2 text-center text-[11px] ${tooTight ? 'text-refuse' : 'text-muted'}`}>
          {tooTight
            ? copy.floor.tooTight.replace('{n}', String(refused)).replace('{total}', String(fillsBps.length))
            : copy.floor.clear.replace('{n}', String(bps - Math.max(...fillsBps.map(Math.abs))))}
        </p>
      )}

      <div className="flex justify-between text-[10.5px] text-faint">
        <span>safer · −{MIN_BPS} bps</span>
        <span className={`font-medium ${tooTight ? 'text-refuse' : 'text-brass'}`}>−{bps} bps</span>
        <span>−{MAX_BPS} bps · riskier</span>
      </div>
    </div>
  );
}
