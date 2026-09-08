import type { ReactNode } from 'react';

/**
 * A tooltip that belongs to the page.
 *
 * The `title` attribute hands the job to the operating system: it appears after a delay nobody
 * chose, in a style nothing else on the page shares, wherever the pointer happens to be. This one
 * uses the palette, appears immediately, and is anchored to the thing it describes.
 *
 * Shown on focus as well as hover, so the explanation is reachable from the keyboard — a hint only
 * a mouse can read is a hint that does not exist for some of the people who need it.
 */
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      <button
        type="button"
        aria-label={text}
        className="inline-flex cursor-help items-center text-faint transition-colors hover:text-ink focus-visible:text-ink"
      >
        {children}
      </button>

      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-[230px] -translate-x-1/2 rounded-xl border border-rule bg-surface px-2.5 py-2 text-[11.5px] leading-relaxed font-normal tracking-normal text-ink normal-case opacity-0 shadow-card transition-opacity duration-100 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
