import { copy } from '../copy.ts';

/**
 * The name, as the artwork rather than as letter-spaced type.
 *
 * It used to be `copy.brand` set in Inter at 0.22em tracking, which is a description of the logo
 * rather than the logo: the ligature between the two o's is the whole idea of the mark and no
 * amount of tracking produces it.
 *
 * Sized by height, never by width, because it sits next to type and has to line up with a cap
 * height rather than fill a slot. The alt text is the name, so the brand is still readable to
 * anything that cannot load an image — this is the one image on the board that is not decoration.
 */
export function Wordmark({ height = 20 }: { height?: number }) {
  return (
    <img
      src="/wordmark.webp"
      alt={copy.brand}
      draggable={false}
      className="w-auto shrink-0 select-none"
      style={{ height }}
    />
  );
}
