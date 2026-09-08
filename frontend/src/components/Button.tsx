import { KeyRound } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = { children: ReactNode; onClick?: () => void; disabled?: boolean };

/**
 * The affirmative action.
 *
 * Blue, and pushable when it is primary: the affirmative action on this board deploys, funds or
 * signs something, so it should feel like a key going down rather than a link lighting up. The
 * secondary stays flat — if both are raised, neither is.
 *
 * Blue, as everywhere in Oku: it is what the application does. Brass is kept for the floor — the
 * owner's own number — so the two never compete. When every button was floor, the one colour that
 * was supposed to mean "your decision" meant "a button", and the floor stopped standing out on
 * the screen built around it.
 */
export function Act({
  children,
  onClick,
  disabled,
  primary = false,
  wide = false,
}: Props & { primary?: boolean; wide?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`cursor-pointer rounded-xl px-3.5 py-2.5 text-xs tracking-[0.06em] disabled:cursor-not-allowed ${
        wide ? 'w-full' : ''
      } ${
        primary
          ? 'pushable push-action mb-1.5 font-semibold'
          : 'pushable push-quiet mb-1.5'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The action the address alone cannot take. The hexagon is the device: it appears only on moves
 * that weaken protection, which is the whole asymmetry rendered as one glyph.
 */
export function Locked({ children, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="pushable push-quiet mb-1.5 cursor-pointer rounded-xl px-3.5 py-2.5 text-xs tracking-[0.06em]"
    >
      <span className="flex items-center gap-2">
        <KeyRound size={13} strokeWidth={1.7} className="text-floor" />
        {children}
      </span>
    </button>
  );
}

/**
 * The quiet action in a card header. `label` makes it icon-only: the glyph carries it on screen
 * and the label carries it everywhere else, which is the only honest way to drop the words — a
 * button whose text is gone and whose name is gone too is a button nobody can find.
 */
export function Ghost({ children, onClick, label }: Props & { label?: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="pushable push-quiet mb-1 cursor-pointer rounded-lg px-2.5 py-1.5 text-[11.5px]"
    >
      {children}
    </button>
  );
}

/** Safer is left, riskier is right, and the direction is labelled rather than assumed. */
export function Stepper({
  value,
  onChange,
  step,
  min,
  max,
  format,
}: {
  value: number;
  onChange: (n: number) => void;
  step: number;
  min: number;
  max: number;
  format: (n: number) => string;
}) {
  return (
    <span className="inline-flex overflow-hidden rounded-xl border border-rule">
      <button
        onClick={() => onChange(Math.max(min, value - step))}
        aria-label="safer"
        className="h-8.5 w-8 cursor-pointer bg-surface hover:bg-sunken"
      >
        −
      </button>
      <span className="grid min-w-[78px] place-items-center border-x border-rule font-semibold">
        {format(value)}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + step))}
        aria-label="riskier"
        className="h-8.5 w-8 cursor-pointer bg-surface hover:bg-sunken"
      >
        +
      </button>
    </span>
  );
}
