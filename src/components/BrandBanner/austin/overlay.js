// Everything drawn on top of the picture, in screen space, into a 2D canvas the
// scene shader lays over the picture: traffic with light trails, boats and
// wakes, bat ribbons, flocks, twinkling windows, splashes, music notes,
// waveform ribbons, and the Ghost reveal with the brand lettering.
//
// Each piece is a small component with update(dt) and draw(ctx, view):
// view.toScreen(fx, fy) maps a picture fraction to canvas pixels for the
// current camera, so every element sits where it belongs in the picture.

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;

export function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function along(pts, u) {
  let total = 0;
  const seg = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
  let d = Math.min(1, Math.max(0, u)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? Math.min(1, d / seg[i]) : 0;
      return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)];
    }
    d -= seg[i];
  }
  return pts[pts.length - 1];
}

/* ---------------- components ---------------- */

// Cars on a traced lane, two lamps each and a luminous trail, sized by distance.
export function Traffic(lane, seed) {
  const r = seeded(seed);
  const cars = Array.from({ length: lane.cars }, (_, i) => ({ q: i / lane.cars + r() * 0.06, sp: lane.speed * (0.8 + r() * 0.4) }));
  const c = lane.color.join(',');
  return {
    update(dt, music) { for (const k of cars) { k.q += k.sp * dt * (0.85 + 0.3 * music.pulse); if (k.q > 1) k.q -= 1; } },
    draw(ctx, v) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const k of cars) {
        const [fx, fy] = along(lane.pts, k.q);
        const [x, y] = v.toScreen(fx, fy);
        const [bx, by] = v.toScreen(...along(lane.pts, Math.max(0, k.q - 0.06)));
        const near = Math.min(1, Math.max(0.15, (fy - 0.2) / 0.6));
        const s = v.scale * (2.2 + near * 6);
        const g = ctx.createLinearGradient(bx, by, x, y);
        g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(1, `rgba(${c},0.8)`);
        ctx.strokeStyle = g;
        ctx.lineWidth = s * 0.9;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(x, y); ctx.stroke();
        for (const side of [-0.5, 0.5]) {
          const lg = ctx.createRadialGradient(x, y + side * s * 0.6, 0, x, y + side * s * 0.6, s * 1.6);
          lg.addColorStop(0, `rgba(${c},1)`); lg.addColorStop(0.3, `rgba(${c},0.55)`); lg.addColorStop(1, `rgba(${c},0)`);
          ctx.fillStyle = lg;
          ctx.fillRect(x - s * 1.6, y + side * s * 0.6 - s * 1.6, s * 3.2, s * 3.2);
        }
      }
      ctx.restore();
    },
  };
}

// A boat moving along a path, with a V wake that fans out and fades.
export function Boat(b, seed) {
  const r = seeded(seed);
  let q = r();
  return {
    update(dt) { q += b.speed * dt; if (q > 1) q -= 1; },
    draw(ctx, v) {
      const p = along(b.pts, q), p0 = along(b.pts, Math.max(0, q - 0.02));
      const [x, y] = v.toScreen(...p), [px, py] = v.toScreen(...p0);
      const a = Math.atan2(y - py, x - px);
      const L = b.size * v.w;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = Math.max(1, L * 0.06);
      for (let i = 1; i <= 8; i++) {
        ctx.globalAlpha = 0.75 / i;
        ctx.beginPath();
        ctx.moveTo(-L * 0.6 * i, -L * 0.22 * i); ctx.lineTo(-L * 0.4, 0); ctx.lineTo(-L * 0.6 * i, L * 0.22 * i);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(250,250,245,0.95)';
      ctx.beginPath(); ctx.ellipse(0, 0, L * 0.5, L * 0.16, 0, 0, TAU); ctx.fill();
      ctx.restore();
    },
  };
}

// The Congress Avenue bats: a ribbon that pours out from under the bridge and
// snakes up into the sky, each bat a body and two beating wings.
export function Bats(cfg, seed) {
  const r = seeded(seed);
  const bats = Array.from({ length: cfg.n }, () => ({ s: r(), sp: 0.05 + r() * 0.05, off: r() - 0.5, ph: r() * TAU, sz: 0.6 + r() * 0.8 }));
  return {
    update(dt) { for (const b of bats) { b.s += b.sp * dt; if (b.s > 1) b.s -= 1; } },
    draw(ctx, v, music) {
      const [x0, y0] = cfg.from, [x1, y1] = cfg.to;
      ctx.save();
      ctx.fillStyle = 'rgba(16,8,14,0.92)';
      ctx.beginPath();
      for (const b of bats) {
        const s = b.s;
        const snake = Math.sin(s * 7 - music.time * 0.9) * 0.06 * s;
        const fx = lerp(x0, x1, s) + snake + b.off * cfg.spread * (0.3 + s);
        const fy = lerp(y0, y1, s) + Math.sin(s * 11 + b.ph) * 0.01;
        const [x, y] = v.toScreen(fx, fy);
        const z = b.sz * v.scale * (2.0 + s * 2.6);
        const f = Math.sin(music.time * 16 + b.ph);
        ctx.moveTo(x + z * 0.4, y);
        ctx.ellipse(x, y, z * 0.4, z * 0.32, 0, 0, TAU);
        ctx.moveTo(x - z * 0.25, y); ctx.lineTo(x - z * 1.5, y - z * f); ctx.lineTo(x - z * 0.55, y + z * 0.35); ctx.closePath();
        ctx.moveTo(x + z * 0.25, y); ctx.lineTo(x + z * 1.5, y - z * f); ctx.lineTo(x + z * 0.55, y + z * 0.35); ctx.closePath();
      }
      ctx.fill();
      ctx.restore();
    },
  };
}

// A flock of birds crossing in a loose V, wings beating, gliding between beats.
export function Birds(cfg, seed) {
  const r = seeded(seed);
  const birds = Array.from({ length: cfg.n }, (_, i) => ({
    ox: -i * 0.018 * (0.7 + r() * 0.6), oy: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.012 + (r() - 0.5) * 0.01,
    ph: r() * TAU, rate: 0.8 + r() * 0.4, sz: 0.8 + r() * 0.5,
  }));
  let x = 0.25, y = lerp(cfg.y[0], cfg.y[1], r());
  return {
    update(dt) { x += cfg.speed * dt; if (x > 1.35) { x = -0.1; y = lerp(cfg.y[0], cfg.y[1], r()); } },
    draw(ctx, v, music) {
      ctx.save();
      ctx.strokeStyle = 'rgba(20,10,20,0.9)';
      ctx.lineCap = 'round';
      for (const b of birds) {
        const [sx, sy] = v.toScreen(x + b.ox, y + b.oy + Math.sin(music.time * 0.8 + b.ph) * 0.006);
        const s = cfg.size * v.w * b.sz;
        // Flap for a while, then glide: the wing angle eases to flat.
        const flap = Math.sin(music.time * 10 * b.rate + b.ph) * (0.5 + 0.5 * Math.sin(music.time * 0.7 + b.ph));
        const lift = s * 0.55 * flap;
        ctx.lineWidth = Math.max(1.2, s * 0.16);
        ctx.beginPath();
        ctx.moveTo(sx - s, sy - lift);
        ctx.quadraticCurveTo(sx - s * 0.45, sy - lift * 0.2 - s * 0.18, sx, sy);
        ctx.quadraticCurveTo(sx + s * 0.45, sy - lift * 0.2 - s * 0.18, sx + s, sy - lift);
        ctx.stroke();
        ctx.beginPath(); ctx.ellipse(sx, sy + s * 0.04, s * 0.22, s * 0.09, 0, 0, TAU); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
      }
      ctx.restore();
    },
  };
}

// Windows and lamps found in the picture, twinkling with varied rhythm; the
// soundwave in the shader lights whole buildings, this lights single panes.
export function Windows(lights, seed, { max = 700, chase = false } = {}) {
  const r = seeded(seed);
  const pts = lights.slice(0, max).map((p) => ({ x: p[0], y: p[1], c: [p[3], p[4], p[5]], ph: r() * TAU, sp: 0.5 + r() * 2.5, on: r() < 0.85 }));
  return {
    update() {},
    draw(ctx, v, music) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of pts) {
        let k = 0.5 + 0.5 * Math.sin(music.time * p.sp + p.ph);
        if (chase) k = Math.max(k * 0.4, Math.pow(0.5 + 0.5 * Math.sin(p.x * 24 - music.beat * Math.PI), 8));
        k = k * k * (p.on ? 1 : 0.2) * (0.7 + 0.5 * music.pulse);
        if (k < 0.04) continue;
        const [x, y] = v.toScreen(p.x, p.y);
        const s = v.scale * (0.7 + k * 1.3);
        const g = ctx.createRadialGradient(x, y, 0, x, y, s * 2);
        g.addColorStop(0, `rgba(255,252,235,${0.7 * k})`);
        g.addColorStop(0.35, `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${0.45 * k})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - s * 2, y - s * 2, s * 4, s * 4);
      }
      ctx.restore();
    },
  };
}

// Little splashes and sparkles where swimmers are.
export function Splashes(swimmers, seed) {
  const r = seeded(seed);
  const ps = swimmers.map((p) => ({ x: p[0], y: p[1], ph: r() * TAU, sp: 0.6 + r() * 0.8 }));
  return {
    update() {},
    draw(ctx, v, music) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of ps) {
        const k = Math.pow(Math.max(0, Math.sin(music.time * p.sp * 2 + p.ph)), 6);
        if (k < 0.05) continue;
        for (let i = 0; i < 5; i++) {
          const a = p.ph + i * 1.3;
          const d = 0.006 + 0.01 * k;
          const [x, y] = v.toScreen(p.x + Math.cos(a) * d, p.y - Math.abs(Math.sin(a)) * d * 0.7 + 0.004);
          ctx.fillStyle = `rgba(230,255,255,${0.75 * k})`;
          ctx.beginPath(); ctx.arc(x, y, v.scale * (1 + k * 1.5), 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    },
  };
}

// Music notes and glowing waveform ribbons that drift on the beat.
export function Notes(seed, { n = 10, area = [0, 0, 1, 1] } = {}) {
  const r = seeded(seed);
  const glyphs = ['♪', '♫', '♩', '♬'];
  const notes = Array.from({ length: n }, () => ({
    x: lerp(area[0], area[2], r()), y: lerp(area[1], area[3], r()), vy: 0.02 + r() * 0.03, ph: r() * TAU,
    g: glyphs[Math.floor(r() * glyphs.length)], hue: r() * 360, sz: 0.8 + r() * 0.8,
  }));
  return {
    update(dt) { for (const k of notes) { k.y -= k.vy * dt; if (k.y < area[1] - 0.05) { k.y = area[3]; k.x = lerp(area[0], area[2], r()); } } },
    draw(ctx, v, music) {
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const k of notes) {
        const x = (k.x + Math.sin(music.time * 1.2 + k.ph) * 0.01) * v.w, y = k.y * v.h;
        const s = v.h * 0.04 * k.sz * (1 + 0.15 * music.pulse);
        // A crisp note with a thin neon rim, not a smudge.
        ctx.font = `bold ${s}px "Segoe UI Symbol", "Noto Music", serif`;
        const hue = (k.hue + music.time * 40) % 360;
        ctx.shadowColor = `hsl(${hue},100%,60%)`;
        ctx.shadowBlur = s * 0.12;
        ctx.lineWidth = s * 0.05;
        ctx.strokeStyle = `hsl(${hue},100%,45%)`;
        ctx.strokeText(k.g, x, y);
        ctx.fillStyle = `hsl(${hue},100%,78%)`;
        ctx.fillText(k.g, x, y);
      }
      ctx.restore();
    },
  };
}

export function Waveform(seed, { y = 0.5, amp = 0.06, hue = 0 } = {}) {
  return {
    update() {},
    draw(ctx, v, music) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        for (let i = 0; i <= 160; i++) {
          const u = i / 160;
          const env = Math.sin(u * Math.PI);
          const yy = y + Math.sin(u * 18 + music.time * 2.4 + k * 1.3) * amp * env * (0.4 + 0.6 * music.pulse)
            + Math.sin(u * 47 - music.time * 3.1 + k) * amp * 0.25 * env;
          const X = u * v.w, Y = yy * v.h;
          if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        }
        ctx.strokeStyle = `hsla(${(hue + k * 70 + music.time * 30) % 360},100%,62%,0.55)`;
        ctx.lineWidth = v.h * (0.003 - k * 0.0007);
        ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = v.h * 0.008;
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

/* ---------------- the Ghost reveal ---------------- */

// The Ghost from Chris's own art (cut from the first banner picture: cap,
// headphones, chain, mic and pen). He spirals out of the light, floats,
// blinks, his grin opens on the beat, his head bobs, the pen writes, the mic
// hand moves and the robe's tail ripples. Then LYRICIST PRO is revealed in
// dimensional metallic lettering.
//
// Parts are places in the cut-out (fractions of it), moved as feathered
// patches over the body: nothing is redrawn by hand.
const PARTS = {
  head: [0.10, 0.00, 0.62, 0.42],      // x, y, w, h: cap, face, headphones
  eyeL: [0.395, 0.315, 0.045, 0.028],  // centre x, y, radius x, y
  eyeR: [0.495, 0.293, 0.048, 0.03],
  mouth: [0.36, 0.335, 0.18, 0.08],
  pen: [0.22, 0.46, 0.17, 0.22],
  mic: [0.64, 0.27, 0.25, 0.27],
  tail: [0.60, 0.70, 0.40, 0.30],
};
const SKIN = 'rgb(250,232,210)';

function patch(img, box, feather = 0.22) {
  const [x, y, w, h] = box;
  const pw = Math.max(2, Math.round(w * img.width)), ph = Math.max(2, Math.round(h * img.height));
  const c = document.createElement('canvas');
  c.width = pw; c.height = ph;
  const g = c.getContext('2d');
  g.drawImage(img, x * img.width, y * img.height, pw, ph, 0, 0, pw, ph);
  g.globalCompositeOperation = 'destination-in';
  const r = g.createRadialGradient(pw / 2, ph / 2, Math.min(pw, ph) * (0.5 - feather), pw / 2, ph / 2, Math.max(pw, ph) * 0.62);
  r.addColorStop(0, '#000'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, pw, ph);
  return c;
}

export function GhostReveal(art) {
  let blinkAt = 1.8, blinkStart = -1, patches = null;
  const r = seeded(77);
  const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
  function lettering(ctx, text, x, y, size, k, music, sub = false) {
    if (k <= 0) return;
    ctx.save();
    ctx.font = `${size}px "Audiowide", "Arial Black", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width;
    // The letters wipe in left to right.
    ctx.beginPath();
    ctx.rect(x - w / 2 - size, y - size, (w + size * 2) * ease(k), size * 2);
    ctx.clip();
    const depth = sub ? 4 : 10;
    for (let i = depth; i > 0; i--) {
      ctx.fillStyle = `rgb(${60 + i * 6},${18 + i * 2},${40 + i * 4})`;
      ctx.fillText(text, x + i * size * 0.008, y + i * size * 0.012);
    }
    const g = ctx.createLinearGradient(x, y - size * 0.5, x, y + size * 0.5);
    g.addColorStop(0, '#fff6c8'); g.addColorStop(0.28, '#ffcf45'); g.addColorStop(0.55, '#ff8a1e'); g.addColorStop(0.8, '#ff3d9a'); g.addColorStop(1, '#b03cff');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(0,229,255,0.9)'; ctx.shadowBlur = size * 0.16 * (0.6 + 0.6 * music.pulse);
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.strokeStyle = 'rgba(0,240,255,0.85)';
    ctx.strokeText(text, x, y);
    const sweep = ((music.time * 0.35) % 1.6) - 0.3;
    const sg = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    sg.addColorStop(Math.min(1, Math.max(0, sweep - 0.08)), 'rgba(255,255,255,0)');
    sg.addColorStop(Math.min(1, Math.max(0, sweep)), 'rgba(255,255,255,0.8)');
    sg.addColorStop(Math.min(1, Math.max(0, sweep + 0.08)), 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = sg;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  // The spiral of musical energy he comes out of.
  function spiral(ctx, cx, cy, R, t, k) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let arm = 0; arm < 5; arm++) {
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const u = i / 120;
        const a = arm * (Math.PI * 2 / 5) + u * 7 - t * 1.6;
        const rr = R * u * (0.3 + 0.7 * k);
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.75;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = `hsla(${(arm * 72 + t * 50) % 360},100%,62%,${0.55 * k})`;
      ctx.lineWidth = R * 0.012;
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = R * 0.05;
      ctx.stroke();
    }
    ctx.restore();
  }
  return {
    reset() { blinkAt = 1.8; blinkStart = -1; },
    update() {},
    draw(ctx, v, music, local) {
      const t = local, W = v.w, H = v.h;
      const img = art.ghost;
      if (!img?.complete) return;
      if (!patches) patches = { head: patch(img, PARTS.head, 0.08), mouth: patch(img, PARTS.mouth, 0.1), pen: patch(img, PARTS.pen), mic: patch(img, PARTS.mic), tail: patch(img, PARTS.tail, 0.05) };
      const cx0 = W * 0.31, cy0 = H * 0.5;
      // 0-2 s the spiral gathers, 1-4.5 s he spins out of it, then floats.
      const sk = ease(t / 2) * (1 - ease((t - 7) / 3)) * 0.9 + 0.1;
      spiral(ctx, cx0, cy0, H * 0.55, t, sk);
      const k = ease((t - 1.0) / 3.5);
      if (k <= 0) return;
      const S = H * 0.82 * (0.15 + 0.85 * k);
      const Wd = S * img.width / img.height;
      const cx = cx0 + Math.sin(t * 0.55) * W * 0.02, cy = cy0 + Math.sin(t * 1.1) * H * 0.02;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((1 - k) * 6.0 + Math.sin(t * 0.8) * 0.03);
      ctx.globalAlpha = Math.min(1, k * 1.5);
      const x0 = -Wd / 2, y0 = -S / 2;
      const at = (fx, fy) => [x0 + fx * Wd, y0 + fy * S];
      ctx.drawImage(img, x0, y0, Wd, S);
      // Robe tail: ripples like cloth in a breeze.
      {
        const [tx, ty, tw, th] = PARTS.tail, c = patches.tail;
        const strips = 24;
        for (let i = 0; i < strips; i++) {
          const v0 = i / strips;
          const sway = Math.sin(t * 2.6 + v0 * 6) * S * 0.012 * v0;
          ctx.drawImage(c, 0, v0 * c.height, c.width, c.height / strips + 1, x0 + tx * Wd + sway, y0 + (ty + v0 * th) * S, tw * Wd, th * S / strips + 1);
        }
      }
      // Pen writing: small fast strokes.
      {
        const [px, py, pw, ph] = PARTS.pen;
        const dx = Math.sin(t * 13) * S * 0.006, dy = Math.abs(Math.sin(t * 6.5)) * S * 0.004;
        ctx.drawImage(patches.pen, x0 + px * Wd + dx, y0 + py * S + dy, pw * Wd, ph * S);
      }
      // Mic hand: moves with the beat.
      {
        const [mx, my, mw, mh] = PARTS.mic;
        const dy = -music.pulse * S * 0.012 + Math.sin(t * 1.7) * S * 0.006;
        ctx.save();
        ctx.translate(...at(mx + mw * 0.3, my + mh * 0.8));
        ctx.rotate(Math.sin(t * 1.7) * 0.05 - music.pulse * 0.04);
        ctx.drawImage(patches.mic, -mw * 0.3 * Wd, -mh * 0.8 * S + dy, mw * Wd, mh * S);
        ctx.restore();
      }
      // Head: nods on the beat, a mischievous tilt.
      const [hx, hy, hw, hh] = PARTS.head;
      ctx.save();
      ctx.translate(...at(hx + hw / 2, hy + hh * 0.95));
      ctx.rotate(Math.sin(t * 0.9) * 0.05);
      ctx.translate(0, music.pulse * S * 0.012);
      const hx0 = -hw / 2 * Wd, hy0 = -hh * 0.95 * S;
      ctx.drawImage(patches.head, hx0, hy0, hw * Wd, hh * S);
      const toHead = (fx, fy) => [hx0 + (fx - hx) * Wd, hy0 + (fy - hy) * S];
      // The grin opens on the beat.
      {
        const [mx, my, mw, mh] = PARTS.mouth;
        const open = 1 + music.pulse * 0.35;
        const [ax, ay] = toHead(mx, my);
        ctx.drawImage(patches.mouth, ax, ay - (open - 1) * mh * S * 0.3, mw * Wd, mh * S * open);
      }
      // Blinks.
      if (blinkStart < 0 && t > blinkAt) blinkStart = t;
      let lid = 0;
      if (blinkStart >= 0) {
        const p = (t - blinkStart) / 0.18;
        lid = p < 0.5 ? p * 2 : p < 1 ? (1 - p) * 2 : 0;
        if (p >= 1) { blinkStart = -1; blinkAt = t + (r() < 0.25 ? 0.3 : 2.2 + r() * 3); }
      }
      if (lid > 0) {
        ctx.fillStyle = SKIN;
        for (const key of ['eyeL', 'eyeR']) {
          const [ex, ey, rx, ry] = PARTS[key];
          const [X, Y] = toHead(ex, ey);
          const RX = rx * Wd * 1.25, RY = ry * S * 1.4;
          ctx.save();
          ctx.beginPath(); ctx.ellipse(X, Y, RX, RY, 0, 0, Math.PI * 2); ctx.clip();
          ctx.fillRect(X - RX, Y - RY, RX * 2, RY * 2 * lid);
          ctx.restore();
        }
      }
      ctx.restore();
      ctx.restore();
      // The lettering, exactly as the brand spells it.
      const k1 = (t - 6.0) / 1.6, k2 = (t - 7.4) / 1.2, k3 = (t - 8.4) / 1.0;
      const tx = W * 0.69;
      lettering(ctx, 'LYRICIST PRO', tx, H * 0.40, H * 0.13, k1, music);
      lettering(ctx, 'FUNK AUDIO FLOW OPSEC', tx, H * 0.555, H * 0.05, k2, music, true);
      lettering(ctx, 'AUSTIN, TX', tx, H * 0.64, H * 0.042, k3, music, true);
    },
  };
}
