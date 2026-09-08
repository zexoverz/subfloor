import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl bg-surface/90 shadow-card backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

/**
 * Sunken strip across the top of a card: what this is on the left, its state on the right.
 *
 * The icon is a landmark, not decoration — one per card so the eye can find the vault or the tape
 * without reading five uppercase labels. Line icons at 1.5px, because a filled set would outweigh
 * the hairline rules everything else on this page is built from.
 */
export function CardHead({ left, right, icon: Icon }: { left: ReactNode; right?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-rule bg-sunken px-4 py-2.5 text-[11.5px] tracking-[0.11em] text-faint uppercase">
      <span className="flex items-center gap-2">
        {Icon && <Icon size={13} strokeWidth={1.6} className="text-floor" />}
        {left}
      </span>
      {right && <span>{right}</span>}
    </div>
  );
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}

export function Chip({ children, live = false }: { children: ReactNode; live?: boolean }) {
  return (
    <span
      className={`rounded-xl border px-2 py-[3px] text-[11.5px] tracking-[0.1em] uppercase ${
        live ? 'border-settle/35 text-settle' : 'border-rule bg-surface text-muted'
      }`}
    >
      {live && <span className="mr-1.5 inline-block size-[5px] animate-pulse rounded-full bg-settle align-[1px]" />}
      {children}
    </span>
  );
}

/** Serif footnote under a card's numbers — the sentence that says what they mean. */
export function Foot({ children }: { children: ReactNode }) {
  return (
    <p className="serif mt-3.5 border-t border-rule pt-3 text-[13px] leading-relaxed text-muted">{children}</p>
  );
}

export function Note({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs leading-relaxed text-muted ${className}`}>{children}</p>;
}

/** A deliberate simplification, marked on screen rather than buried in a commit message. */
export function Todo({ children }: { children: ReactNode }) {
  return (
    <p className="serif mt-4 border-l-2 border-floor bg-floor-wash px-3 py-2 text-[13.5px] leading-relaxed text-ink">
      {children}
    </p>
  );
}
