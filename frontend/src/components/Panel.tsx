import type { ReactNode } from 'react';

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`mb-4 rounded-xl border border-line bg-panel px-6 py-5 ${className}`}>{children}</section>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-xs font-semibold tracking-[0.12em] text-dim uppercase">{children}</h2>;
}

export function Note({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs text-dim ${className}`}>{children}</p>;
}

/** A deliberate simplification, marked on screen rather than hidden in a commit message. */
export function Todo({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 rounded-r-lg border-l-2 border-amber-900/70 bg-amber-950/20 px-3 py-2 text-xs text-amber-200/70">
      {children}
    </p>
  );
}
