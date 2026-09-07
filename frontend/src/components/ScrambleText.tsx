import { useEffect, useState } from 'react';

/**
 * The headline resolves out of noise, one character at a time.
 *
 * The glitch behind the hero is atmosphere; this is the same idea pointed at the thing that
 * actually matters. It settles quickly and then stays still — text that keeps moving is text
 * nobody finishes reading, and this sentence is the entire pitch.
 *
 * Whitespace is never scrambled, so the shape of the line is stable from the first frame and
 * nothing reflows as it resolves.
 */
const NOISE = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+=/<>');

export function ScrambleText({
  text,
  className = '',
  speed = 26,
  delay = 0,
}: {
  text: string;
  className?: string;
  speed?: number;
  delay?: number;
}) {
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const [revealed, setRevealed] = useState(reduced ? text.length : 0);

  useEffect(() => {
    if (reduced) return;
    let id: ReturnType<typeof setInterval>;
    const start = setTimeout(() => {
      id = setInterval(() => {
        setRevealed((r) => {
          if (r >= text.length) {
            clearInterval(id);
            return r;
          }
          return r + 1;
        });
      }, speed);
    }, delay);

    return () => {
      clearTimeout(start);
      clearInterval(id);
    };
  }, [text, speed, delay, reduced]);

  return (
    <span className={className} aria-label={text}>
      {Array.from(text).map((char, i) => {
        if (i < revealed || char === ' ' || char === '\n') return <span key={i}>{char}</span>;
        return (
          <span key={i} className="text-faint" aria-hidden>
            {NOISE[Math.floor(Math.random() * NOISE.length)]}
          </span>
        );
      })}
    </span>
  );
}
