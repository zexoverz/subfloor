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
       * At full strength the drawing averages three times the canvas's luminance, so every glass
       * panel sat over something brighter than itself and the whole board read washed out — the
       * text was fighting an illustration for the same pixels. At 32% it lands just under twice
       * the canvas: still legibly a seabed, no longer competing with a price.
       *
       * The board is where this matters; the hero has no data over it and keeps the drawing.
       */}
      <img
        src="/seabed.webp"
        alt=""
        draggable={false}
        className="h-full w-full object-cover object-center select-none"
        style={{ opacity: hero ? 0.85 : 0.32 }}
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
              'linear-gradient(to bottom, rgba(4,18,36,0.35), rgba(4,18,36,0.72) 45%, rgba(4,18,36,0.72) 70%, rgba(4,18,36,0.3))',
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
