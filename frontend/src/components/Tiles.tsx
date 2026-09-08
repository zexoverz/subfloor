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
    <div className="my-4.5 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-px overflow-hidden rounded-xl bg-rule/40 shadow-card backdrop-blur-xl">
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
  art,
  onQuery,
}: {
  label: string;
  /** A number rolls; anything else is rendered as given. */
  value: number | ReactNode;
  format?: (n: number) => string;
  sub: string;
  tone?: 'settle' | 'refuse' | 'floor';
  /**
   * The drawing for this stat, anchored bottom-right and bleeding off both edges.
   *
   * Decoration, and marked as such: `aria-hidden`, no alt text, and nothing here changes with the
   * number. A tile that needs its picture to be understood is a tile whose label failed.
   */
  art?: string;
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
    <div className="panel-fill relative flex flex-col gap-0.5 overflow-hidden px-3.5 py-3">
      {art && (
        /*
         * Sized in pixels, not in percent, and that is the whole trick.
         *
         * A percentage height keys the drawing to the tile, and the tiles are not the same height
         * — the markout sub-line wraps to two lines and its tile grows — so the same drawing came
         * out at two sizes in one row. A fixed height gives every mascot the same one, and
         * `max-w` only bites on a narrow tile, where shrinking is the right answer anyway.
         *
         * At 70px the widest of them is 110px, so on a tile of the row's own width the drawing
         * starts past 58% of it and a figure never reaches it. That is what a mask was doing before, badly:
         * fading out the left edge cut the mascot through the middle of its body, because the
         * drawing was large enough to sit under the number in the first place. Make it the right
         * size and there is nothing to hide.
         */
        <img
          src={art}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute right-2 bottom-0 h-[70px] w-auto max-w-[44%] object-contain object-right-bottom opacity-95 select-none"
        />
      )}
      <span className="relative text-[11.5px] tracking-[0.1em] text-faint uppercase">{label}</span>
      <span className={`relative text-[24px] leading-none font-semibold tracking-tight ${toneClass}`}>
        <span className={`-mx-1 rounded-xl px-1 ${pulseClass}`}>
          {typeof value === 'number' ? <RollingNumber value={value} format={format} /> : value}
        </span>
      </span>
      <span className="relative max-w-[58%] text-[11px] text-faint">{sub}</span>
      {onQuery && (
        <button
          onClick={onQuery}
          className="relative mt-0.5 cursor-pointer self-start text-[11.5px] tracking-[0.08em] text-floor uppercase hover:underline"
        >
          run query
        </button>
      )}
    </div>
  );
}
