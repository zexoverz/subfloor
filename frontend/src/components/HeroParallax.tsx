import { useEffect, useRef } from 'react';

/**
 * The hero's depth, as seven drawings moving at seven speeds.
 *
 * The depth comes from the *difference* in speed, not from any one layer being good — which is why
 * the numbers below are the design and the artwork is only what fills them in. Back to front, each
 * layer moves a fixed fraction of the page's own scroll: the water is almost still because distance
 * is mostly stillness, and the bubbles move faster than the page, which is the part that actually
 * sells it.
 *
 * Written against the scroll position rather than with `background-attachment: fixed` or a
 * scroll-linked animation, because both of those pin to the viewport and this has to pin to the
 * hero — the layers must leave with the section they belong to rather than following the reader
 * down the page.
 */

type Layer = {
  src: string;
  /** Fraction of the page's scroll this layer travels. Below 1 it lags, above 1 it leads. */
  speed: number;
  /** Where its own bottom sits relative to the hero's, as a percentage of the hero's height. */
  bottom: number;
  className: string;
  /** Slow continuous drift, independent of scroll — for the two layers that are suspended in water. */
  drift?: number;
};

/*
 * The stack. Contrast descends with distance and only the last three are dark; everything behind
 * them stays inside the water's value range, or the hero turns to noise and the headline stops
 * being readable.
 */
const LAYERS: Layer[] = [
  // The water and its light shafts. Almost still.
  { src: '/parallax/water.webp', speed: 0.05, bottom: 0, className: 'top-0 h-full object-cover opacity-95' },
  // The trench walls, framing the middle and giving it somewhere to be.
  { src: '/parallax/ruins.webp', speed: 0.22, bottom: 0, className: 'bottom-0 opacity-80' },
  // Life in the mid-water. Faster than the walls, slower than anything with a floor under it.
  { src: '/parallax/whale.webp', speed: 0.34, bottom: 18, className: 'opacity-75', drift: 9 },
  { src: '/parallax/jelly.webp', speed: 0.5, bottom: 8, className: 'opacity-90', drift: -14 },
  // The seabed. The floor of the picture, and the product's own word for its subject.
  { src: '/parallax/seabed.webp', speed: 0.72, bottom: 0, className: 'bottom-0' },
  // The mascot on its rock, nearer than the seabed it looks out over.
  { src: '/parallax/mascot.webp', speed: 0.86, bottom: 0, className: 'bottom-0' },
  // Nearest, and the only layer that leads the page.
  { src: '/parallax/bubbles.webp', speed: 1.25, bottom: 0, className: 'bottom-0 opacity-70', drift: -22 },
];

export function HeroParallax() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    // Frozen, not hidden: the hero has to read as a still image, not as a missing one.
    if (still?.matches) return;

    const layers = Array.from(el.querySelectorAll<HTMLElement>('[data-speed]'));
    let frame: number | null = null;
    const start = performance.now();

    const draw = (now: number) => {
      frame = null;
      const y = globalThis.scrollY ?? 0;
      const t = (now - start) / 1000;
      for (const layer of layers) {
        const speed = Number(layer.dataset.speed);
        const drift = Number(layer.dataset.drift ?? 0);
        /*
         * A layer at speed s should appear to travel s× the page, and the page has already moved
         * it by 1× — so what this adds back is the difference. Writing the absolute offset instead
         * makes every layer drift away from the hero as the reader goes down the page.
         */
        const dy = y * (speed - 1) + (drift ? Math.sin(t * 0.22 + speed) * drift : 0);
        layer.style.transform = `translate3d(0, ${dy.toFixed(1)}px, 0)`;
      }
    };

    // One write per frame at most. Scroll fires far more often than the screen refreshes, and
    // setting a transform per event is how a parallax becomes the reason a page feels heavy.
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(draw);
    };

    // The drifting layers need frames even when nothing scrolls, so the loop runs on its own and
    // scroll only makes sure it is not asleep when the position changes.
    let loop: number;
    const tick = (now: number) => {
      draw(now);
      loop = requestAnimationFrame(tick);
    };
    loop = requestAnimationFrame(tick);
    globalThis.addEventListener('scroll', schedule, { passive: true });

    return () => {
      globalThis.removeEventListener('scroll', schedule);
      cancelAnimationFrame(loop);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={host} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {LAYERS.map((layer) => (
        <img
          key={layer.src}
          src={layer.src}
          alt=""
          draggable={false}
          data-speed={layer.speed}
          data-drift={layer.drift ?? 0}
          /*
           * Wider than the frame and pulled left by the overhang, so a layer that has been moved
           * up or down never shows an edge. `will-change` is set once here rather than toggled:
           * every one of these moves on every frame the hero is on screen.
           */
          className={`absolute left-1/2 w-[112%] max-w-none -translate-x-1/2 select-none ${layer.className}`}
          style={{
            bottom: layer.className.includes('top-0') ? undefined : `${layer.bottom}%`,
            willChange: 'transform',
          }}
        />
      ))}
      {/*
       * The foot of the hero becomes the page. Without it the seabed stops on a hard line at the
       * fold, which reads as a cropped image rather than as water continuing past the screen.
       */}
      <div
        className="absolute inset-x-0 bottom-0 h-40"
        style={{ background: 'linear-gradient(to bottom, transparent, var(--c-ground))' }}
      />
    </div>
  );
}
