/**
 * The line-art seabed, as wallpaper behind a section.
 *
 * Full-bleed and behind everything, so it belongs to the window rather than to the column — a
 * texture that stops at a content edge is a panel, and this is not meant to be seen as an object at
 * all. Faded top and bottom for the same reason every other layer on this page is.
 *
 * **White, not cyan.** The drawing would sit more comfortably in the floor's colour and that is
 * exactly the argument against it: cyan is what the floor is everywhere on this site — the tape's
 * axis, the seabed's top edge, the owner's own number. Spending it on wallpaper is spending the one
 * colour that has to keep meaning something.
 *
 * At 9% the lines read as texture and nothing more. Measured on the ground it sits on: white at
 * that opacity over #020c1c composites to #192230, where ink still reads 14.05, muted 6.64 and the
 * faintest label 5.22 — so it costs nothing that has to be paid back elsewhere.
 */
export function SeaTexture({ opacity = 0.09 }: { opacity?: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 -z-20 bg-[url('/sea-pattern.webp')] bg-cover bg-center"
      style={{
        left: 'calc(50% - 50vw)',
        width: '100vw',
        opacity,
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)',
      }}
    />
  );
}
