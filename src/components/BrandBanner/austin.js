/**
 * THE AUSTIN SCENES, ANIMATED IN CODE.
 *
 * Chris, 2026-10-28: "all banner scenes need to be animated", "I WANT HEAVY
 * ANIMATION", then "animate the clouds, the buildings, the river / town lake
 * with psychedelic animations and visuals". Every scene is drawn from its
 * photo on a canvas, one per side of the logo, and everything moves:
 *
 *   warps     the clouds melt and flow (rows sliding on slow waves), the
 *             buildings ripple (columns rising and falling), the water rolls
 *             (fast rows with the reflections breaking up).
 *   washes    a rainbow that keeps turning, laid over the sky, the buildings
 *             and the water in the 'hue' blend: the colours swim, the picture
 *             underneath stays readable.
 *   lights    the windows, signs and bulbs found in each photo
 *             (austin-lights.json, scripts/banner-lights.py) twinkle and
 *             cycle colour; on Sixth Street they chase in waves.
 *   life      bats pouring out of Congress Avenue Bridge, flocks crossing,
 *             the kites over Zilker swaying on the wind and the grackles
 *             bobbing on the wire (cut out of the photo, austin-cutouts.json,
 *             scripts/banner-cutouts.py), traffic over Pennybacker, boats with
 *             wakes, sun rays turning over the Hill Country.
 *
 * Every place is given in fractions of the photo, so it lands on the same
 * spot whatever size the banner is. Nothing here reads pixels back: in the
 * packaged app the pictures come from file://, which would taint the canvas.
 */
import LIGHTS from './austin-lights.json';
import CUTOUTS from './austin-cutouts.json';

const TAU = Math.PI * 2;

// One seeded random stream per scene, so the bats and flocks start the same way every time.
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/*
 * Per picture: rectangles are [x0, y0, x1, y1] fractions of the photo.
 *   sky / build / water: where the melt, the ripple and the roll go, and the
 *   rainbow wash with them. life: the moving things.
 */
export const SCENES = {
  'skyline-west': {
    sky: [0.26, 0, 1, 0.36], build: [0.30, 0.16, 1, 0.62], water: [[0.27, 0.665, 1, 1]],  // the statue stays bronze
    life: { flocks: 2, boats: [[[1.02, 0.80], [0.30, 0.86]]] },
  },
  'skyline-east': {
    sky: [0, 0, 1, 0.36], build: [0.17, 0.30, 0.70, 0.63], water: [[0, 0.68, 0.695, 1], [0.748, 0.68, 0.955, 1]],
    clean: true,
    life: { bats: { from: [0.47, 0.60], to: [0.62, -0.05], n: 260 }, flocks: 1, grackles: true },
  },
  'sixth-west': {
    sky: [0.28, 0, 0.78, 0.30], build: [0, 0, 1, 0.62], water: [[0.18, 0.80, 0.86, 1]], waterAmp: 0.3,
    life: { chase: true, flocks: 0 },
  },
  'sixth-east': {
    sky: [0, 0, 0.36, 0.42], build: [0.36, 0, 1, 0.62], water: [[0, 0.79, 0.62, 1]], waterAmp: 0.3,
    life: { chase: true, cars: [[[-0.05, 0.705], [0.40, 0.69]], [[0.40, 0.715], [-0.05, 0.73]]] },
  },
  'zilker-west': {
    sky: [0, 0, 1, 0.43], build: [0.58, 0.40, 1, 0.56], water: [],
    clean: true,
    life: { kites: true, flocks: 2 },
  },
  'zilker-east': {
    sky: [0, 0, 1, 0.20], build: [0, 0, 1, 0.45], water: [[0.06, 0.51, 1, 1]], waterAmp: 1.4, waterWash: 0.45,
    life: { caustics: true, flocks: 1 },
  },
  'hills-west': {
    sky: [0, 0, 1, 0.46], build: null, water: [[0.33, 0.56, 0.78, 1]], waterAmp: 0.6,
    life: { sun: [0.69, 0.27], flocks: 2, boats: [[[0.66, 0.97], [0.44, 0.66]]] },
  },
  'hills-east': {
    sky: [0, 0, 1, 0.42], build: null, water: [[0.06, 0.50, 0.44, 0.66]],  // stops short of the arch
    life: {
      flocks: 1,
      cars: [
        [[0.10, 1.00], [0.30, 0.865], [0.50, 0.735], [0.70, 0.605], [0.86, 0.50]],
        [[0.87, 0.515], [0.71, 0.62], [0.51, 0.75], [0.31, 0.88], [0.12, 1.02]],
      ],
      boats: [[[0.08, 0.60], [0.46, 0.575]]],
    },
  },
};

/* ---------- geometry ---------- */

// Where the photo sits on a canvas cw x ch, like object-fit: cover with the
// given object-position. Also the slow breathing zoom.
function fit(img, cw, ch, px, t) {
  const zoom = 1.04 + 0.025 * Math.sin(t * 0.11);
  const s = Math.max(cw / img.width, ch / img.height) * zoom;
  const dw = img.width * s, dh = img.height * s;
  return { s, dw, dh, dx: (cw - dw) * px, dy: (ch - dh) * 0.55 };
}
const at = (f, fx, fy) => [f.dx + fx * f.dw, f.dy + fy * f.dh];
const rectPx = (f, r) => [f.dx + r[0] * f.dw, f.dy + r[1] * f.dh, (r[2] - r[0]) * f.dw, (r[3] - r[1]) * f.dh];

// Points along a polyline of photo fractions, u in 0..1.
function along(pts, u) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segs.push(l); total += l;
  }
  let d = u * total;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const k = segs[i] ? Math.min(1, d / segs[i]) : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
    }
    d -= segs[i];
  }
  return pts[pts.length - 1];
}

/* ---------- warps: strips of the photo redrawn off their place ---------- */

// Rows slide sideways: amp in css px, freq in waves per photo height, speed in radians/s.
function warpRows(ctx, img, f, r, amp, freq, speed, t, dpr, fade = true) {
  const [x, y, w, h] = rectPx(f, r);
  const step = 2 / dpr;   // 2 device px per strip
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let yy = Math.max(0, y); yy < y + h; yy += step) {
    const sy = (yy - f.dy) / f.s;
    const k = (yy - y) / h;
    const edge = fade ? Math.min(1, k * 6, (1 - k) * 6) : 1;
    const ph = sy / img.height * freq * TAU;
    const off = (Math.sin(ph + t * speed) + 0.5 * Math.sin(ph * 2.3 - t * speed * 1.7)) * amp * edge;
    const sx = (x - f.dx) / f.s;
    ctx.drawImage(img, sx, sy, w / f.s, step / f.s + 0.5, x + off, yy, w, step + 0.5);
  }
  ctx.restore();
}

// Columns rise and fall: the buildings breathe.
function warpCols(ctx, img, f, r, amp, freq, speed, t, dpr) {
  const [x, y, w, h] = rectPx(f, r);
  const step = 3 / dpr;
  for (let xx = Math.max(0, x); xx < x + w; xx += step) {
    const sx = (xx - f.dx) / f.s;
    const k = (xx - x) / w;
    const edge = Math.min(1, k * 8, (1 - k) * 8);
    const ph = sx / img.width * freq * TAU;
    const off = Math.sin(ph + t * speed) * Math.sin(t * 0.37 + ph * 0.3) * amp * edge;
    const sy = (y - f.dy) / f.s;
    ctx.drawImage(img, sx, sy, step / f.s + 0.5, h / f.s, xx, y + off, step + 0.5, h);
  }
}

/* ---------- washes ---------- */

// A turning rainbow, blended in with `mode`, faded at the rect's edges.
function wash(st, ctx, f, r, t, mode, alpha, hueSpeed, angle) {
  const [x, y, w, h] = rectPx(f, r);
  if (w <= 0 || h <= 0) return;
  const tmp = st.tmp;
  const tc = tmp.getContext('2d');
  tc.setTransform(1, 0, 0, 1, 0, 0);
  tc.clearRect(0, 0, tmp.width, tmp.height);
  tc.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
  const cx = x + w / 2, cy = y + h / 2, R = Math.hypot(w, h) / 2;
  const a = angle + t * 0.05;
  const g = tc.createLinearGradient(cx - Math.cos(a) * R, cy - Math.sin(a) * R, cx + Math.cos(a) * R, cy + Math.sin(a) * R);
  const h0 = (t * hueSpeed) % 360;
  for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${(h0 + i * 60) % 360},100%,55%)`);
  tc.fillStyle = g;
  tc.fillRect(x, y, w, h);
  // Soft edges all round so it melts into the untouched photo.
  tc.globalCompositeOperation = 'destination-in';
  const m = tc.createLinearGradient(0, y, 0, y + h);
  m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(0.15, 'rgba(0,0,0,1)');
  m.addColorStop(0.85, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
  tc.fillStyle = m;
  tc.fillRect(x, y, w, h);
  const side = tc.createLinearGradient(x, 0, x + w, 0);
  side.addColorStop(0, 'rgba(0,0,0,0)'); side.addColorStop(0.08, 'rgba(0,0,0,1)');
  side.addColorStop(0.92, 'rgba(0,0,0,1)'); side.addColorStop(1, 'rgba(0,0,0,0)');
  tc.fillStyle = side;
  tc.fillRect(x, y, w, h);
  tc.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = mode;
  ctx.globalAlpha = alpha;
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
}

/* ---------- life ---------- */

function bird(ctx, x, y, size, flap, color) {
  const wing = size * (0.35 + 0.65 * Math.abs(Math.sin(flap)));
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.18);
  ctx.beginPath();
  ctx.moveTo(x - size, y - wing * 0.6);
  ctx.quadraticCurveTo(x - size * 0.4, y - wing * 0.1, x, y);
  ctx.quadraticCurveTo(x + size * 0.4, y - wing * 0.1, x + size, y - wing * 0.6);
  ctx.stroke();
}

function makeLife(cfg, rnd) {
  const L = cfg.life || {};
  const life = { bats: [], flocks: [], kites: [], grackles: [] };
  if (L.bats) for (let i = 0; i < L.bats.n; i++) life.bats.push({ s: rnd(), sp: 0.05 + rnd() * 0.05, off: (rnd() - 0.5), ph: rnd() * TAU, sz: 0.6 + rnd() * 0.9 });
  for (let i = 0; i < (L.flocks || 0); i++) life.flocks.push(newFlock(rnd, rnd() * 20));
  return life;
}
function newFlock(rnd, delay = 0) {
  const dir = rnd() < 0.5 ? 1 : -1;
  const n = 4 + Math.floor(rnd() * 8);
  return {
    t0: delay, dur: 14 + rnd() * 10, dir, y: 0.06 + rnd() * 0.22, dy: (rnd() - 0.5) * 0.1,
    birds: Array.from({ length: n }, (_, i) => ({ ox: -i * 0.018 * (0.6 + rnd()), oy: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.02 + (rnd() - 0.5) * 0.01, ph: rnd() * TAU, sz: 0.8 + rnd() * 0.5 })),
  };
}

/* ---------- the scene ---------- */

/**
 * One side of one scene. srcs: { img, clean? } (loaded HTMLImageElements).
 * Returns { draw(ctx, cw, ch, dpr, t, dt) }.
 */
export function makeSide(name, srcs, posX) {
  const cfg = SCENES[name];
  const rnd = seeded(name.length * 7919 + name.charCodeAt(0));
  const lights = (LIGHTS[name] || []).map((p) => ({ x: p[0], y: p[1], sz: p[2], c: [p[3], p[4], p[5]], ph: rnd() * TAU, sp: 0.8 + rnd() * 2.2 }));
  const cut = CUTOUTS[name] || [];
  const life = makeLife(cfg, rnd);
  const sprites = cut.map((b) => ({ b, ph: rnd() * TAU, ph2: rnd() * TAU, sp: 0.6 + rnd() * 0.8, canvas: null }));
  const st = { tmp: document.createElement('canvas'), dpr: 1 };
  let last = 0;

  // A cut-out with feathered edges, from the original photo, made once.
  function sprite(sp) {
    if (sp.canvas) return sp.canvas;
    const img = srcs.img;
    const [bx, by, bw, bh] = sp.b;
    const w = Math.max(2, Math.round(bw * img.width)), h = Math.max(2, Math.round(bh * img.height));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(img, bx * img.width, by * img.height, w, h, 0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    const rg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.62);
    rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);
    sp.canvas = c;
    return c;
  }

  function draw(ctx, cw, ch, dpr, t) {
    const img = srcs.img;
    if (!img || !img.complete || !img.naturalWidth) return;
    const base = cfg.clean && srcs.clean?.complete && srcs.clean.naturalWidth ? srcs.clean : img;
    const dt = Math.min(0.1, Math.max(0, t - last)); last = t;
    st.dpr = dpr;
    if (st.tmp.width !== Math.round(cw * dpr) || st.tmp.height !== Math.round(ch * dpr)) {
      st.tmp.width = Math.round(cw * dpr); st.tmp.height = Math.round(ch * dpr);
    }
    const f = fit(base, cw, ch, posX, t);
    const u = f.dh / 300;   // motion scales with the picture's drawn size

    // The photo.
    ctx.drawImage(base, f.dx, f.dy, f.dw, f.dh);

    // Warps: melting clouds, breathing buildings, rolling water.
    if (cfg.sky) warpRows(ctx, base, f, cfg.sky, 7 * u, 3, 0.55, t, dpr);
    if (cfg.build) warpCols(ctx, base, f, cfg.build, 3.2 * u, 9, 1.1, t, dpr);
    const wa = cfg.waterAmp ?? 1;
    for (const r of cfg.water || []) warpRows(ctx, base, f, r, 5.5 * u * wa, 46, 2.6, t, dpr);

    // Psychedelic washes: the hues swim; 'soft-light' pushes the colour back up.
    if (cfg.sky) { wash(st, ctx, f, cfg.sky, t, 'hue', 0.55, 22, 0.4); wash(st, ctx, f, cfg.sky, t + 40, 'soft-light', 0.35, 22, 0.4); }
    if (cfg.build) wash(st, ctx, f, cfg.build, t + 15, 'hue', 0.42, 34, 1.4);
    const ww = cfg.waterWash ?? 1;
    for (const r of cfg.water || []) { wash(st, ctx, f, r, t + 70, 'hue', 0.6 * ww, 46, -0.3); wash(st, ctx, f, r, t + 90, 'soft-light', 0.45 * ww, 46, -0.3); }

    // Sun rays turning over the hills.
    const L = cfg.life || {};
    if (L.sun) {
      const [sx, sy] = at(f, L.sun[0], L.sun[1]);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const R = f.dh * 0.9;
      for (let i = 0; i < 14; i++) {
        const a = t * 0.12 + i * TAU / 14;
        const hue = (t * 30 + i * 26) % 360;
        ctx.fillStyle = `hsla(${hue},100%,65%,${0.07 + 0.05 * Math.sin(t * 1.3 + i)})`;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.arc(sx, sy, R, a - 0.06, a + 0.06);
        ctx.closePath();
        ctx.fill();
      }
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, f.dh * (0.22 + 0.04 * Math.sin(t * 1.7)));
      g.addColorStop(0, 'rgba(255,240,200,0.75)'); g.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - R, sy - R, R * 2, R * 2);
      ctx.restore();
    }

    // Lights: twinkle, colour cycling, chasing in waves on Sixth Street.
    if (lights.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of lights) {
        const [x, y] = at(f, p.x, p.y);
        if (x < -10 || x > cw + 10) continue;
        let k = 0.5 + 0.5 * Math.sin(t * p.sp + p.ph);
        if (L.chase) k = Math.max(k * 0.5, Math.pow(0.5 + 0.5 * Math.sin(p.x * 28 - t * 4.2), 6));
        k = k * k;
        const hue = (t * 60 + p.x * 360 + p.y * 120) % 360;
        const r = (1.6 + p.sz * 3.2) * u * (0.7 + k * 0.8);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
        g.addColorStop(0, `rgba(255,255,255,${0.55 * k})`);
        g.addColorStop(0.3, `hsla(${hue},100%,62%,${0.5 * k})`);
        g.addColorStop(1, 'hsla(0,0%,0%,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
      }
      ctx.restore();
    }

    // Caustics: sun dancing on the Barton Springs water.
    if (L.caustics) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const r0 = cfg.water[0];
      for (let i = 0; i < 90; i++) {
        const fx = r0[0] + ((i * 0.6180339 + Math.sin(t * 0.3 + i) * 0.02) % 1) * (r0[2] - r0[0]);
        const fy = r0[1] + ((i * 0.4142 + t * 0.008 * (i % 3 + 1)) % 1) * (r0[3] - r0[1]);
        const [x, y] = at(f, fx, fy);
        const k = Math.pow(Math.max(0, Math.sin(t * (1.6 + (i % 5) * 0.7) + i * 1.7)), 8);
        if (k < 0.02) continue;
        const r = (2 + (i % 4)) * u * (0.6 + k);
        ctx.fillStyle = `hsla(${(t * 50 + i * 9) % 360},100%,88%,${0.9 * k})`;
        ctx.fillRect(x - r, y - 0.5 * u, r * 2, 1 * u);
        ctx.fillRect(x - 0.5 * u, y - r, 1 * u, r * 2);
      }
      ctx.restore();
    }

    // Kites over Zilker: back on top of the clean sky, swaying on their strings.
    if (L.kites) {
      for (const sp of sprites) {
        const [bx, by, bw, bh] = sp.b;
        const c = sprite(sp);
        const [x, y] = at(f, bx + bw / 2, by + bh / 2);
        const w = bw * f.dw, h = bh * f.dh;
        ctx.save();
        ctx.translate(x + Math.sin(t * sp.sp + sp.ph) * 9 * u, y + Math.sin(t * sp.sp * 1.6 + sp.ph2) * 6 * u);
        ctx.rotate(Math.sin(t * sp.sp * 1.3 + sp.ph) * 0.28);
        ctx.drawImage(c, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }

    // Grackles: bobbing, shuffling, the odd wing flick.
    if (L.grackles) {
      for (const sp of sprites) {
        const [bx, by, bw, bh] = sp.b;
        const c = sprite(sp);
        const [x, y] = at(f, bx + bw / 2, by + bh / 2);
        const w = bw * f.dw, h = bh * f.dh;
        const hop = Math.max(0, Math.sin(t * 0.9 * sp.sp + sp.ph) - 0.86) * 40 * u;
        const flick = 1 + Math.max(0, Math.sin(t * 1.7 * sp.sp + sp.ph2) - 0.9) * 1.6;
        ctx.save();
        ctx.translate(x + Math.sin(t * 0.5 + sp.ph) * 2.5 * u, y - Math.abs(Math.sin(t * 2.2 * sp.sp + sp.ph)) * 1.6 * u - hop);
        ctx.scale(flick, 1 / Math.sqrt(flick));
        ctx.drawImage(c, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }

    // Bats pouring out from under the bridge, a ribbon that never stops.
    if (L.bats) {
      const [x0, y0] = L.bats.from, [x1, y1] = L.bats.to;
      ctx.save();
      ctx.fillStyle = 'rgba(20,12,18,0.9)';
      for (const b of life.bats) {
        b.s += b.sp * dt;
        if (b.s > 1) b.s -= 1;
        const s = b.s;
        const wob = Math.sin(s * 9 + t * 1.4 + b.ph) * 0.05 + b.off * (0.02 + s * 0.12);
        const fx = x0 + (x1 - x0) * s + wob, fy = y0 + (y1 - y0) * s + Math.sin(s * 5 + t) * 0.02;
        const [x, y] = at(f, fx, fy);
        const sz = b.sz * u * (1.2 + s * 1.2);
        const fl = Math.abs(Math.sin(t * 14 + b.ph));
        ctx.beginPath();
        ctx.ellipse(x, y, sz * (0.6 + fl), sz * 0.45, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // Flocks crossing.
    for (let i = 0; i < life.flocks.length; i++) {
      const fl = life.flocks[i];
      const k = (t - fl.t0) / fl.dur;
      if (k < 0) continue;
      if (k > 1) { life.flocks[i] = newFlock(rnd, t + 4 + rnd() * 14); continue; }
      const bxs = fl.dir > 0 ? -0.1 + k * 1.25 : 1.1 - k * 1.25;
      for (const b of fl.birds) {
        const [x, y] = at(f, bxs + b.ox * fl.dir * -1, fl.y + b.oy + fl.dy * k + Math.sin(t * 0.8 + b.ph) * 0.008);
        bird(ctx, x, y, 4.5 * u * b.sz, t * 7 + b.ph, 'rgba(25,18,24,0.85)');
      }
    }

    // Traffic: headlights one way, tail lights the other.
    if (L.cars) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      L.cars.forEach((path, lane) => {
        const n = 7;
        for (let i = 0; i < n; i++) {
          const q = ((t * (0.07 + lane * 0.012) + i / n + lane * 0.13) % 1);
          const [x, y] = at(f, ...along(path, q));
          const col = lane === 0 ? '255,245,220' : '255,40,30';
          const r = 3.2 * u;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
          g.addColorStop(0, `rgba(${col},0.95)`); g.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
        }
      });
      ctx.restore();
    }

    // Boats and their wakes.
    for (const path of L.boats || []) {
      const q = (t * 0.018) % 1;
      const [fx, fy] = along(path, q);
      const [x, y] = at(f, fx, fy);
      const [px, py] = at(f, ...along(path, Math.max(0, q - 0.02)));
      const a = Math.atan2(y - py, x - px);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.2 * u;
      for (let i = 1; i <= 5; i++) {
        ctx.globalAlpha = 0.7 / i;
        ctx.beginPath();
        ctx.moveTo(-i * 9 * u, -i * 3.2 * u); ctx.lineTo(0, 0); ctx.lineTo(-i * 9 * u, i * 3.2 * u);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(245,245,240,0.95)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 5 * u, 1.8 * u, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  return { draw };
}
