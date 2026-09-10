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
   * throws away is the whole question in a tall box.
   *
   * Measured off the file rather than guessed: sampled in twenty bands, this drawing runs 105 at
   * the top down to 17 at the foot. The light is at the *top* — it is water lit from the surface —
   * so `bottom` throws away the brightest sixth and leaves the frame opening on the dark, which is
   * exactly the void it was meant to fill. `top` keeps the light and spends the crop on the
   * darkest bands, which the hero variant is already fading to ground anyway.
   */
  anchor = 'center',
}: {
  intensity?: 'board' | 'hero';
  anchor?: 'center' | 'top' | 'bottom';
}) {
  const hero = intensity === 'hero';
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <img
        src="/seabed.webp"
        alt=""
        draggable={false}
        className={`h-full w-full object-cover select-none ${
          anchor === 'bottom' ? 'object-bottom' : anchor === 'top' ? 'object-top' : 'object-center'
        }`}
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
