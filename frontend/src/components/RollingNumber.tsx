/**
 * Digits that roll like a mechanical counter rather than swapping in place.
 *
 * Worth the code on exactly these numbers: they change while nobody is touching the page, and a
 * figure that silently becomes a different figure is easy to miss and slightly untrustworthy. A
 * digit that visibly travels tells you which column moved — and the stagger left to right is what
 * makes it read as a mechanism instead of a fade.
 *
 * It renders one glyph per column and animates it in, rather than translating a strip of ten
 * digits behind a 1em window. The window version ghosted on a cold load: the clip box is sized in
 * em, so before the webfont arrives its box and the text baseline disagree and the neighbouring
 * digits show through. One glyph has no neighbours to leak.
 *
 * Non-digits (commas, signs, units) never animate, so only what changed appears to move.
 */
const isDigit = (c: string) => c >= '0' && c <= '9';

export function RollingNumber({
  value,
  format = (n: number) => n.toLocaleString('en-US'),
  className = '',
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const text = format(value);

  return (
    <span className={className} aria-label={text}>
      {text.split('').map((char, i) =>
        isDigit(char) ? (
          // The key carries the digit, so React remounts the span when it changes and the CSS
          // animation fires once. A digit that stays put re-renders without moving.
          <span
            key={`${i}-${char}`}
            aria-hidden
            className="digit-roll inline-block"
            style={{ animationDelay: `${i * 28}ms` }}
          >
            {char}
          </span>
        ) : (
          <span key={`${i}-sep`} aria-hidden>
            {char}
          </span>
        ),
      )}
    </span>
  );
}
