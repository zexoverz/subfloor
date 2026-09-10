import { DeviceScreen } from './DeviceScreen.tsx';

/**
 * The mascot holding the device, with the real transaction on its screen.
 *
 * The drawing has a review baked into it — "Lower price floor · WETH / tUSDC · −100 bps" — which is
 * correct for exactly one of the things this screen is used for and a lie for the rest. Worse than
 * a lie: this is the screen that teaches "confirm on the device only if it matches", so a picture
 * of numbers that are not the ones about to be signed teaches the opposite habit.
 *
 * So the drawn screen is covered by the live one. Same rows, same order, same source as the device
 * will render — which is the rule §10 sets and the only reason the illustration is allowed here at
 * all.
 *
 * ## The fit
 *
 * Measured off the artwork rather than nudged into place. The four corners of the drawn screen are
 * TL (672,280), TR (900,304), BR (866,530), BL (638,507) in the 929×900 asset — read off a labelled
 * grid laid over the artwork, as the intersections of its four edges rather than as four guesses.
 * The opposite sides come out parallel, so the shape is a parallelogram and a 2D affine transform
 * is exact: no perspective, no matrix3d, nothing to tune by eye.
 *
 * Checked by drawing the quad back onto the artwork before any of this was wired up. The first
 * attempt was measured off an untrimmed crop and sat a quarter of a panel to the right, which
 * looked plausible in the numbers and obvious the moment it was drawn.
 *
 * The transform's four coefficients are ratios of those measurements, so they are unitless and the
 * overlay tracks the image at any size. Everything inside is sized in `cqw` for the same reason:
 * container query units make the panel's own contents scale with it rather than needing a second
 * set of breakpoints.
 *
 * If the artwork is ever redrawn, these six numbers are measured again. They are not guesses and
 * they should not be adjusted until they look right — that is how an overlay ends up correct on one
 * screen size and wrong on every other.
 */
export function DeviceReview({ rows, waiting = true }: { rows: [string, string][]; waiting?: boolean }) {
  return (
    <div className="relative w-full max-w-[420px]">
      <img src="/device-review.webp" alt="" aria-hidden draggable={false} className="w-full select-none" />

      <div
        className="absolute"
        style={{
          left: '72.34%',
          top: '31.11%',
          width: '24.54%',
          height: '25.22%',
          transformOrigin: '0 0',
          transform: 'matrix(1, 0.1053, -0.1498, 1, 0, 0)',
          containerType: 'size',
        }}
      >
        <DeviceScreen rows={rows} waiting={waiting} fill />
      </div>
    </div>
  );
}
