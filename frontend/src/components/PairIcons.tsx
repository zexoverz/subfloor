import { TokenIcon } from './TokenIcon.tsx';

/**
 * Two tokens as one object, which is what a pair is.
 *
 * Overlapped rather than spaced: side by side they read as two separate assets that happen to be
 * near each other, and the label beside them already says which two. The overlap is what says
 * they are traded against one another.
 *
 * Both the same size, unlike the direction badge on a fill — there the small mark is a fact about
 * the large one, and here neither token is subordinate to the other.
 */
export function PairIcons({
  base,
  quote,
  size = 20,
  ring = 'ring-sunken',
}: {
  base: string;
  quote: string;
  size?: number;
  /** Must match whatever sits behind it, or the cut-out shows as a halo in the wrong colour. */
  ring?: string;
}) {
  return (
    <span className="inline-flex shrink-0 items-center">
      <TokenIcon symbol={base} size={size} />
      {/*
       * Ringed in the card's own colour so the front token cuts a clean edge out of the one
       * behind it, rather than the two blurring into a single shape at this size.
       */}
      <span className={`-ml-2 rounded-full ring-2 ${ring}`} style={{ display: 'inline-flex' }}>
        <TokenIcon symbol={quote} size={size} />
      </span>
    </span>
  );
}
