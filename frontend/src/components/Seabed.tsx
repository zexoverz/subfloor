/**
 * The floor of the sea, behind everything.
 *
 * It replaces the letter glitch, which was atmosphere borrowed from a different idea — terminal
 * noise on a product whose whole argument is that there is a bottom. This drawing says what the
 * mark says, and the creature in it is the one on the tab.
 *
 * No dark scrim over it. The first version laid one on to protect the text and buried the drawing
 * doing it — and the protection was not needed: every card on the board has an opaque surface, so
 * the artwork is only ever seen in the gutters between them. Nothing is read through it.
 *
 * The one gradient left is a fade at the bottom of the hero, so the picture ends by becoming the
 * page rather than stopping at a line.
 */
export function Seabed({ intensity = 'board' }: { intensity?: 'board' | 'hero' }) {
  const hero = intensity === 'hero';
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/*
       * Recessed, not removed.
       *
       * The balance here is between two failures, and it moved once already. Too strong and the
       * text fights an illustration for the same pixels; too weak and the page reads as a dark
       * slab, which is what it did at 32%. The panels are opaque enough to protect their own
       * contents, so the drawing carries the page's brightness — measured against the reference
       * composite, which averages 29/255 to our 23.
       *
       * The board is where this matters; the hero has no data over it and keeps the drawing.
       */}
      <img
        src="/seabed.webp"
        alt=""
        draggable={false}
        className="h-full w-full object-cover object-center select-none"
        style={{ opacity: hero ? 0.9 : 0.72 }}
      />
      {/*
       * A wash in the canvas colour on top of it, heaviest in the middle band where the panels
       * sit. Opacity alone flattens the drawing evenly; this keeps the edges of the frame alive
       * while the working area goes quiet.
       */}
      {!hero && (
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, rgba(4,28,60,0.18), rgba(4,28,60,0.4) 45%, rgba(4,28,60,0.4) 70%, rgba(4,28,60,0.15))',
          }}
        />
      )}
      {hero && (
        <div
          className="absolute inset-x-0 bottom-0 h-40"
          style={{ background: 'linear-gradient(to bottom, transparent, var(--c-ground))' }}
        />
      )}
    </div>
  );
}
