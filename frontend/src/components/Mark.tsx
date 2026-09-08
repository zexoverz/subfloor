/**
 * The mark, beside the wordmark.
 *
 * The artwork itself rather than a redrawing of it. This used to be two hand-cut paths — a wedge
 * stopping on a bar — and a second drawing of a logo is a second logo: it drifts the moment the
 * real one is touched, and it read thinner than the artwork at every size worth caring about.
 *
 * A 128px copy, not the 1254px original: an 18px icon has no use for 618KB, and the browser was
 * downscaling the full artwork on every page load to draw something the size of a full stop.
 *
 * 26 rather than 18. The mark carries an outline, a highlight and a waterline, and below about 20
 * those three collapse into each other and it stops being legible as an S at all.
 */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <img
      src="/logo-128.png"
      width={size}
      height={size}
      alt=""
      aria-hidden
      className="shrink-0 select-none"
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}
