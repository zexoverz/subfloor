import { useEffect, useRef } from 'react';

/**
 * The hero's depth, as one scene separated into eight layers moving at eight speeds.
 *
 * Every layer is the same canvas, cut out of the same drawing, so at rest they stack back into the
 * picture exactly — re-composited and diffed against the source it comes to 1.25% RMSE. That is
 * what makes the markup below as plain as it is: no per-layer offsets, no nudging, no overhang to
 * hide a seam, because layers that share a coordinate system have nothing to correct.
 *
 * The travel budget is the part worth understanding, and it is why the speeds are close together.
 * A layer at speed s must be translated by `scroll * (1 - s)` to appear to move at s — the page has
 * already moved it once, and this adds back the difference. That means the *slowest* layer travels
 * furthest inside its own frame, which is the opposite of the intuition, and it is how a parallax
 * ends up showing the edge of its own sky. Two things keep it inside:
 *
 *   - the spread is 0.88 to 1.09, so the widest gap from the page's own speed is 0.12;
 *   - the scroll driving it is capped at half the hero's height, because past that the hero is
 *     leaving anyway and nothing is gained by still moving it.
 *
 * Together the furthest any layer travels is 6% of the hero's height, and every layer sits in a
 * box 116% tall, centred. The margin is uniform, so it does not disturb the registration.
 *
 * The reef sits at exactly 1.0 and never moves. It is the floor of the picture, and on a page whose
 * whole argument is that there is a bottom, the floor being the one thing that holds still is worth
 * more than another few pixels of effect.
 */

type Layer = {
  src: string;
  /** Fraction of the page's scroll this layer appears to travel. Below 1 it lags, above 1 it leads. */
  speed: number;
  /** Slow continuous sway, independent of scroll, for the things suspended in water. */
  drift?: number;
};

/** Back to front. The order is the scene's own depth and must not be reordered. */
const LAYERS: Layer[] = [
  { src: '/parallax/water.webp', speed: 0.88 },
  { src: '/parallax/structures.webp', speed: 0.91 },
  { src: '/parallax/whale.webp', speed: 0.93, drift: 7 },
  { src: '/parallax/jellyfish.webp', speed: 0.95, drift: -9 },
  { src: '/parallax/midrocks.webp', speed: 0.975 },
  { src: '/parallax/reef.webp', speed: 1 },
  { src: '/parallax/mascot.webp', speed: 1.03 },
  { src: '/parallax/bubbles.webp', speed: 1.09, drift: -13 },
];

/** How much of the hero's own height the parallax plays out over. See the note above. */
const RANGE = 0.5;

export function HeroParallax() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    // Frozen rather than hidden: the hero still has to read as a still image.
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const layers = Array.from(el.querySelectorAll<HTMLElement>('[data-speed]'));
    const start = performance.now();
    let loop = 0;

    const draw = (now: number) => {
      const reach = el.clientHeight * RANGE;
      const y = Math.min(globalThis.scrollY ?? 0, reach);
      const t = (now - start) / 1000;
      for (const layer of layers) {
        const speed = Number(layer.dataset.speed);
        const drift = Number(layer.dataset.drift ?? 0);
        const dy = y * (1 - speed) + (drift ? Math.sin(t * 0.2 + speed * 7) * drift : 0);
        // The centring rides along inside the transform. A `-translate-y-1/2` class and this write
        // are the same property, so the class would be gone the first time a frame ran — and the
        // whole stack would jump down by half its own height on load.
        layer.style.transform = `translate3d(0, calc(-50% + ${dy.toFixed(2)}px), 0)`;
      }
      loop = requestAnimationFrame(draw);
    };

    /*
     * One loop, no scroll listener. The drifting layers need a frame every frame regardless, so a
     * scroll handler would only be a second way to ask for work already being done — and a
     * transform written per scroll event rather than per frame is how a parallax becomes the reason
     * a page feels heavy.
     */
    loop = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(loop);
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
           * Identical for all eight, which is the whole point: the same box, the same fit, the same
           * origin. Anything applied to one and not the others would pull that layer out of the
           * registration the separation was done to get.
           */
          className="absolute top-1/2 left-0 h-[116%] w-full object-cover select-none"
          // Centred here too, so the stack is right before the first frame and stays right under
          // prefers-reduced-motion, where no frame ever runs.
          style={{ transform: 'translate3d(0, -50%, 0)', willChange: 'transform' }}
        />
      ))}
      {/*
       * The foot of the hero becomes the page. Without it the reef stops on a hard line at the
       * fold, which reads as a cropped image rather than as water continuing past the screen.
       */}
      <div
        className="absolute inset-x-0 bottom-0 h-40"
        style={{ background: 'linear-gradient(to bottom, transparent, var(--c-ground))' }}
      />
    </div>
  );
}
