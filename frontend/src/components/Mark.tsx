/**
 * The mark, beside the wordmark. Same two shapes as the favicon: a fill stopping dead on the floor.
 *
 * The ink is currentColor so it belongs to whatever it sits in; the floor is brass and stays brass,
 * because brass means the owner's number everywhere else in this interface and a logo is no place
 * to start making an exception.
 */
export function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <path d="M7 6l7.4 13.2h-3.6L4.8 8.6z" fill="currentColor" />
      <path d="M10.8 19.2h8.6l-1.6 3.4h-5.4z" fill="currentColor" />
      <rect x="3" y="23" width="26" height="4.2" className="fill-brass" />
    </svg>
  );
}
