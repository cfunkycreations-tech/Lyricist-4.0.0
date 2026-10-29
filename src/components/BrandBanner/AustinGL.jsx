import React, { useEffect, useRef } from 'react';
import { AUSTIN_GHOST } from './austinGhost.js';

/**
 * THE AUSTIN GHOST PICTURES, ONE AT A TIME, EACH ONE ALIVE, WITH A KALEIDOSCOPE
 * BETWEEN THEM. Chris: "you made an animation of each image, and it transitioned
 * with a fractal artwork. Not a scrolling image of images going by."
 *
 * The scene shader and the transition are the ones from the banner prototype
 * (banner-new/prototype/js/shaders.js: the same fbm noise, palette, hue rotate
 * and eight-way kaleidoscope), folded into one pass so there are no render
 * targets. Each picture slowly pushes in and pans, flows like liquid light, and
 * its colours swim; for 1.6 s between pictures the two melt through a
 * colour-shifting kaleidoscope.
 */
const HOLD = 7.5;      // seconds a picture is on its own
const TRANS = 1.6;     // seconds of kaleidoscope between two

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uA, uB;
uniform float uMix, uTime, uAspect, uLifeA, uLifeB;
const float IMG = 1.7765;   // the pictures are 1672 x 941
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
vec3 hueRotate(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
vec3 palette(float t) {
  vec3 a = vec3(0.55, 0.42, 0.55), b = vec3(0.45, 0.42, 0.45), c = vec3(1.0), d = vec3(0.02, 0.33, 0.62);
  return a + b * cos(6.28318 * (c * t + d));
}
vec2 kaleido(vec2 uv, float k, float segs) {
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
  float r = length(p), a = atan(p.y, p.x);
  float seg = 6.28318 / segs;
  float fa = abs(mod(a + uTime * 0.4, seg) - seg * 0.5);
  vec2 q = vec2(cos(fa), sin(fa)) * r * (1.0 + k * 0.3);
  q = q / vec2(uAspect, 1.0) + 0.5;
  return mix(uv, q, k);
}
// One picture, alive: cover-fit, slow push-in and pan, liquid flow, colour swim, glow.
vec3 scene(sampler2D tex, vec2 uv, float life, float seed) {
  float vy = min(1.0, IMG / uAspect);
  float vx = vy * uAspect / IMG;
  float prog = clamp(life / ${(HOLD + TRANS * 2).toFixed(1)}, 0.0, 1.0);
  float zoom = 1.0 / (1.0 + 0.14 * prog);
  float room = max(0.0, 1.0 - vy * zoom);
  float cy = vy * zoom * 0.5 + room * mix(0.15, 0.85, smoothstep(0.0, 1.0, prog));
  vec2 p = vec2(0.5 + (uv.x - 0.5) * vx * zoom, cy + (uv.y - 0.5) * vy * zoom);
  // Liquid light: a slow warp that gets stronger toward the bright sky.
  vec2 w = vec2(fbm(p * 5.0 + vec2(uTime * 0.12, 0.0)), fbm(p * 5.0 + vec2(3.7, uTime * 0.10))) - 0.5;
  p += w * 0.018;
  p.x += sin(p.y * 22.0 + uTime * 1.3) * 0.0016;
  vec3 c = texture(tex, p).rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c = hueRotate(c, sin(uTime * 0.35 + seed * 6.0) * 0.22);                // the colours swim
  c += palette(p.x * 1.6 + uTime * 0.07) * smoothstep(0.55, 1.0, lum) * (0.07 + 0.05 * sin(uTime * 1.7));   // lights breathe
  return c;
}
void main() {
  float k = sin(uMix * 3.14159);
  vec2 ua = kaleido(vUv, k, 8.0);
  vec3 a = scene(uA, ua, uLifeA, 0.0), b = scene(uB, ua, uLifeB, 1.0);
  float w = smoothstep(0.0, 1.0, uMix + (fbm(vUv * 4.0 + uTime) - 0.5) * 0.35 * k);
  vec3 col = mix(a, b, w);
  col = hueRotate(col, k * 1.4);
  col += palette(length(vUv - 0.5) * 2.0 + uTime * 0.3) * k * 0.18;
  outColor = vec4(col, 1.0);
}`;

const VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = vec2(p.x, 1.0 - p.y);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export default function AustinGL({ on }) {
  const ref = useRef(null);
  const onRef = useRef(on);
  onRef.current = on;

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) return undefined;                       // no WebGL2: the CSS picture behind stays
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) { console.warn('Austin banner shader failed:', e); return undefined; }
    gl.useProgram(prog);
    gl.bindVertexArray(gl.createVertexArray());
    const U = (n) => gl.getUniformLocation(prog, n);
    const loc = { A: U('uA'), B: U('uB'), mix: U('uMix'), time: U('uTime'), aspect: U('uAspect'), lifeA: U('uLifeA'), lifeB: U('uLifeB') };
    gl.uniform1i(loc.A, 0); gl.uniform1i(loc.B, 1);

    const tex = new Array(AUSTIN_GHOST.length).fill(null);
    let loaded = 0, dead = false, raf = 0;
    AUSTIN_GHOST.forEach((url, i) => {
      const img = new Image();
      img.onload = () => {
        if (dead) return;
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        tex[i] = t; loaded += 1;
      };
      img.src = url;
    });

    const size = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.uniform1f(loc.aspect, w / h);
    };
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let clock = 0, last = performance.now();
    const CYCLE = HOLD + TRANS;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!onRef.current || document.hidden || loaded < 2) return;
      clock += reduced ? dt * 0.4 : dt;
      size();
      const n = AUSTIN_GHOST.length;
      const slot = Math.floor(clock / CYCLE);
      const into = clock - slot * CYCLE;
      const a = slot % n, b = (slot + 1) % n;
      const mix = into > HOLD ? (into - HOLD) / TRANS : 0;
      if (!tex[a] || !tex[b]) return;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[a]);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex[b]);
      gl.uniform1f(loc.mix, mix);
      gl.uniform1f(loc.time, clock);
      gl.uniform1f(loc.lifeA, into + TRANS);            // it already ran during the last transition
      gl.uniform1f(loc.lifeB, mix * TRANS);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      dead = true; cancelAnimationFrame(raf);
      tex.forEach((t) => t && gl.deleteTexture(t));
      gl.deleteProgram(prog);
    };
  }, []);

  return <canvas ref={ref} className="bb-austin-gl" aria-hidden="true" />;
}
