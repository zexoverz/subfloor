/**
 * The floor of the sea, behind everything.
 *
 * It replaces the letter glitch, which was atmosphere borrowed from a different idea — terminal
 * noise on a product whose whole argument is that there is a bottom. This drawing says what the
 * mark says, and the creature in it is the one on the tab.
 *
 * Nothing is laid over it. Two attempts at protecting the text from the artwork both buried the
 * artwork instead — a scrim first, then a wash in the canvas colour — and neither was needed:
 * every panel on the board carries its own opaque surface, so the drawing is only ever seen in the
 * gutters between them. Nothing is read through it, so nothing has to be dimmed for it.
 *
 * The one gradient left is a fade at the foot of the hero, so the picture ends by becoming the
 * page rather than stopping at a line.
 */
export function Seabed({
  intensity = 'board',
  /**
   * Which end of the drawing survives the crop.
   *
   * `object-cover` keeps the box full and throws away whatever does not fit, and which end it
   * throws away is the whole question in a tall box: centred, a taller frame eats the reef from the
   * bottom and the water from the top at once. Anchored to the bottom the reef stays put and the
   * extra height is spent on the water above it, which is what a taller frame should be showing.
   */
  anchor = 'center',
}: {
  intensity?: 'board' | 'hero';
  anchor?: 'center' | 'bottom';
}) {
  const hero = intensity === 'hero';
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <img
        src="/seabed.webp"
        alt=""
        draggable={false}
        className={`h-full w-full object-cover select-none ${anchor === 'bottom' ? 'object-bottom' : 'object-center'}`}
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
