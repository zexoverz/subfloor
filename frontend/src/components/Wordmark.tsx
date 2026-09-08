import { copy } from '../copy.ts';

/**
 * The name, as the artwork rather than as letter-spaced type.
 *
 * It used to be `copy.brand` set in Inter at 0.22em tracking, which is a description of the logo
 * rather than the logo: the ligature between the two o's is the whole idea of the mark and no
 * amount of tracking produces it.
 *
 * Chosen by height, because it sits next to type and has to line up with a cap height rather than
 * fill a slot — but the width is written out rather than left to `auto`, and that is the fix for a
 * real bug rather than a tidiness. In a flex column the default cross-axis alignment is `stretch`,
 * so an image with only a height was pulled to the full width of the rail and came out squashed.
 * `w-auto` does not stop it; `shrink-0` does not either, because it is being stretched rather than
 * shrunk. Both dimensions written means no parent can distort it, in a row or a column.
 *
 * The alt text is the name, so the brand is still readable to anything that cannot load an image —
 * this is the one image on the board that is not decoration.
 */
const ASPECT = 734 / 160;

export function Wordmark({ height = 20 }: { height?: number }) {
  return (
    <img
      src="/wordmark.webp"
      alt={copy.brand}
      draggable={false}
      width={Math.round(height * ASPECT)}
      height={height}
      className="max-w-full shrink-0 select-none"
      style={{ height, width: Math.round(height * ASPECT) }}
    />
  );
}
