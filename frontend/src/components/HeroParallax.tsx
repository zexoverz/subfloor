import { useEffect, useRef } from 'react';
import { LightRays } from './LightRays.tsx';

/**
 * The hero's depth, as one scene separated into eight layers moving at eight speeds.
 *
 * Every layer is the same canvas, cut out of the same drawing, so at rest they stack back into the
 * picture exactly — re-composited and diffed against the source it comes to 1.25% RMSE. That is
 * what makes the markup below as plain as it is: one class for all eight, no per-layer offsets, no
 * overhang to hide a seam, because layers that share a coordinate system have nothing to correct.
 *
 * **Three motions, and only one of them is scroll.** The first version had scroll alone and read as
 * dead, because the sea it is drawing does not hold still when nobody is scrolling. So:
 *
 *   - **scroll** separates the depths — the reason the effect exists;
 *   - **drift** is continuous, and it is what makes the picture alive rather than paused: the
 *     jellyfish bob, the whale glides, the bubbles rise, the water sways;
 *   - **the pointer** tilts the whole stack a few pixels, which is the cheapest depth cue there is
 *     and the only one that answers before the reader has done anything at all.
 *
 * Every layer's periods are deliberately co-prime-ish so nothing beats in sync. Two layers rising
 * and falling together stop reading as water and start reading as a slideshow.
 *
 * ## The travel budget, which is the constraint all of that is spent against
 *
 * A layer at speed s is translated by `scroll * (1 - s)`, so the *slowest* layer travels furthest
 * inside its own frame. That is the opposite of the intuition, and it is how a parallax ends up
 * showing the edge of its own sky. What keeps every layer inside its box:
 *
 *   - scroll:  0.18 x (hero height x 0.5), which is 9% of the hero
 *   - bob:     14px at the most
 *   - pointer: 10px at the most
 *
 * The box is 124% tall, so there is 12% of the hero to spend either way — about 108px on a 900px
 * hero, against the ~105px above. Horizontally the box is 106% wide against 14px of sway and 10px
 * of pointer. The margins are identical on all eight, so they cost nothing in registration.
 *
 * The reef sits at exactly 1.0 and never scrolls. It is the floor of the picture, and on a page
 * whose whole argument is that there is a bottom, the floor holding still is worth more than
 * another few pixels of effect. It sways, because water does, but it does not travel.
 */

type Layer = {
  src: string;
  /** Fraction of the page's scroll this layer appears to travel. Below 1 it lags, above 1 it leads. */
  speed: number;
  /** Horizontal sway: how many pixels, and how many seconds one cycle takes. */
  sway?: [px: number, period: number];
  /** Vertical bob, same shape. A negative amplitude starts it on the way up. */
  bob?: [px: number, period: number];
  /** How far the pointer moves it, relative to the nearest layer. Depth, as a response. */
  tilt: number;
};

/** Back to front. The order is the scene's own depth and must not be reordered. */
const LAYERS: Layer[] = [
  { src: '/parallax/water.webp', speed: 0.82, sway: [9, 41], tilt: 0.15 },
  { src: '/parallax/structures.webp', speed: 0.87, sway: [6, 37], tilt: 0.3 },
  // The whale glides: a long sway and a small bob. It is swimming, not floating.
  { src: '/parallax/whale.webp', speed: 0.9, sway: [14, 53], bob: [5, 29], tilt: 0.4 },
  { src: '/parallax/jellyfish.webp', speed: 0.94, sway: [7, 19], bob: [-11, 13], tilt: 0.55 },
  { src: '/parallax/midrocks.webp', speed: 0.97, sway: [3, 31], tilt: 0.7 },
  { src: '/parallax/reef.webp', speed: 1, sway: [2, 23], tilt: 0.85 },
  { src: '/parallax/mascot.webp', speed: 1.06, sway: [3, 17], bob: [2, 11], tilt: 1 },
  // Bubbles rise, and a short period is what makes that read as rising rather than as bouncing.
  { src: '/parallax/bubbles.webp', speed: 1.14, sway: [10, 7], bob: [-14, 9], tilt: 1.2 },
];

/** How much of the hero's own height the scroll parallax plays out over. See the note above. */
const RANGE = 0.5;
/** The pointer's full authority in pixels, before each layer's own tilt scales it down. */
const TILT_PX = 10;

export function HeroParallax() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    // Frozen rather than hidden: the hero still has to read as a still image.
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const layers = Array.from(el.querySelectorAll<HTMLElement>('[data-speed]'));
    const start = performance.now();
    /*
     * Where the pointer is, as -1..1 from the centre, and what the stack has caught up to. Easing
     * the second toward the first is the whole difference between a scene that follows a cursor and
     * one that snaps to it — and it means a pointer leaving the window drifts back to rest rather
     * than sticking wherever it was last seen.
     */
    const want = { x: 0, y: 0 };
    const have = { x: 0, y: 0 };
    let loop = 0;

    const onMove = (e: PointerEvent) => {
      want.x = (e.clientX / globalThis.innerWidth) * 2 - 1;
      want.y = (e.clientY / globalThis.innerHeight) * 2 - 1;
    };
    const onLeave = () => {
      want.x = 0;
      want.y = 0;
    };

    const draw = (now: number) => {
      const reach = el.clientHeight * RANGE;
      const scrolled = Math.min(globalThis.scrollY ?? 0, reach);
      const t = (now - start) / 1000;
      have.x += (want.x - have.x) * 0.05;
      have.y += (want.y - have.y) * 0.05;

      for (const layer of layers) {
        const speed = Number(layer.dataset.speed);
        const tilt = Number(layer.dataset.tilt);
        const sway = layer.dataset.sway!.split(',').map(Number) as [number, number];
        const bob = layer.dataset.bob!.split(',').map(Number) as [number, number];

        // Phased off the speed, so no two layers start their cycle on the same beat.
        const dx = Math.sin((t / sway[1]) * Math.PI * 2 + speed * 9) * sway[0] - have.x * TILT_PX * tilt;
        const dy =
          scrolled * (1 - speed) +
          Math.sin((t / bob[1]) * Math.PI * 2 + speed * 5) * bob[0] -
          have.y * TILT_PX * tilt;

        /*
         * The centring rides inside the transform. A `-translate-x-1/2` class and this write are
         * the same property, so the class would be gone the first time a frame ran and the whole
         * stack would jump by half its own size on load.
         */
        layer.style.transform = `translate3d(calc(-50% + ${dx.toFixed(2)}px), calc(-50% + ${dy.toFixed(2)}px), 0)`;
      }
      loop = requestAnimationFrame(draw);
    };

    /*
     * One loop, no scroll listener. Every layer drifts on every frame regardless, so a scroll
     * handler would only be a second way to ask for work already being done — and a transform
     * written per scroll event rather than per frame is how a parallax becomes the reason a page
     * feels heavy.
     */
    loop = requestAnimationFrame(draw);
    globalThis.addEventListener('pointermove', onMove, { passive: true });
    globalThis.addEventListener('pointerleave', onLeave);

    return () => {
      cancelAnimationFrame(loop);
      globalThis.removeEventListener('pointermove', onMove);
      globalThis.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div ref={host} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {LAYERS.map((layer, i) => (
        <img
          key={layer.src}
          src={layer.src}
          alt=""
          draggable={false}
          data-speed={layer.speed}
          data-tilt={layer.tilt}
          data-sway={(layer.sway ?? [0, 1]).join(',')}
          data-bob={(layer.bob ?? [0, 1]).join(',')}
          /*
           * Identical for all eight, which is the whole point: the same box, the same fit, the same
           * origin. Anything applied to one and not the others would pull that layer out of the
           * registration the separation was done to get.
           */
          className="absolute top-1/2 left-1/2 h-[124%] w-[106%] max-w-none object-cover select-none"
          // Centred here too, so the stack is right before the first frame and stays right under
          // prefers-reduced-motion, where no frame ever runs. The z-index is the scene's depth
          // made explicit, so the light can be inserted between two of them.
          style={{
            transform: 'translate3d(-50%, -50%, 0)',
            willChange: 'transform',
            zIndex: i < 2 ? 0 : 2,
          }}
        />
      ))}
      {/*
       * Live shafts over the painted ones, in the mark's own cyan.
       *
       * Between the water and the structures rather than on top of everything: light comes from
       * the surface and is cut by what it passes, so rays drawn over the reef and the mascot would
       * read as a filter laid on the picture instead of as light inside it.
       *
       * Its own shader fades toward the foot of the frame, so it is at half strength by the middle
       * of the headline band. Measured there rather than assumed: screened over the water layer's
       * brightest point and through the scrim, 0.55 put the smallest type at 4.38 and 0.42 is the
       * first step that clears 4.5. 0.40 is what is set, for the margin.
       */}
      <div className="absolute inset-0" style={{ zIndex: 1, opacity: 0.4, mixBlendMode: 'screen' }}>
        <LightRays colour="#7fe4f5" />
      </div>

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
