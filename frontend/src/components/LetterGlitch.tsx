import { useEffect, useRef } from 'react';

/**
 * Character noise on a canvas, used as hero texture.
 *
 * Three changes from the version this came from, all of which matter here:
 *
 * 1. Colours are read from the theme tokens at runtime, so it follows light and dark instead of
 *    being a black rectangle in the middle of a light page.
 * 2. `prefers-reduced-motion` paints one static frame and never starts the loop. A permanent
 *    animation is exactly the thing that setting exists to stop.
 * 3. The loop pauses when the tab is hidden. A requestAnimationFrame that runs forever behind
 *    other windows is a battery cost nobody agreed to.
 *
 * The interpolation is also fixed: the original read `hexToRgb(letter.color)` after having written
 * an `rgb(...)` string into it, so the parse returned null and every fade stopped after one step.
 * The start colour is kept as its own hex value and the current colour derived from progress.
 */
type Rgb = { r: number; g: number; b: number };

type Letter = {
  char: string;
  from: Rgb;
  to: Rgb;
  progress: number;
};

const CHARS = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789');
const FONT_SIZE = 16;
const CHAR_W = 10;
const CHAR_H = 20;

function hexToRgb(hex: string): Rgb {
  const full = hex.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, (_m, r, g, b) => `${r}${r}${g}${g}${b}${b}`);
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(full);
  return m
    ? { r: parseInt(m[1] as string, 16), g: parseInt(m[2] as string, 16), b: parseInt(m[3] as string, 16) }
    : { r: 128, g: 128, b: 128 };
}

const mix = (a: Rgb, b: Rgb, t: number) =>
  `rgb(${Math.round(a.r + (b.r - a.r) * t)}, ${Math.round(a.g + (b.g - a.g) * t)}, ${Math.round(a.b + (b.b - a.b) * t)})`;

export function LetterGlitch({
  speed = 60,
  className = '',
}: {
  speed?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frame = useRef<number | null>(null);
  const letters = useRef<Letter[]>([]);
  const gridRef = useRef({ columns: 0, rows: 0 });
  const lastGlitch = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // The page's own palette, so the texture belongs to the page rather than sitting on top of it.
    const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const palette = [token('--c-brass'), token('--c-settle'), token('--c-faint'), token('--c-rule')].map(hexToRgb);
    const pick = () => palette[Math.floor(Math.random() * palette.length)] as Rgb;

    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      ctx.font = `${FONT_SIZE}px 'IBM Plex Mono', ui-monospace, monospace`;
      ctx.textBaseline = 'top';

      letters.current.forEach((letter, i) => {
        ctx.fillStyle = mix(letter.from, letter.to, letter.progress);
        ctx.fillText(letter.char, (i % gridRef.current.columns) * CHAR_W, Math.floor(i / gridRef.current.columns) * CHAR_H);
      });
    };

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = parent.getBoundingClientRect();

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const columns = Math.ceil(rect.width / CHAR_W);
      const rows = Math.ceil(rect.height / CHAR_H);
      gridRef.current = { columns, rows };
      letters.current = Array.from({ length: columns * rows }, () => {
        const colour = pick();
        return { char: CHARS[Math.floor(Math.random() * CHARS.length)] as string, from: colour, to: colour, progress: 1 };
      });
      draw();
    };

    const step = () => {
      const now = Date.now();
      if (now - lastGlitch.current >= speed) {
        const changes = Math.max(1, Math.floor(letters.current.length * 0.05));
        for (let i = 0; i < changes; i++) {
          const letter = letters.current[Math.floor(Math.random() * letters.current.length)];
          if (!letter) continue;
          letter.char = CHARS[Math.floor(Math.random() * CHARS.length)] as string;
          letter.from = { ...letter.to };
          letter.to = pick();
          letter.progress = 0;
        }
        lastGlitch.current = now;
      }

      let moving = false;
      for (const letter of letters.current) {
        if (letter.progress < 1) {
          letter.progress = Math.min(1, letter.progress + 0.06);
          moving = true;
        }
      }
      if (moving) draw();

      frame.current = requestAnimationFrame(step);
    };

    resize();
    if (!reduced) frame.current = requestAnimationFrame(step);

    const stop = () => frame.current !== null && cancelAnimationFrame(frame.current);
    const onVisibility = () => {
      stop();
      if (!document.hidden && !reduced) frame.current = requestAnimationFrame(step);
    };

    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        stop();
        resize();
        if (!reduced) frame.current = requestAnimationFrame(step);
      }, 100);
    };

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [speed]);

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <canvas ref={canvasRef} className="block size-full" />
      {/* Fades into the page's own ground rather than to black, so it has no visible edge. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 30% 40%, transparent 30%, var(--c-ground) 78%), linear-gradient(to bottom, transparent 40%, var(--c-ground) 100%)',
        }}
      />
    </div>
  );
}
