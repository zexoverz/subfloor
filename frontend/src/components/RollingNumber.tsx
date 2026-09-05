/**
 * Digits that roll like a mechanical counter rather than swapping in place.
 *
 * Worth the code on exactly these numbers: they change while nobody is touching the page, and a
 * figure that silently becomes a different figure is easy to miss and slightly untrustworthy. A
 * digit that visibly travels tells you which column moved and by how much — and the slight stagger
 * left to right is what makes it read as a mechanism instead of a fade.
 *
 * Non-digits (commas, signs, units) stay put, so only what changed appears to move.
 */
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function RollingNumber({
  value,
  format = (n: number) => n.toLocaleString('en-US'),
  className = '',
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const chars = format(value).split('');

  return (
    <span className={`inline-flex items-baseline ${className}`} aria-label={format(value)}>
      {chars.map((char, i) => {
        const digit = DIGITS.indexOf(char);
        if (digit < 0) {
          return (
            <span key={i} aria-hidden>
              {char}
            </span>
          );
        }
        return (
          <span key={i} className="inline-block h-[1em] overflow-hidden leading-[1em]" aria-hidden>
            <span
              className="flex flex-col transition-transform duration-500 ease-[cubic-bezier(.2,.9,.25,1)]"
              style={{ transform: `translateY(-${digit}em)`, transitionDelay: `${i * 28}ms` }}
            >
              {DIGITS.map((d) => (
                <span key={d} className="h-[1em] leading-[1em]">
                  {d}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
