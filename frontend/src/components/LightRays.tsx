import { useEffect, useRef, useState } from 'react';

/**
 * God rays over the hero, in the water's own colour.
 *
 * The scene already draws light shafts, but a painted shaft is a shaft that never moves — and the
 * one thing that says "this is water and not a photograph of water" is the light shifting through
 * it. This renders the same shafts live, over the drawing, so the hero's own artwork gets the
 * motion it was drawn to have.
 *
 * It is worth a WebGL context here and it was not worth one for the setup sheet's orb, which is the
 * distinction: the orb was decoration beside a form, this is the subject of the picture behind the
 * headline. `ogl` was already a dependency and had no user after that orb went, so nothing new is
 * being installed for it.
 *
 * Three things guard it, and each is a way it could otherwise cost more than it gives:
 *
 *   - It only runs while the hero is on screen. An `IntersectionObserver` starts and stops it, so
 *     a reader down the page is not paying for a shader they cannot see.
 *   - `prefers-reduced-motion` skips it entirely. The painted shafts are still there underneath;
 *     nothing goes missing, it simply stops moving.
 *   - The context is released on teardown through `WEBGL_lose_context`. Browsers keep a small
 *     number of live contexts and a route change that leaks one is a route change that eventually
 *     stops rendering anything.
 *
 * Adapted from the reactbits LightRays component. Trimmed to the one origin this page uses.
 */

type Props = {
  /** Where the light comes from, in fractions of the frame. Top-centre, like the scene's own. */
  origin?: [x: number, y: number];
  colour: string;
  speed?: number;
  spread?: number;
  length?: number;
  /** How much the light leans toward the pointer. Small: it is the sun, not a torch. */
  follow?: number;
  className?: string;
};

const rgb = (hex: string): [number, number, number] => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255] : [1, 1, 1];
};

/*
 * Hoisted out of the parameter list, and it is not a style preference.
 *
 * A default written as `origin = [0.5, -0.2]` builds a new array on every render, and this one sits
 * in the effect's dependencies — so the effect tore down and rebuilt the WebGL context every time
 * the component re-rendered for any reason at all. A shader that spends its life being constructed
 * never gets to draw.
 */
const TOP_CENTRE: [number, number] = [0.5, -0.2];

const VERT = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const FRAG = `precision highp float;

uniform float iTime;
uniform vec2  iResolution;
uniform vec2  rayPos;
uniform vec2  rayDir;
uniform vec3  raysColor;
uniform float raysSpeed;
uniform float lightSpread;
uniform float rayLength;
uniform vec2  mousePos;
uniform float mouseInfluence;

float rayStrength(vec2 source, vec2 refDir, vec2 coord, float seedA, float seedB, float speed) {
  vec2 toCoord = coord - source;
  float cosAngle = dot(normalize(toCoord), refDir);
  float spreadFactor = pow(max(cosAngle, 0.0), 1.0 / max(lightSpread, 0.001));
  float dist = length(toCoord);
  float maxDist = iResolution.x * rayLength;
  float lengthFalloff = clamp((maxDist - dist) / maxDist, 0.0, 1.0);
  float base = clamp(
    (0.45 + 0.15 * sin(cosAngle * seedA + iTime * speed)) +
    (0.30 + 0.20 * cos(-cosAngle * seedB + iTime * speed)),
    0.0, 1.0
  );
  return base * lengthFalloff * spreadFactor;
}

void main() {
  vec2 coord = vec2(gl_FragCoord.x, iResolution.y - gl_FragCoord.y);

  vec2 dir = rayDir;
  if (mouseInfluence > 0.0) {
    vec2 mouseScreen = mousePos * iResolution.xy;
    dir = normalize(mix(rayDir, normalize(mouseScreen - rayPos), mouseInfluence));
  }

  float a = rayStrength(rayPos, dir, coord, 36.2214, 21.11349, 1.5 * raysSpeed);
  float b = rayStrength(rayPos, dir, coord, 22.3991, 18.02340, 1.1 * raysSpeed);
  float strength = a * 0.5 + b * 0.4;

  // Brightest at the surface and gone by the seabed, which is where the words are.
  strength *= 1.0 - (coord.y / iResolution.y);

  gl_FragColor = vec4(raysColor * strength, strength);
}
`;

export function LightRays({
  origin = TOP_CENTRE,
  colour,
  speed = 0.7,
  spread = 0.7,
  length = 1.4,
  follow = 0.06,
  className = '',
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  // Started and stopped by visibility, so a reader down the page pays for nothing.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => setSeen(es[0]?.isIntersecting ?? false), { threshold: 0.02 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el || !seen) return;
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let stop = () => {};
    let live = true;

    void (async () => {
      // Lazily, because a WebGL library is not something a visitor should download before the
      // headline they came to read has painted.
      const { Renderer, Program, Triangle, Mesh } = await import('ogl');
      if (!live || !box.current) return;

      const renderer = new Renderer({ dpr: Math.min(globalThis.devicePixelRatio, 2), alpha: true });
      const gl = renderer.gl;
      gl.canvas.style.width = '100%';
      gl.canvas.style.height = '100%';
      box.current.append(gl.canvas);

      const want = { x: 0.5, y: 0.5 };
      const have = { x: 0.5, y: 0.5 };
      const uniforms = {
        iTime: { value: 0 },
        iResolution: { value: [1, 1] as [number, number] },
        rayPos: { value: [0, 0] as [number, number] },
        rayDir: { value: [0, 1] as [number, number] },
        raysColor: { value: rgb(colour) },
        raysSpeed: { value: speed },
        lightSpread: { value: spread },
        rayLength: { value: length },
        mousePos: { value: [0.5, 0.5] as [number, number] },
        mouseInfluence: { value: follow },
      };

      const mesh = new Mesh(gl, {
        geometry: new Triangle(gl),
        program: new Program(gl, { vertex: VERT, fragment: FRAG, uniforms }),
      });

      const place = () => {
        const host = box.current;
        if (!host) return;
        renderer.dpr = Math.min(globalThis.devicePixelRatio, 2);
        renderer.setSize(host.clientWidth, host.clientHeight);
        const w = host.clientWidth * renderer.dpr;
        const h = host.clientHeight * renderer.dpr;
        uniforms.iResolution.value = [w, h];
        uniforms.rayPos.value = [origin[0] * w, origin[1] * h];
        uniforms.rayDir.value = [0, 1];
      };

      const onMove = (e: PointerEvent) => {
        const r = box.current?.getBoundingClientRect();
        if (!r) return;
        want.x = (e.clientX - r.left) / r.width;
        want.y = (e.clientY - r.top) / r.height;
      };

      let frame = 0;
      const draw = (t: number) => {
        uniforms.iTime.value = t * 0.001;
        have.x += (want.x - have.x) * 0.06;
        have.y += (want.y - have.y) * 0.06;
        uniforms.mousePos.value = [have.x, have.y];
        renderer.render({ scene: mesh });
        frame = requestAnimationFrame(draw);
      };

      globalThis.addEventListener('resize', place);
      globalThis.addEventListener('pointermove', onMove, { passive: true });
      place();
      frame = requestAnimationFrame(draw);

      stop = () => {
        cancelAnimationFrame(frame);
        globalThis.removeEventListener('resize', place);
        globalThis.removeEventListener('pointermove', onMove);
        /*
         * Browsers keep a small number of live WebGL contexts and drop the oldest when the count is
         * exceeded. A route change that leaks one is a route change that eventually stops rendering
         * anything at all, so the context is given back explicitly rather than left to the collector.
         */
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        gl.canvas.remove();
      };
    })();

    return () => {
      live = false;
      stop();
    };
  }, [seen, colour, speed, spread, length, follow, origin]);

  return <div ref={box} aria-hidden className={`pointer-events-none absolute inset-0 ${className}`} />;
}
