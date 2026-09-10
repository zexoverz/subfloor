import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/** How wide the card is, and how far it stands off the thing it explains. */
const WIDTH = 230;
const GAP = 8;

/**
 * A tooltip that belongs to the page.
 *
 * The `title` attribute hands the job to the operating system: it appears after a delay nobody
 * chose, in a style nothing else on the page shares, wherever the pointer happens to be. This one
 * uses the palette, appears immediately, and is anchored to the thing it describes.
 *
 * Shown on focus as well as hover, so the explanation is reachable from the keyboard — a hint only
 * a mouse can read is a hint that does not exist for some of the people who need it.
 *
 * **Portalled, and every part of that is load-bearing.** It used to be an absolutely positioned
 * sibling, which failed three ways at once. `Card` is `overflow-hidden`, so a tooltip near a card's
 * edge was cut off by the card. `position: fixed` would not have saved it either: `Card` also
 * carries `backdrop-blur`, and a backdrop filter makes its element the containing block for fixed
 * descendants, so viewport coordinates would have become card-relative ones. And a native <dialog>
 * is promoted to the top layer, where nothing in the normal document paints over it — which is why
 * this is a popover as well as a portal, the same fix the toasts and the hover card needed.
 *
 * Clamped rather than centred at the edges, and flipped below when there is no room above. A card
 * that hangs off the side of the viewport is a card with half its sentence missing.
 */
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ left: number; top: number; under: boolean } | null>(null);

  const show = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    // 150 is a card's worth of room. Below that it opens downward instead of off the top.
    const under = r.top < 150;
    setAt({
      left: Math.min(Math.max(8, r.left + r.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8),
      top: under ? r.bottom + GAP : r.top - GAP,
      under,
    });
  }, []);

  const raise = useCallback((el: HTMLSpanElement | null) => {
    if (!el || typeof el.showPopover !== 'function' || el.matches(':popover-open')) return;
    try {
      el.showPopover();
    } catch {
      // A card that cannot be promoted still reads; only its stacking over a dialog is lost.
    }
  }, []);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={text}
        onMouseEnter={show}
        onMouseLeave={() => setAt(null)}
        onFocus={show}
        onBlur={() => setAt(null)}
        className="inline-flex cursor-help items-center text-faint transition-colors hover:text-ink focus-visible:text-ink"
      >
        {children}
      </button>

      {at &&
        createPortal(
          <span
            ref={raise}
            popover="manual"
            role="tooltip"
            style={{
              left: at.left,
              top: at.top,
              width: WIDTH,
              transform: at.under ? undefined : 'translateY(-100%)',
            }}
            className="tip-layer z-50 rounded-xl border border-rule bg-surface px-2.5 py-2 text-[11.5px] leading-relaxed font-normal tracking-normal text-ink normal-case shadow-card"
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  );
}
