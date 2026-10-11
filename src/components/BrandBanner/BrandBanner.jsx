import React, { useEffect, useRef, useState } from 'react';
import brandLogo from '../../assets/brand-logo.webp';
import bhLoop from '../../assets/blackhole/bh_loop.webm';
import { useLyricStore } from '../../context/LyricStore.jsx';
import { getAudioContext, getMasterBus } from '../../services/audioEngine.js';
import './BrandBanner.css';

/**
 * THE BRAND BANNER. Chris, 2026-10-11: "put that whole image as the top header
 * of the whole app", then "make the logo double the size", then, about the
 * black either side of it: "Do all 4! Make them alternate or give them a switch!"
 *
 * The logo sits in the middle (its black cut away, brand-logo.webp has alpha)
 * and the two sides show one of four scenes:
 *   bars    — mirrored bars running out from the logo, pulsing to whatever the
 *             player is playing (a tap on the shared master bus). Nothing
 *             playing: stars drifting in towards the logo.
 *   disc    — the Black Hole Studios loop stretched wide behind the logo, so
 *             the logo sits in the middle of the spinning disc.
 *   skyline — the Austin skyline from the logo carried out to both edges:
 *             Capitol and UT Tower on the left, Frost, the Independent and
 *             the Austonian on the right, the lake below, the bats at dusk.
 *   info    — what's playing on the left, the song's genre, mood and topic
 *             on the right.
 * Auto moves through all four, twenty seconds each. The pill in the corner
 * steps through Auto, each scene and Off; the choice is remembered.
 */

const MODES = ['auto', 'bars', 'disc', 'skyline', 'info', 'off'];
const LABEL = { auto: 'Auto', bars: 'Bars', disc: 'Disc', skyline: 'Skyline', info: 'Song info', off: 'Off' };
const ROTATION = ['bars', 'disc', 'skyline', 'info'];
const ROTATE_MS = 20000;
const FADE_MS = 1400;
const MODE_KEY = 'lyricistBannerMode';
const LOGO_ASPECT = 605 / 660;
const REDUCED_MOTION = typeof window !== 'undefined'
  && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function savedMode() {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return MODES.includes(m) ? m : 'auto';
  } catch { return 'auto'; }
}

// Small seeded random so the skyline is the same every time it's drawn.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── bars ─────────────────────────────────────────────────────────────── */

function makeStars(n, rand) {
  return Array.from({ length: n }, () => ({ u: rand(), v: rand(), side: rand() < 0.5 ? -1 : 1, sp: 0.6 + rand() * 0.9, tw: rand() * 6.28 }));
}

function drawBars(g, st, W, H, dt, t) {
  const cx = W / 2, cy = H * 0.5;
  const logoHalf = (H * LOGO_ASPECT) / 2;
  const inner = logoHalf * 0.86;          // bars start just under the logo's rim
  const side = cx - inner;
  g.clearRect(0, 0, W, H);
  if (side < 20) return;

  // Level from the master bus. Nothing on it reads as zero.
  const A = st.analyser;
  let level = 0;
  if (A?.an) {
    A.an.getByteFrequencyData(A.data);
    let sum = 0;
    for (let i = 0; i < A.data.length; i++) sum += A.data[i];
    level = sum / (A.data.length * 255);
  }
  st.level += (Math.min(1, level * 3) - st.level) * Math.min(1, dt * 4);
  const music = st.level;

  // Stars falling in towards the logo; they fade back as the music comes up.
  const starA = 1 - music * 0.7;
  if (starA > 0.02) {
    for (const s of st.stars) {
      s.u += dt * 0.05 * s.sp * (0.4 + s.u * 1.6);       // speeds up as it nears the logo
      if (s.u >= 1) { s.u = 0; s.v = Math.random(); s.side = Math.random() < 0.5 ? -1 : 1; }
      const x = cx + s.side * (inner + side * (1 - s.u));
      const y = cy + (s.v - 0.5) * H * 0.95 * (1 - s.u * 0.75);
      const fade = Math.min(1, s.u * 6) * Math.min(1, (1 - s.u) * 5);
      const tw = 0.6 + 0.4 * Math.sin(t * 2.2 + s.tw);
      g.globalAlpha = starA * fade * tw;
      g.fillStyle = s.u > 0.7 ? '#FFC27A' : '#FFF4E0';
      const r = (0.6 + s.u * 1.4) * (H / 248);
      g.fillRect(x - r, y - r * 0.5, r * 2 * (1 + s.u * 3), r);   // streaks stretch as they fall in
    }
    g.globalAlpha = 1;
  }

  // The bars, mirrored out from the logo.
  const unit = H / 248;
  const n = Math.max(16, Math.min(64, Math.floor(side / (9 * unit))));
  if (!st.bars || st.bars.length !== n) st.bars = new Float32Array(n);
  const pitch = side / n;
  const bw = Math.max(2, pitch * 0.62);
  const bins = A?.data?.length || 0;
  if (!st.grad || st.gradH !== H) {
    const gr = g.createLinearGradient(0, cy - H * 0.46, 0, cy + H * 0.46);
    gr.addColorStop(0, '#C0281A');
    gr.addColorStop(0.25, '#FF7A1A');
    gr.addColorStop(0.45, '#FFD27A');
    gr.addColorStop(0.5, '#FFF6DE');
    gr.addColorStop(0.55, '#FFD27A');
    gr.addColorStop(0.75, '#FF7A1A');
    gr.addColorStop(1, '#C0281A');
    st.grad = gr; st.gradH = H;
  }
  for (let i = 0; i < n; i++) {
    let v = 0;
    if (bins) {
      // Log spread: bass by the logo, highs at the edges.
      const lo = 2, hi = Math.floor(bins * 0.45);
      const b = Math.floor(lo * Math.pow(hi / lo, i / (n - 1)));
      v = Math.min(1, Math.pow(A.data[b] / 255, 1.5) * (1 + i / n * 0.8));   // lift the highs a little
    }
    const prev = st.bars[i];
    st.bars[i] = v > prev ? v : Math.max(v, prev - dt * 1.6);
    const h = st.bars[i] * H * 0.88 * (1 - i / n * 0.3);
    if (h < 1) continue;
    const fadeOut = 1 - (i / n) * 0.55;
    const d = inner + pitch * (i + 0.5);
    g.fillStyle = st.grad;
    for (const sgn of [-1, 1]) {
      const x = cx + sgn * d - bw / 2;
      g.globalAlpha = 0.18 * fadeOut * music;
      g.fillRect(x - bw * 0.6, cy - h / 2 - 3 * unit, bw * 2.2, h + 6 * unit);   // glow
      g.globalAlpha = (0.35 + 0.65 * music) * fadeOut;
      g.fillRect(x, cy - h / 2, bw, h);
    }
  }
  g.globalAlpha = 1;
}

/* ── skyline ──────────────────────────────────────────────────────────── */

// Landmarks as paths in a 0..1 box (x across, y up), drawn into w × h px.
const LANDMARKS = {
  capitol(g, x, base, w, h) {          // wings, drum, dome, lantern, the Goddess
    g.rect(x, base - h * 0.22, w, h * 0.22);
    g.rect(x + w * 0.38, base - h * 0.34, w * 0.24, h * 0.12);
    g.moveTo(x + w * 0.36, base - h * 0.34);
    g.quadraticCurveTo(x + w * 0.5, base - h * 0.78, x + w * 0.64, base - h * 0.34);
    g.rect(x + w * 0.48, base - h * 0.88, w * 0.04, h * 0.14);
    g.rect(x + w * 0.495, base - h, w * 0.01, h * 0.12);
  },
  utTower(g, x, base, w, h) {          // the shaft, the temple, the little dome
    g.rect(x + w * 0.3, base - h * 0.84, w * 0.4, h * 0.84);
    g.rect(x + w * 0.24, base - h * 0.9, w * 0.52, h * 0.06);
    g.rect(x + w * 0.34, base - h * 0.95, w * 0.32, h * 0.05);
    g.moveTo(x + w * 0.38, base - h * 0.95);
    g.quadraticCurveTo(x + w * 0.5, base - h * 1.04, x + w * 0.62, base - h * 0.95);
    g.rect(x, base - h * 0.22, w, h * 0.22);
  },
  frost(g, x, base, w, h) {            // stepped crown up to the spire
    g.moveTo(x, base);
    g.lineTo(x, base - h * 0.72);
    g.lineTo(x + w * 0.12, base - h * 0.72);
    g.lineTo(x + w * 0.12, base - h * 0.8);
    g.lineTo(x + w * 0.24, base - h * 0.8);
    g.lineTo(x + w * 0.24, base - h * 0.87);
    g.lineTo(x + w * 0.46, base - h * 0.97);
    g.lineTo(x + w * 0.5, base - h);
    g.lineTo(x + w * 0.54, base - h * 0.97);
    g.lineTo(x + w * 0.76, base - h * 0.87);
    g.lineTo(x + w * 0.76, base - h * 0.8);
    g.lineTo(x + w * 0.88, base - h * 0.8);
    g.lineTo(x + w * 0.88, base - h * 0.72);
    g.lineTo(x + w, base - h * 0.72);
    g.lineTo(x + w, base);
    g.closePath();
  },
  independent(g, x, base, w, h) {      // the Jenga: stacked blocks, each one shifted
    const shifts = [0, 0.12, -0.06, 0.1, -0.1, 0.04];
    const step = h / shifts.length;
    shifts.forEach((s, i) => g.rect(x + w * (0.12 + s), base - step * (i + 1), w * 0.76, step + 0.5));
  },
  austonian(g, x, base, w, h) {        // tall and slim, rounded crown
    g.moveTo(x, base);
    g.lineTo(x, base - h * 0.9);
    g.quadraticCurveTo(x + w * 0.5, base - h * 1.04, x + w, base - h * 0.9);
    g.lineTo(x + w, base);
    g.closePath();
  },
  fins(g, x, base, w, h) {             // 360 Condos: a stack of fins
    g.rect(x + w * 0.15, base - h * 0.92, w * 0.7, h * 0.92);
    for (let i = 0; i < 9; i++) {
      const y = base - h * (0.12 + i * 0.09);
      g.rect(x + (i % 2 ? 0 : w * 0.05), y, w * (i % 2 ? 0.95 : 0.9), h * 0.025);
    }
  },
};

function buildSkyline(W, H, dpr) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(W * dpr));
  cv.height = Math.max(1, Math.round(H * dpr));
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const cx = W / 2;
  const base = H * 0.8;
  const unit = H / 248;
  const rand = seeded(4242);

  // Dusk behind the city, hottest behind the logo.
  const sky = g.createRadialGradient(cx, base, 0, cx, base, W * 0.62);
  sky.addColorStop(0, 'rgba(255, 150, 50, .62)');
  sky.addColorStop(0.35, 'rgba(230, 90, 30, .34)');
  sky.addColorStop(0.7, 'rgba(140, 30, 30, .14)');
  sky.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, base);
  const fadeUp = g.createLinearGradient(0, 0, 0, base);
  fadeUp.addColorStop(0, 'rgba(0,0,0,1)');
  fadeUp.addColorStop(0.55, 'rgba(0,0,0,.35)');
  fadeUp.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fadeUp;
  g.fillRect(0, 0, W, base);

  // Buildings, out from the middle to both edges: tall downtown by the logo,
  // lower towards the edges. Landmarks dropped in at set distances.
  const shapes = [];
  const marks = { '-1': [[0.2, 'utTower', 30, 0.7], [0.55, 'capitol', 74, 0.42]], 1: [[0.1, 'frost', 30, 0.8], [0.3, 'independent', 30, 0.74], [0.42, 'austonian', 20, 0.86], [0.62, 'fins', 26, 0.6]] };
  for (const sgn of [-1, 1]) {
    const todo = [...marks[sgn]];
    let d = H * LOGO_ASPECT * 0.3;      // start tucked behind the logo
    while (d < cx + 10) {
      const f = d / cx;                  // 0 by the logo, 1 at the edge
      const next = todo[0];
      if (next && f >= next[0]) {
        todo.shift();
        const w = next[2] * unit;
        const h = next[3] * base * (1 - f * 0.25);
        shapes.push({ kind: next[1], x: sgn > 0 ? cx + d : cx - d - w, w, h, f });
        d += w + 2 * unit;
        continue;
      }
      const w = (12 + rand() * 26) * unit;
      const tall = Math.pow(1 - f, 1.6) * 0.62 + 0.1;
      const h = base * tall * (0.55 + rand() * 0.6);
      shapes.push({ kind: 'box', x: sgn > 0 ? cx + d : cx - d - w, w, h, f, top: rand() });
      d += w + rand() * 3 * unit;
    }
  }
  // Back row first: shorter boxes behind, then the rest.
  shapes.sort((a, b) => (a.kind === 'box' ? a.h : base) - (b.kind === 'box' ? b.h : base));

  const lit = [];
  for (const s of shapes) {
    g.beginPath();
    if (s.kind === 'box') {
      g.rect(s.x, base - s.h, s.w, s.h);
      if (s.top > 0.75) g.rect(s.x + s.w * 0.4, base - s.h - 10 * unit, 1.2 * unit, 10 * unit);   // antenna
      else if (s.top > 0.55) g.rect(s.x + s.w * 0.15, base - s.h - 4 * unit, s.w * 0.7, 4 * unit);  // penthouse
    } else {
      LANDMARKS[s.kind](g, s.x, base, s.w, s.h);
    }
    g.fillStyle = '#070302';
    g.fill();
    // Rim light on the side that faces the glow.
    g.save();
    g.clip();
    const rim = g.createLinearGradient(s.x, 0, s.x + s.w, 0);
    const toward = s.x + s.w / 2 < cx;
    const hot = `rgba(255, 140, 60, ${0.38 * (1 - s.f * 0.6)})`;
    rim.addColorStop(toward ? 0.8 : 0, toward ? 'rgba(0,0,0,0)' : hot);
    rim.addColorStop(toward ? 1 : 0.2, toward ? hot : 'rgba(0,0,0,0)');
    g.fillStyle = rim;
    g.fillRect(s.x, 0, s.w, base);
    g.restore();
    // Windows.
    if (s.kind === 'box' || s.kind === 'austonian' || s.kind === 'frost') {
      const ws = 2 * unit, gap = 5 * unit;
      for (let y = base - s.h + 6 * unit; y < base - 4 * unit; y += gap) {
        for (let x = s.x + 3 * unit; x < s.x + s.w - 3 * unit; x += gap * 0.9) {
          const r = rand();
          if (r < 0.16) {
            g.fillStyle = r < 0.05 ? 'rgba(255, 236, 190, .85)' : 'rgba(255, 190, 110, .55)';
            g.fillRect(x, y, ws, ws * 1.2);
          } else if (r < 0.2) lit.push([x, y, ws, rand() * 6.28]);    // these blink on and off
        }
      }
    }
  }

  // Lady Bird Lake: the glow and the skyline mirrored, darker.
  const lake = g.createLinearGradient(0, base, 0, H);
  lake.addColorStop(0, 'rgba(255, 130, 50, .22)');
  lake.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = lake;
  g.fillRect(0, base, W, H - base);
  g.save();
  g.globalAlpha = 0.28;
  g.translate(0, base * 2);
  g.scale(1, -1);
  g.drawImage(cv, 0, 0, cv.width, base * dpr, 0, 0, W, base);
  g.restore();

  const stars = Array.from({ length: Math.round(W / 9) }, () => [rand() * W, rand() * base * 0.55, rand() * 6.28, 0.5 + rand()]);
  return { cv, lit, stars, base };
}

function drawSkyline(g, st, W, H, dt, t) {
  const S = st.skyline;
  g.clearRect(0, 0, W, H);
  if (!S) return;
  g.drawImage(S.cv, 0, 0, W, H);
  const unit = H / 248;

  for (const [x, y, ph, sz] of S.stars) {
    g.globalAlpha = 0.25 + 0.55 * Math.max(0, Math.sin(t * 1.3 + ph));
    g.fillStyle = '#FFF2DC';
    g.fillRect(x, y, sz * unit, sz * unit);
  }
  for (const [x, y, ws, ph] of S.lit) {
    const on = Math.sin(t * 0.35 + ph * 3) > 0.2;
    if (!on) continue;
    g.globalAlpha = 0.8;
    g.fillStyle = '#FFE7B0';
    g.fillRect(x, y, ws, ws * 1.2);
  }

  // The lake shimmers.
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(255, 170, 90, .16)';
  for (let i = 0; i < 14; i++) {
    const y = S.base + 4 * unit + i * ((H - S.base) / 14);
    const x = ((i * 137 + t * (12 + i * 3) * unit) % (W + 200)) - 100;
    g.fillRect(x, y, (40 + (i * 53) % 70) * unit, 1);
    g.fillRect(W - x - 60 * unit, y + 2, (30 + (i * 31) % 60) * unit, 1);
  }

  // The bats: every so often a flock comes up off the lake and out to the edge.
  st.batClock = (st.batClock || 0) + dt;
  if (!st.bats.length && st.batClock > 9) {
    st.batClock = 0;
    const sgn = Math.random() < 0.5 ? -1 : 1;
    const n = 14 + Math.floor(Math.random() * 14);
    st.bats = Array.from({ length: n }, (_, i) => ({
      x: W / 2 + sgn * (H * LOGO_ASPECT * 0.5 + Math.random() * 80 * unit),
      y: S.base + Math.random() * 10 * unit,
      vx: sgn * (40 + Math.random() * 40) * unit,
      vy: -(10 + Math.random() * 18) * unit,
      ph: Math.random() * 6.28, delay: i * 0.12 + Math.random() * 0.3,
    }));
  }
  g.strokeStyle = '#0d0603';
  g.lineWidth = 1.3 * unit;
  for (const b of st.bats) {
    if ((b.delay -= dt) > 0) continue;
    b.x += b.vx * dt; b.y += b.vy * dt; b.vy *= 0.995;
    const s = 3.2 * unit, f = Math.sin(t * 18 + b.ph);
    g.beginPath();
    g.moveTo(b.x - s, b.y - s * f * 0.8);
    g.quadraticCurveTo(b.x - s * 0.4, b.y - s * 0.2, b.x, b.y);
    g.quadraticCurveTo(b.x + s * 0.4, b.y - s * 0.2, b.x + s, b.y - s * f * 0.8);
    g.stroke();
  }
  st.bats = st.bats.filter((b) => b.x > -20 && b.x < W + 20 && b.y > -20);
  g.globalAlpha = 1;
}

/* ── component ────────────────────────────────────────────────────────── */

export default function BrandBanner() {
  const store = useLyricStore();
  const [mode, setMode] = useState(savedMode);
  const [autoIdx, setAutoIdx] = useState(0);
  const [nowPlaying, setNowPlaying] = useState(() => (typeof window !== 'undefined' && window.__lyricistNowPlaying) || { name: '', playing: false });
  const rootRef = useRef(null);
  const barsRef = useRef(null);
  const skyRef = useRef(null);
  const discRef = useRef(null);
  const sceneRef = useRef('bars');
  const shownAt = useRef({});

  const scene = mode === 'auto' ? ROTATION[autoIdx % ROTATION.length] : mode;
  sceneRef.current = scene;
  shownAt.current[scene] = Infinity;

  const cycle = () => {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    setMode(next);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* not remembered, still switches */ }
  };

  // Auto: next scene every twenty seconds.
  useEffect(() => {
    if (mode !== 'auto') return undefined;
    const id = setInterval(() => setAutoIdx((i) => i + 1), ROTATE_MS);
    return () => clearInterval(id);
  }, [mode]);

  // A scene that's just been left keeps drawing while it fades out.
  const prevScene = useRef(scene);
  useEffect(() => {
    if (prevScene.current !== scene) shownAt.current[prevScene.current] = performance.now();
    prevScene.current = scene;
  }, [scene]);

  // What the player has on, for the Song info side.
  useEffect(() => {
    const on = (e) => setNowPlaying(e.detail || { name: '', playing: false });
    window.addEventListener('lyricist:now-playing', on);
    return () => window.removeEventListener('lyricist:now-playing', on);
  }, []);

  // The disc only plays while it's on (or fading out).
  useEffect(() => {
    const v = discRef.current;
    if (!v) return undefined;
    if (scene === 'disc' && !REDUCED_MOTION) { v.play().catch(() => {}); return undefined; }
    const id = setTimeout(() => v.pause(), FADE_MS + 100);
    return () => clearTimeout(id);
  }, [scene]);

  // Canvas scenes: size them to the banner and run one frame loop for both.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const st = { level: 0, bars: null, bats: [], stars: makeStars(170, seeded(7)), analyser: null, skyline: null, W: 0, H: 0, dpr: 1 };
    const resize = () => {
      const W = root.clientWidth, H = root.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (!W || !H || (W === st.W && H === st.H && dpr === st.dpr)) return;
      Object.assign(st, { W, H, dpr, grad: null, skyline: null });
      for (const c of [barsRef.current, skyRef.current]) {
        if (!c) continue;
        c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
        c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(root);
    resize();

    let raf = 0, last = performance.now();
    const live = (name, now) => sceneRef.current === name || now - (shownAt.current[name] || 0) < FADE_MS + 100;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!st.W || !st.H || document.hidden) return;
      const t = REDUCED_MOTION ? 0 : now / 1000;
      if (live('bars', now) && barsRef.current) {
        if (!st.analyser) {
          try {
            const ctx = getAudioContext();
            const an = ctx.createAnalyser();
            an.fftSize = 512;
            an.smoothingTimeConstant = 0.78;
            getMasterBus().connect(an);
            st.analyser = { an, data: new Uint8Array(an.frequencyBinCount) };
          } catch { st.analyser = { an: null }; }
        }
        drawBars(barsRef.current.getContext('2d'), st, st.W, st.H, REDUCED_MOTION ? 0 : dt, t);
      }
      if (live('skyline', now) && skyRef.current) {
        if (!st.skyline) st.skyline = buildSkyline(st.W, st.H, st.dpr);
        drawSkyline(skyRef.current.getContext('2d'), st, st.W, st.H, REDUCED_MOTION ? 0 : dt, t);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      try { st.analyser?.an && getMasterBus().disconnect(st.analyser.an); } catch { /* already gone */ }
    };
  }, []);

  const genres = store.genreList?.length ? store.genreList : (store.genre ? [store.genre] : []);
  const moods = store.moodList?.length ? store.moodList : (store.mood ? [store.mood] : []);
  const topic = (store.topic || '').trim();

  return (
    <div className="brand-banner" ref={rootRef} data-scene={mode === 'off' ? 'off' : scene}>
      <canvas ref={barsRef} className="bb-layer" data-on={scene === 'bars'} aria-hidden="true" />
      <video
        ref={discRef}
        className="bb-layer bb-disc"
        data-on={scene === 'disc'}
        src={bhLoop}
        loop muted playsInline disablePictureInPicture preload="auto"
        aria-hidden="true"
      />
      <canvas ref={skyRef} className="bb-layer" data-on={scene === 'skyline'} aria-hidden="true" />
      <div className="bb-layer bb-info" data-on={scene === 'info'}>
        <div className="bb-info-side bb-info-left">
          <div className="bb-info-lbl">
            <span className={nowPlaying.playing ? 'bb-eq on' : 'bb-eq'} aria-hidden="true"><i /><i /><i /></span>
            Now playing
          </div>
          <div className="bb-info-big" title={nowPlaying.name || undefined}>{nowPlaying.name || 'Nothing yet'}</div>
          <div className="bb-info-small">
            {nowPlaying.name ? (nowPlaying.playing ? 'Playing' : 'Paused') : 'Load a track in the player below'}
          </div>
        </div>
        <div className="bb-info-side bb-info-right">
          <div className="bb-info-lbl">The song</div>
          <div className="bb-info-big">{genres.length ? genres.join(' + ') : 'No genre picked yet'}</div>
          <div className="bb-info-small">
            {moods.length ? moods.join(' · ') : 'No mood picked yet'}
            {topic && <span className="bb-info-topic">“{topic.length > 60 ? `${topic.slice(0, 58)}…` : topic}”</span>}
          </div>
        </div>
      </div>
      <img className="bb-logo" src={brandLogo} alt="Lyricist Pro, Funk Audio Flow OpSec, Austin TX" draggable={false} />
      <button
        type="button"
        className="bb-mode"
        onClick={cycle}
        data-help="Changes what runs either side of the logo: Auto moves through them all, or pick Bars (they move to the music), Disc, Skyline, Song info, or Off."
      >
        {LABEL[mode]}{mode === 'auto' ? ` · ${LABEL[scene]}` : ''}
      </button>
    </div>
  );
}
