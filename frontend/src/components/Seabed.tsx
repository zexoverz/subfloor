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
      <img
        src="/seabed.webp"
        alt=""
        draggable={false}
        className="h-full w-full object-cover object-center select-none"
      />
      {hero && (
        <div
          className="absolute inset-x-0 bottom-0 h-40"
          style={{ background: 'linear-gradient(to bottom, transparent, var(--c-ground))' }}
        />
      )}
    </div>
  );
}
