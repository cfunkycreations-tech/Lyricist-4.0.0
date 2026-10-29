// The scene shader: one Austin picture, brought to life through its maps.
//
// Textures: uImg (the picture), uDepth (near = white), uMask (R sky, G water,
// B buildings, A plants), uGuard (R brand: never touched, G people, B neon,
// A neon sign id), uOverlay (moving lights, cars, bats... in screen space).
//
// Everything that moves the picture is a displacement of where it is read
// from, masked to where it belongs and switched off on the brand and on
// faces, so architecture and lettering never wobble.

const NOISE = `
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
vec3 palette(float t) {   // orange, electric pink, ultraviolet, cyan, turquoise, gold
  vec3 a = vec3(0.55, 0.42, 0.55), b = vec3(0.45, 0.42, 0.45), c = vec3(1.0, 1.0, 1.0), d = vec3(0.02, 0.33, 0.62);
  return a + b * cos(6.28318 * (c * t + d));
}
`;

export const SCENE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uImg, uDepth, uMask, uGuard, uOverlay;
uniform float uTime, uBeat, uPulse, uBar, uIntensity, uAspect, uImgAspect, uDim, uOcclude;
uniform vec4 uShine;        // a metallic gleam sweeps across the logo (x0, y0, x1, y1)
uniform vec3 uCam;          // pan x, pan y (parallax strength), zoom
uniform vec2 uCamCentre;    // where the camera pushes toward
uniform float uFocus;       // the depth that stays still while the camera moves
uniform vec4 uFxA;          // sky flow, water ripple, wind in plants, neon flicker
uniform vec4 uFxB;          // soundwave, neon-ribbon water, vortex, haze
uniform vec4 uFxC;          // sky colour swim, water colour swim, building edge glow, chroma split
uniform vec4 uFxD;          // wet-street shimmer only (water channel is weak), sun glow, light beams, unused
uniform vec2 uSun;
uniform vec3 uVortex;       // centre x, y, radius
uniform int uNPuppets;
uniform vec4 uPuppetBox[24];     // centre x, y, half w, half h  (picture fractions)
uniform vec4 uPuppetMove[24];    // amp x, amp y, rotation amp, speed
uniform vec4 uPuppetPivot[24];   // pivot x, y, phase, kind (0 sway, 1 bob, 2 walk, 3 strum)
uniform int uNRipples;
uniform vec3 uRipple[16];        // swimmer x, y, size
uniform int uNFlows;
uniform vec4 uFlowBox[6];        // x0, y0, x1, y1
uniform vec4 uFlowDir[6];        // dir x, dir y, speed, amount
${NOISE}

// Screen uv -> picture uv, with the camera push and depth parallax.
vec2 toImage(vec2 s, float depth) {
  vec2 c = vec2(0.5);
  vec2 p = (s - c);
  // cover: fit the picture's aspect to the 16:9 frame
  float k = uAspect / uImgAspect;
  if (k > 1.0) p.y /= k; else p.x *= k;
  p /= uCam.z;
  vec2 uv = uCamCentre + p;
  uv += uCam.xy * (depth - uFocus);
  return uv;
}

vec2 puppet(vec2 uv, out float hit) {
  hit = 0.0;
  vec2 o = uv;
  for (int i = 0; i < 24; i++) {
    if (i >= uNPuppets) break;
    vec4 b = uPuppetBox[i], m = uPuppetMove[i], pv = uPuppetPivot[i];
    vec2 d = (uv - b.xy) / b.zw;
    float w = 1.0 - smoothstep(0.55, 1.0, max(abs(d.x), abs(d.y)));
    if (w <= 0.0) continue;
    float ph = uTime * m.w + pv.z;
    vec2 off; float rot;
    if (pv.w < 0.5) {        // sway: a kite on its string, a sign in the wind
      off = vec2(sin(ph), sin(ph * 1.7 + 1.3)) * m.xy;
      rot = sin(ph * 1.3) * m.z;
    } else if (pv.w < 1.5) { // bob: a swimmer, a boat, a kayak
      off = vec2(sin(ph * 0.5) * m.x, sin(ph) * m.y);
      rot = sin(ph + 0.8) * m.z;
    } else if (pv.w < 2.5) { // walk: a step on every beat
      float step = abs(sin(uBeat * 3.14159 + pv.z));
      off = vec2(sin(ph * 0.25) * m.x, -step * m.y);
      rot = sin(uBeat * 3.14159 + pv.z) * m.z;
    } else {                 // strum / write: small fast stroke on the beat
      off = vec2(sin(ph) * m.x, (1.0 - uPulse) * m.y * sin(ph * 2.0));
      rot = sin(ph) * m.z;
    }
    vec2 p = uv - pv.xy;
    float c = cos(-rot * w), s = sin(-rot * w);
    p = mat2(c, -s, s, c) * p;
    o = mix(o, pv.xy + p - off, w);
    hit = max(hit, w);
  }
  return o;
}

void main() {
  vec2 s = vec2(vUv.x, 1.0 - vUv.y);   // top-down, like the pictures and the overlay
  float I = uIntensity;
  // Depth at the un-moved spot, then the real lookup (one fixed-point step).
  float d0 = texture(uDepth, toImage(s, uFocus)).r;
  vec2 uv = toImage(s, d0);
  float depth = texture(uDepth, uv).r;
  uv = toImage(s, depth);

  vec4 guard = texture(uGuard, uv);
  float brand = guard.r, person = guard.g;
  float free = (1.0 - brand) * (1.0 - person);
  vec4 m = texture(uMask, uv);
  float t = uTime;

  vec2 disp = vec2(0.0);
  // Clouds: two layers drifting at different speeds, a slow liquid churn.
  if (uFxA.x > 0.0) {
    vec2 q = uv * vec2(3.0, 7.0);
    float near = smoothstep(0.0, 0.5, uv.y);
    vec2 flow = vec2(fbm(q + vec2(t * 0.05, 0.0)) - 0.5, fbm(q * 1.3 + vec2(-t * 0.03, t * 0.02) + 9.0) - 0.5);
    flow += vec2(sin(uv.y * 30.0 + t * (0.6 + near * 0.5)) * 0.25, 0.0);
    disp += flow * 0.014 * uFxA.x * m.r * I;
  }
  // Water: interfering swells, small chop, rings around the swimmers.
  float rings = 0.0;
  if (uFxA.y > 0.0) {
    float w = m.g;
    vec2 p = uv * vec2(1.0, 3.2);
    float h = sin(p.y * 90.0 - t * 2.4 + sin(p.x * 14.0 + t * 0.7) * 2.0) * 0.6
            + sin(p.y * 160.0 + p.x * 40.0 - t * 3.6) * 0.25
            + (fbm(p * 18.0 + vec2(t * 0.35, -t * 0.6)) - 0.5) * 1.2;
    for (int i = 0; i < 16; i++) {
      if (i >= uNRipples) break;
      vec3 r = uRipple[i];
      vec2 dv = (uv - r.xy) * vec2(uImgAspect, 1.0) * vec2(1.0, 3.0);
      float dist = length(dv);
      float ring = sin(dist * 260.0 / max(r.z * 8.0, 0.5) - t * 5.0) * exp(-dist * 22.0);
      rings += ring;
    }
    h += rings * 1.2;
    vec2 grad = vec2(dFdx(h), dFdy(h));
    disp += (vec2(h * 0.6, h * 0.25) * 0.004 + grad * 0.01) * uFxA.y * w * I;
  }
  // Wind in the trees and the grass: the higher, the more it sways.
  if (uFxA.z > 0.0) {
    float gust = 0.6 + 0.4 * sin(t * 0.7) * sin(t * 0.23 + 1.0);
    disp += vec2(sin(t * 1.9 + uv.x * 9.0 + uv.y * 5.0) + 0.4 * sin(t * 4.3 + uv.y * 30.0), 0.2 * sin(t * 2.3 + uv.x * 20.0))
            * 0.0016 * uFxA.z * gust * m.a * I;
  }
  // Flows: waterfalls and spillways run downhill.
  for (int i = 0; i < 6; i++) {
    if (i >= uNFlows) break;
    vec4 b = uFlowBox[i], f = uFlowDir[i];
    if (uv.x < b.x || uv.x > b.z || uv.y < b.y || uv.y > b.w) continue;
    float edge = smoothstep(0.0, 0.15, min(min(uv.x - b.x, b.z - uv.x) / (b.z - b.x), min(uv.y - b.y, b.w - uv.y) / (b.w - b.y)) * 2.0);
    vec2 q = uv * vec2(60.0, 6.0) - f.xy * t * f.z;
    disp += f.xy * (noise(q) - 0.5) * f.w * 0.02 * edge;
  }
  disp *= free;

  // Puppets move whole things (kites, swimmers, boats, the Ghost's head, a
  // strumming hand) as one piece; they may sit on the brand art. Everything
  // else bends only where it is free.
  float hit;
  vec2 puv = puppet(uv, hit);
  uv = mix(uv + disp, puv, hit);
  // Chromatic split on the beat, never on the brand.
  float ca = uFxC.w * uPulse * 0.0025 * I * (1.0 - brand) * (1.0 - hit);
  vec2 dir = normalize(s - 0.5 + 1e-4);
  vec3 col;
  col.r = texture(uImg, uv + dir * ca).r;
  col.g = texture(uImg, uv).g;
  col.b = texture(uImg, uv - dir * ca).b;

  // Re-read the masks where the picture actually came from.
  m = texture(uMask, uv);
  float wet = uFxD.x;

  // Sky: the colours swim, slowly, and breathe on the bar.
  if (uFxC.x > 0.0) {
    float sw = fbm(uv * 2.5 + t * 0.03) * 6.28 + t * 0.15;
    vec3 shifted = hueRotate(col, sin(sw) * 0.55 * uFxC.x * I + uPulse * 0.25 * uFxC.x * I);
    col = mix(col, shifted, m.r * free);
  }
  // Water: psychedelic reflections that drift.
  if (uFxC.y > 0.0) {
    float sw = fbm(uv * vec2(4.0, 12.0) + vec2(t * 0.08, -t * 0.05)) * 6.28 + t * 0.5;
    vec3 shifted = hueRotate(col, sin(sw) * 1.2 * uFxC.y * I) * (1.0 + 0.25 * uFxC.y * I);
    col = mix(col, shifted, m.g * free * (wet > 0.0 ? 0.5 : 1.0));
    // glints
    float g = pow(max(0.0, noise(uv * vec2(400.0, 1400.0) + vec2(t * 4.0, 0.0)) - 0.86) * 7.0, 3.0);
    col += vec3(1.0, 0.95, 0.85) * g * m.g * free * 0.8 * I;
  }
  // The neon ribbon moment: the water turns to flowing ribbons of colour.
  if (uFxB.y > 0.0) {
    float r = sin((uv.y * 140.0 + fbm(uv * vec2(3.0, 9.0) + t * 0.2) * 22.0) - t * 6.0);
    vec3 rib = palette(uv.x * 0.8 + uv.y * 2.0 + t * 0.25) * (0.6 + 0.6 * smoothstep(0.2, 1.0, r));
    col = mix(col, rib * 1.25, m.g * free * uFxB.y * 0.85);
  }
  // Buildings: the soundwave walks across the skyline and lights them in turn.
  if (uFxB.x > 0.0) {
    float x = fract(t * 0.11) * 1.4 - 0.2;
    float band = exp(-pow((uv.x - x) / 0.035, 2.0));
    float bars = 0.5 + 0.5 * sin(uv.x * 220.0);      // individual buildings, not one smear
    float lum = dot(col, vec3(0.3, 0.59, 0.11));
    col += col * band * m.b * free * uFxB.x * (0.9 + 1.4 * smoothstep(0.45, 0.9, lum)) * (0.7 + 0.3 * bars) * I;
    col += vec3(0.2, 0.9, 1.0) * band * m.b * free * uFxB.x * 0.08 * I;
  }
  // Luminous outlines on the building edges, pulsing on the beat.
  if (uFxC.z > 0.0) {
    float e = length(vec2(dFdx(m.b), dFdy(m.b))) * 6.0;
    col += palette(uv.x + t * 0.1) * e * uFxC.z * (0.5 + uPulse) * free * I;
  }
  // Neon signs: each one buzzes, flickers and surges on its own.
  if (uFxA.w > 0.0 && guard.b > 0.05) {
    float id = guard.a * 255.0;
    float n = noise(vec2(id * 3.7, t * (6.0 + mod(id, 5.0))));
    float flick = n > 0.12 ? 1.0 : 0.25;                     // the odd drop-out
    float surge = 0.75 + 0.35 * sin(t * (1.5 + mod(id, 3.0)) + id) + 0.35 * uPulse;
    col = mix(col, col * flick * surge * 1.35, guard.b * uFxA.w * I);
  }
  // Haze over the hills, warmer toward the sun, drifting.
  if (uFxB.w > 0.0) {
    float far = 1.0 - depth;
    float hz = fbm(uv * vec2(3.0, 8.0) + vec2(t * 0.02, 0.0));
    vec3 tint = mix(vec3(1.0, 0.55, 0.35), vec3(0.75, 0.45, 1.0), smoothstep(0.0, 1.0, uv.x));
    col = mix(col, tint, far * far * hz * 0.35 * uFxB.w * (1.0 - m.r * 0.6) * free);
  }
  // Sun: a slow glow that swells on the bar.
  if (uFxD.y > 0.0) {
    vec2 dv = (uv - uSun) * vec2(uImgAspect, 1.0);
    float r = length(dv);
    col += vec3(1.0, 0.75, 0.4) * exp(-r * 9.0) * (0.35 + 0.25 * sin(t * 0.8) + 0.3 * uPulse) * uFxD.y * I * (1.0 - brand);
  }
  // Light beams from the rooftops, sweeping.
  if (uFxD.z > 0.0) {
    float beams = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      vec2 o = vec2(0.5 + 0.12 * (fi - 1.5), 0.32);
      float a = 1.5708 + sin(t * 0.35 + fi * 1.7) * 0.5;
      vec2 dv = uv - o;
      float ang = atan(-dv.y, dv.x);
      beams += exp(-pow((ang - a) * 18.0, 2.0)) * smoothstep(0.0, 0.05, -dv.y) * smoothstep(0.6, 0.0, length(dv));
    }
    col += palette(t * 0.05 + uv.x) * beams * m.r * 0.25 * uFxD.z * I;
  }
  // The cosmic vortex above the hills: flowing luminous lines, a turning spiral.
  if (uFxB.z > 0.0) {
    vec2 dv = (uv - uVortex.xy) * vec2(uImgAspect, 1.0) / uVortex.z;
    float r = length(dv), a = atan(dv.y, dv.x);
    float spiral = sin(a * 6.0 + log(r + 0.02) * 9.0 - t * 1.6);
    float lines = pow(0.5 + 0.5 * spiral, 18.0);
    float rings = pow(0.5 + 0.5 * sin(r * 40.0 - t * 2.0 + uBeat * 6.283), 24.0) * 0.5;
    float fall = smoothstep(1.0, 0.25, r) * smoothstep(0.0, 0.08, r);
    col += palette(a / 6.283 + t * 0.07 + r) * (lines + rings) * fall * m.r * uFxB.z * (0.6 + 0.4 * uPulse) * I;
  }

  // A metallic gleam sweeps across the logo every two bars (it never moves the letters).
  if (uShine.z > uShine.x && uv.x > uShine.x && uv.x < uShine.z && uv.y > uShine.y && uv.y < uShine.w) {
    float k = (uv.x - uShine.x) / (uShine.z - uShine.x) + (uv.y - uShine.y) / (uShine.w - uShine.y) * 0.35;
    float sweep = fract(uBar * 0.5) * 2.2 - 0.6;
    float g = exp(-pow((k - sweep) / 0.05, 2.0));
    float lum = dot(col, vec3(0.3, 0.59, 0.11));
    col += vec3(1.0, 0.92, 0.7) * g * smoothstep(0.35, 0.85, lum) * 0.55 * brand;
  }

  col *= uDim;

  // Overlay: the moving lights, cars, bats and notes, already in screen space.
  // Near trees and the brand art stand in front of it.
  vec4 ov = texture(uOverlay, s);
  float front = max(brand, m.a * step(uOcclude, depth));
  ov *= 1.0 - front * step(0.001, 1.0 - uOcclude);
  col = col * (1.0 - ov.a) + ov.rgb;

  // A gentle vignette.
  vec2 v = s - 0.5;
  col *= 1.0 - dot(v, v) * 0.35;
  outColor = vec4(col, 1.0);
}`;

// Between scenes: a kaleidoscope that folds the outgoing picture into the next.
export const TRANSITION_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uA, uB;
uniform float uMix, uTime, uAspect, uIntensity;
${NOISE}
vec2 kaleido(vec2 uv, float k, float segs) {
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
  float r = length(p), a = atan(p.y, p.x);
  float seg = 6.28318 / segs;
  float fa = abs(mod(a + uTime * 0.4, seg) - seg * 0.5);
  vec2 q = vec2(cos(fa), sin(fa)) * r * (1.0 + k * 0.3);
  q = q / vec2(uAspect, 1.0) + 0.5;
  return mix(uv, q, k);
}
void main() {
  float k = sin(uMix * 3.14159) * min(1.0, uIntensity);
  vec2 ua = kaleido(vUv, k, 8.0);
  vec2 ub = kaleido(vUv, k, 8.0);
  vec3 a = texture(uA, ua).rgb, b = texture(uB, ub).rgb;
  float w = smoothstep(0.0, 1.0, uMix + (fbm(vUv * 4.0 + uTime) - 0.5) * 0.35 * k);
  vec3 col = mix(a, b, w);
  col = hueRotate(col, k * 1.4);
  col += palette(length(vUv - 0.5) * 2.0 + uTime * 0.3) * k * 0.18;
  outColor = vec4(col, 1.0);
}`;

// Straight copy to the screen (used when no transition is running).
export const COPY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uA;
void main() { outColor = vec4(texture(uA, vUv).rgb, 1.0); }`;
