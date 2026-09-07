import { Mesh, Program, Renderer, Triangle, Vec3 } from 'ogl';
import { useEffect, useRef } from 'react';

/**
 * A slowly turning orb, rendered on a fragment shader.
 *
 * Two changes from the version this came from, both about belonging to this page rather than
 * sitting on top of it: the hue is rotated toward brass so it reads as the same product, and the
 * loop stops when the tab is hidden or the reader has asked for reduced motion. A WebGL context
 * spinning behind a modal nobody is looking at is a cost with no reader on the other end.
 *
 * It carries no information. It is here to hold attention on the one form that matters, and it is
 * hidden below the width where it would push that form off the screen.
 */
export function Orb({ hue = 135, hoverIntensity = 0.25 }: { hue?: number; hoverIntensity?: number }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = box.current;
    if (!container) return;

    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const renderer = new Renderer({ alpha: true, premultipliedAlpha: false });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    container.appendChild(gl.canvas);

    const program = new Program(gl, {
      vertex: `
        precision highp float;
        attribute vec2 position;
        attribute vec2 uv;
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }
      `,
      fragment: `
        precision highp float;
        uniform float iTime;
        uniform vec3 iResolution;
        uniform float hue;
        uniform float hover;
        uniform float rot;
        uniform float hoverIntensity;
        varying vec2 vUv;

        vec3 rgb2yiq(vec3 c) {
          return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312)));
        }
        vec3 yiq2rgb(vec3 c) {
          return vec3(c.x + 0.956 * c.y + 0.621 * c.z, c.x - 0.272 * c.y - 0.647 * c.z, c.x - 1.106 * c.y + 1.703 * c.z);
        }
        vec3 adjustHue(vec3 color, float hueDeg) {
          float a = hueDeg * 3.14159265 / 180.0;
          vec3 yiq = rgb2yiq(color);
          float i = yiq.y * cos(a) - yiq.z * sin(a);
          float q = yiq.y * sin(a) + yiq.z * cos(a);
          return yiq2rgb(vec3(yiq.x, i, q));
        }
        vec3 hash33(vec3 p3) {
          p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
          p3 += dot(p3, p3.yxz + 19.19);
          return -1.0 + 2.0 * fract(vec3(p3.x + p3.y, p3.x + p3.z, p3.y + p3.z) * p3.zyx);
        }
        float snoise3(vec3 p) {
          const float K1 = 0.333333333;
          const float K2 = 0.166666667;
          vec3 i = floor(p + (p.x + p.y + p.z) * K1);
          vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
          vec3 e = step(vec3(0.0), d0 - d0.yzx);
          vec3 i1 = e * (1.0 - e.zxy);
          vec3 i2 = 1.0 - e.zxy * (1.0 - e);
          vec3 d1 = d0 - (i1 - K2);
          vec3 d2 = d0 - (i2 - K1);
          vec3 d3 = d0 - 0.5;
          vec4 h = max(0.6 - vec4(dot(d0, d0), dot(d1, d1), dot(d2, d2), dot(d3, d3)), 0.0);
          vec4 n = h * h * h * h * vec4(dot(d0, hash33(i)), dot(d1, hash33(i + i1)), dot(d2, hash33(i + i2)), dot(d3, hash33(i + 1.0)));
          return dot(vec4(31.316), n);
        }
        vec4 extractAlpha(vec3 c) {
          float a = max(max(c.r, c.g), c.b);
          return vec4(c.rgb / (a + 1e-5), a);
        }
        const vec3 baseColor1 = vec3(0.611765, 0.262745, 0.996078);
        const vec3 baseColor2 = vec3(0.298039, 0.760784, 0.913725);
        const vec3 baseColor3 = vec3(0.062745, 0.078431, 0.600000);
        const float innerRadius = 0.6;
        float light1(float i, float att, float d) { return i / (1.0 + d * att); }
        float light2(float i, float att, float d) { return i / (1.0 + d * d * att); }

        vec4 draw(vec2 uv) {
          vec3 color1 = adjustHue(baseColor1, hue);
          vec3 color2 = adjustHue(baseColor2, hue);
          vec3 color3 = adjustHue(baseColor3, hue);
          float ang = atan(uv.y, uv.x);
          float len = length(uv);
          float invLen = len > 0.0 ? 1.0 / len : 0.0;
          float n0 = snoise3(vec3(uv * 0.65, iTime * 0.5)) * 0.5 + 0.5;
          float r0 = mix(mix(innerRadius, 1.0, 0.4), mix(innerRadius, 1.0, 0.6), n0);
          float d0 = distance(uv, (r0 * invLen) * uv);
          float v0 = light1(1.0, 10.0, d0) * smoothstep(r0 * 1.05, r0, len) * smoothstep(r0 * 0.8, r0 * 0.95, len);
          float cl = cos(ang + iTime * 2.0) * 0.5 + 0.5;
          float a = iTime * -1.0;
          float d = distance(uv, vec2(cos(a), sin(a)) * r0);
          float v1 = light2(1.5, 5.0, d) * light1(1.0, 50.0, d0);
          float v2 = smoothstep(1.0, mix(innerRadius, 1.0, n0 * 0.5), len);
          float v3 = smoothstep(innerRadius, mix(innerRadius, 1.0, 0.5), len);
          vec3 col = mix(mix(color3, mix(color1, color2, cl), v0) + v1, vec3(0.0), 0.0) * v2 * v3;
          return extractAlpha(clamp(col, 0.0, 1.0));
        }

        void main() {
          vec2 center = iResolution.xy * 0.5;
          float size = min(iResolution.x, iResolution.y);
          vec2 uv = (vUv * iResolution.xy - center) / size * 2.0;
          float s = sin(rot), c = cos(rot);
          uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
          uv.x += hover * hoverIntensity * 0.1 * sin(uv.y * 10.0 + iTime);
          uv.y += hover * hoverIntensity * 0.1 * sin(uv.x * 10.0 + iTime);
          vec4 col = draw(uv);
          gl_FragColor = vec4(col.rgb * col.a, col.a);
        }
      `,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Vec3(1, 1, 1) },
        hue: { value: hue },
        hover: { value: 0 },
        rot: { value: 0 },
        hoverIntensity: { value: hoverIntensity },
      },
    });

    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { clientWidth: w, clientHeight: h } = container;
      renderer.setSize(w * dpr, h * dpr);
      gl.canvas.style.width = `${w}px`;
      gl.canvas.style.height = `${h}px`;
      program.uniforms.iResolution.value.set(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height);
    };
    window.addEventListener('resize', resize);
    resize();

    let hover = 0;
    let rot = 0;
    let last = 0;
    let frame = 0;

    const onMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height);
      const x = ((e.clientX - rect.left - rect.width / 2) / size) * 2;
      const y = ((e.clientY - rect.top - rect.height / 2) / size) * 2;
      hover = Math.hypot(x, y) < 0.8 ? 1 : 0;
    };
    const onLeave = () => (hover = 0);
    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);

    const tick = (t: number) => {
      frame = requestAnimationFrame(tick);
      const dt = (t - last) * 0.001;
      last = t;
      program.uniforms.iTime.value = t * 0.001;
      program.uniforms.hover.value += (hover - program.uniforms.hover.value) * 0.1;
      rot += dt * 0.12;
      program.uniforms.rot.value = rot;
      renderer.render({ scene: mesh });
    };

    // One frame is enough when motion is unwelcome, and none at all behind a hidden tab.
    if (reduced) renderer.render({ scene: mesh });
    else frame = requestAnimationFrame(tick);

    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !reduced) frame = requestAnimationFrame(tick);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
      container.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [hue, hoverIntensity]);

  return <div ref={box} className="size-full" />;
}
