import { KeyRound } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = { children: ReactNode; onClick?: () => void; disabled?: boolean };

/** The affirmative action. Brass, because it is the owner's own number moving. */
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
      className={`cursor-pointer rounded-[2px] border px-3.5 py-2.5 text-xs tracking-[0.06em] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        wide ? 'w-full' : ''
      } ${
        primary
          ? 'border-brass bg-brass-wash font-semibold text-brass'
          : 'border-rule bg-surface text-ink hover:border-brass'
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
      className="cursor-pointer rounded-[2px] border border-rule bg-surface px-3.5 py-2.5 text-xs tracking-[0.06em] text-faint transition-colors hover:border-brass"
    >
      <span className="flex items-center gap-2">
        <KeyRound size={13} strokeWidth={1.7} className="text-brass" />
        {children}
      </span>
    </button>
  );
}

export function Ghost({ children, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="cursor-pointer rounded-[2px] border border-rule bg-surface px-2.5 py-1.5 text-[11.5px] text-muted transition-colors hover:border-brass hover:text-ink"
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
    <span className="inline-flex overflow-hidden rounded-[2px] border border-rule">
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
