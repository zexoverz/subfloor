/**
 * The mascot holding the device.
 *
 * Decoration, and only that. It has a review drawn on its screen — "Lower price floor · WETH /
 * tUSDC · −100 bps" — which is right for one of the things this ceremony does and wrong for the
 * rest, so the real rows are printed beside it rather than pasted over it.
 *
 * Overlaying them was tried and abandoned. The drawn screen is a sheared parallelogram and the
 * transform to match it is exact, but every reading of its corners had to be checked by drawing the
 * shape back onto the artwork, and two careful-looking readings were wrong — one measured the
 * device's body instead of its screen, one used a crop ImageMagick had silently clipped. It would
 * have worked, and then broken silently the first time the artwork was redrawn by anyone who did
 * not know six numbers were measured off it.
 *
 * The rows next to it cost nothing to keep true.
 */
export function DeviceReview() {
  return (
    <img
      src="/device-review.webp"
      alt=""
      aria-hidden
      draggable={false}
      className="w-full max-w-[300px] select-none"
    />
  );
}
