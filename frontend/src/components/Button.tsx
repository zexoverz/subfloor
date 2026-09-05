import type { ReactNode } from 'react';

type Props = { children: ReactNode; onClick?: () => void; disabled?: boolean };

/** The one primary action a screen is allowed. `device` is the second hardware moment's styling. */
export function Primary({ children, onClick, disabled, device = false }: Props & { device?: boolean }) {
  const tone = device
    ? 'border-amber-800/70 bg-amber-950/40 hover:bg-amber-950/60'
    : 'border-floor/60 bg-floor/20 hover:bg-floor/30';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-lg border py-3.5 font-semibold tracking-[0.08em] transition-colors disabled:opacity-40 ${tone}`}
    >
      {children}
    </button>
  );
}

export function Ghost({ children, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-line px-3 py-1.5 text-xs text-dim transition-colors hover:border-dim hover:text-ink"
    >
      {children}
    </button>
  );
}
