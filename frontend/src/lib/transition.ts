import { flushSync } from 'react-dom';

/**
 * Animate a state change through the View Transitions API.
 *
 * The browser already does this: it snapshots the old frame, applies the update, and interpolates
 * between them — including the height change a taller step causes, which CSS alone cannot animate
 * from `auto`. A motion library would be ~50 kB to buy the same thing.
 *
 * `flushSync` is required: the callback has to leave the DOM in its final state before it returns,
 * and React would otherwise batch the update until after the snapshot was taken.
 */
type WithViewTransition = Document & { startViewTransition?: (cb: () => void) => unknown };

export function withTransition(update: () => void): void {
  const doc = document as WithViewTransition;
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Unsupported or unwanted: the update still happens, it just happens instantly.
  if (!doc.startViewTransition || reduced) {
    update();
    return;
  }

  doc.startViewTransition(() => flushSync(update));
}
