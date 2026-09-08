import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

export type Hint = { content: ReactNode; x: number; y: number } | null;

/**
 * One card that follows the cursor, instead of every row hiding a panel behind a click.
 *
 * Expanding in place pushed every row below it down, so reading the second fill moved the third —
 * and the detail was behind an interaction nobody is told about. A hover card costs no layout and
 * announces itself by appearing.
 *
 * Fixed, and one of them: rendering a card per row would put a hundred absolutely-positioned
 * nodes in a scroll container to show at most one.
 */
export function RowHint({ hint }: { hint: Hint }) {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    // A touch screen has no hover, so the pointer that opened this cannot close it again.
    const query = window.matchMedia('(hover: none)');
    setCoarse(query.matches);
    const onChange = () => setCoarse(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  if (!hint || coarse) return null;

  /*
   * Flipped near the edges rather than clamped: a card that slides along the viewport edge stops
   * pointing at the row that opened it, which is the only thing connecting the two.
   */
  const flipX = hint.x > window.innerWidth - 300;
  const flipY = hint.y > window.innerHeight - 220;

  /*
   * Portalled to the body, and this is not tidiness.
   *
   * `backdrop-filter` on an ancestor makes that ancestor a containing block for `position: fixed`
   * — so the card's own blur was turning viewport coordinates into card-relative ones, and the
   * hint appeared far from the cursor that summoned it. The card's overflow clipped what was left.
   */
  return createPortal(
    <div
      className="pointer-events-none fixed z-50 w-[280px]"
      style={{
        left: flipX ? hint.x - 292 : hint.x + 16,
        top: flipY ? hint.y - 212 : hint.y + 16,
      }}
    >
      {/*
       * The creature leans over the top edge, so it overhangs the card rather than sitting inside
       * it — a rail drawn within the border would read as a picture of a rail, not as something
       * resting on one.
       */}
      <img
        src="/hint-top.png"
        alt=""
        aria-hidden
        draggable={false}
        className="relative z-10 -mb-3 block w-full select-none"
      />
      {/*
       * The panel wears the rail's own colours — #000d23 is sampled out of the artwork, not chosen
       * beside it — and the rails overlap it top and bottom. Left as a bordered card between two
       * pictures, the three read as three things stacked rather than one object.
       */}
      <div
        className="border-x-2 px-3.5 py-3 shadow-card"
        style={{ background: '#071a30', borderColor: '#000d23' }}
      >
        {hint.content}
      </div>
      <img
        src="/hint-bottom.png"
        alt=""
        aria-hidden
        draggable={false}
        className="relative z-10 -mt-3 block w-full select-none"
      />
    </div>,
    document.body,
  );
}
