import { KeyRound } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = { children: ReactNode; onClick?: () => void; disabled?: boolean };

/**
 * The affirmative action.
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
      className={`cursor-pointer rounded-lg border px-3.5 py-2.5 text-xs tracking-[0.06em] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        wide ? 'w-full' : ''
      } ${
        primary
          ? 'border-transparent bg-action font-semibold text-action-ink hover:bg-action-hover'
          : 'border-rule bg-raise text-ink hover:border-action'
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
      className="cursor-pointer rounded-lg border border-rule bg-raise px-3.5 py-2.5 text-xs tracking-[0.06em] text-faint transition-colors hover:border-floor"
    >
      <span className="flex items-center gap-2">
        <KeyRound size={13} strokeWidth={1.7} className="text-floor" />
        {children}
      </span>
    </button>
  );
}

export function Ghost({ children, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="cursor-pointer rounded-lg border border-rule bg-raise px-2.5 py-1.5 text-[11.5px] text-muted transition-colors hover:border-action hover:text-ink"
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
    <span className="inline-flex overflow-hidden rounded-lg border border-rule">
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
