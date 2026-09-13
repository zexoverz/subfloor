/**
 * Base's mark, as a path rather than an image file.
 *
 * It sits inside a chip that is already coloured, so it has to take the chip's ink: an `<img>` of
 * the blue logo on the green live badge reads as a second badge stuck to the first. `currentColor`
 * makes it one object with the word beside it.
 */
export function BaseLogo({ size = 11 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 111 111"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className="inline-block shrink-0"
    >
      <path d="M54.921 110.034c30.438 0 55.117-24.65 55.117-55.017C110.038 24.65 85.359 0 54.921 0 26.043 0 2.353 22.171 0 50.392h72.847v9.25H0c2.353 28.221 26.043 50.392 54.921 50.392z" />
    </svg>
  );
}
