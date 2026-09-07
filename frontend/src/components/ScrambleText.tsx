import { useEffect, useRef, useState } from 'react';

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
  onVisible = false,
}: {
  text: string;
  className?: string;
  speed?: number;
  delay?: number;
  /** Wait until the text is on screen. A headline that resolved while scrolled past never happened. */
  onVisible?: boolean;
}) {
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const [revealed, setRevealed] = useState(reduced ? text.length : 0);
  const [armed, setArmed] = useState(!onVisible);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!onVisible || armed || !ref.current) return;
    const io = new IntersectionObserver(
      ([entry]) => entry?.isIntersecting && setArmed(true),
      { rootMargin: '-15% 0px' },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [onVisible, armed]);

  useEffect(() => {
    if (reduced || !armed) return;
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
  }, [text, speed, delay, reduced, armed]);

  return (
    <span ref={ref} className={className} aria-label={text}>
      {Array.from(text).map((char, i) => {
        // Only letters and digits scramble. Punctuation and spaces hold their place, so the line
        // never looks like a typo on its way to resolving.
        if (i < revealed || !/[A-Za-z0-9]/.test(char)) return <span key={i}>{char}</span>;
        return (
          <span key={i} className="text-faint" aria-hidden>
            {NOISE[Math.floor(Math.random() * NOISE.length)]}
          </span>
        );
      })}
    </span>
  );
}
