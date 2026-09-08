import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { RollingNumber } from './RollingNumber.tsx';

/** True for a beat after `value` changes, so the tile can say that it did. */
function useChanged(value: unknown, ms = 900): boolean {
  const previous = useRef(value);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    setChanged(true);
    const id = setTimeout(() => setChanged(false), ms);
    return () => clearTimeout(id);
  }, [value, ms]);

  return changed;
}

/** The number strip as tiles: headline value, what it is, and what it is measured against. */
export function Tiles({ children }: { children: ReactNode }) {
  /*
   * The blur lives on the row rather than on each tile. Applied per tile, every one of them
   * becomes its own containing block and its own backdrop sample, so the seabed behind them would
   * be sampled five times at five offsets — the band reading as five windows onto one drawing
   * instead of a single pane laid across it.
   *
   * The row's background carries the hairlines through a one-pixel gap, and it has to be
   * translucent to do that. Solid, it painted over everything the blur had just sampled: the
   * tiles were see-through onto an opaque rule colour, which is why the band stayed flat while
   * every other panel on the board let the drawing through.
   */
  return (
    <div className="my-4.5 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-px overflow-hidden rounded-xl border border-rule bg-rule/45 shadow-card backdrop-blur-md">
      {children}
    </div>
  );
}

export function Tile({
  label,
  value,
  format,
  sub,
  tone,
  onQuery,
}: {
  label: string;
  /** A number rolls; anything else is rendered as given. */
  value: number | ReactNode;
  format?: (n: number) => string;
  sub: string;
  tone?: 'settle' | 'refuse' | 'floor';
  /** The guarantee is anyone's query, never our claim — so the sentence is made clickable. */
  onQuery?: () => void;
}) {
  const toneClass =
    tone === 'settle' ? 'text-settle' : tone === 'refuse' ? 'text-refuse' : tone === 'floor' ? 'text-floor' : '';
  const changed = useChanged(value);
  // A refusal pulses red, everything else floor: the colour of a change is the colour of what it
  // is. It washes the figure alone — pulsing the whole panel makes the tile look like the thing
  // that changed, when the only thing that changed is one number inside it.
  const pulseClass = changed ? `value-pulse ${tone === 'refuse' ? 'value-pulse-refuse' : ''}` : '';

  return (
    <div className="flex flex-col gap-1 bg-surface/85 p-4">
      <span className="text-[11.5px] tracking-[0.1em] text-faint uppercase">{label}</span>
      <span className={`text-[26px] leading-none font-semibold tracking-tight ${toneClass}`}>
        <span className={`-mx-1 rounded-xl px-1 ${pulseClass}`}>
          {typeof value === 'number' ? <RollingNumber value={value} format={format} /> : value}
        </span>
      </span>
      <span className="text-[11px] text-faint">{sub}</span>
      {onQuery && (
        <button
          onClick={onQuery}
          className="mt-0.5 cursor-pointer self-start text-[11.5px] tracking-[0.08em] text-floor uppercase hover:underline"
        >
          run query
        </button>
      )}
    </div>
  );
}
