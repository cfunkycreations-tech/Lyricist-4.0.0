import React, { useEffect, useRef, useState } from 'react';
import brandLogo from '../../assets/brand-logo.webp';
import bhLoop from '../../assets/blackhole/bh_loop.webm';
import c4dOrbit from '../../assets/c4d/orbit.webm';
import c4dLyrics from '../../assets/c4d/lyrics.webm';
import c4dMolten from '../../assets/c4d/molten.webm';
import c4dOrbitMp4 from '../../assets/c4d/orbit.mp4';
import c4dLyricsMp4 from '../../assets/c4d/lyrics.mp4';
import c4dMoltenMp4 from '../../assets/c4d/molten.mp4';
import { useLyricStore } from '../../context/LyricStore.jsx';
import { getAudioContext, getMasterBus } from '../../services/audioEngine.js';
import { buildSkyline, drawSkyline } from './skyline.js';
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
 *   skyline — Austin across Lady Bird Lake, drawn like the logo's skyline
 *             (skyline.js): the real towers, the Capitol, UT, Frost,
 *             Pennybacker, moonlight towers, SRV and Willie, the bats, the
 *             grackles, a kayaker and an armadillo.
 *   info    — what's playing on the left, the song's genre, mood and topic
 *             on the right.
 * Three more are Cinema 4D renders, Chris's own (scripts/orbit_c4d.py,
 * lyrics_hole_c4d.py, molten_c4d.py):
 *   orbit   — the 18 tab names circling the Black Hole Studios title.
 *   lyrics  — lyric words pulled into the black hole.
 *   molten  — the molten gold pool.
 * Auto moves through all seven, twenty seconds each. The pill in the corner
 * steps through Auto, each scene and Off; the choice is remembered.
 */

const MODES = ['auto', 'bars', 'disc', 'orbit', 'lyrics', 'molten', 'skyline', 'info', 'off'];
const LABEL = { auto: 'Auto', bars: 'Bars', disc: 'Disc', orbit: 'Orbit', lyrics: 'Lyrics', molten: 'Molten', skyline: 'Skyline', info: 'Song info', off: 'Off' };
const ROTATION = ['orbit', 'bars', 'disc', 'lyrics', 'skyline', 'molten', 'info'];
// The scenes that are a video, and which clip each one plays.
// Each is [mp4, webm]: Safari wants the mp4, and the browser takes the first it can play.
const VIDEO_SRC = {
  disc: [null, bhLoop],
  orbit: [c4dOrbitMp4, c4dOrbit],
  lyrics: [c4dLyricsMp4, c4dLyrics],
  molten: [c4dMoltenMp4, c4dMolten],
};
const VIDEO_SCENES = Object.keys(VIDEO_SRC);
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

// Small seeded random so the stars start in the same places.
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

/* ── component ────────────────────────────────────────────────────────── */

export default function BrandBanner() {
  const store = useLyricStore();
  const [mode, setMode] = useState(savedMode);
  const [autoIdx, setAutoIdx] = useState(0);
  const [nowPlaying, setNowPlaying] = useState(() => (typeof window !== 'undefined' && window.__lyricistNowPlaying) || { name: '', playing: false });
  const rootRef = useRef(null);
  const barsRef = useRef(null);
  const skyRef = useRef(null);
  const videoRefs = useRef({});
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

  // A video scene only plays while it's on (or fading out); the rest sit paused.
  useEffect(() => {
    const timers = [];
    for (const name of VIDEO_SCENES) {
      const v = videoRefs.current[name];
      if (!v) continue;
      if (scene === name && (!REDUCED_MOTION || mode !== 'auto')) v.play().catch(() => {});
      else timers.push(setTimeout(() => v.pause(), FADE_MS + 100));
    }
    return () => timers.forEach(clearTimeout);
  }, [scene, mode]);

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
    let folded = false;
    const live = (name, now) => sceneRef.current === name || now - (shownAt.current[name] || 0) < FADE_MS + 100;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // Folded away (the Banner pad, or the Ghost on screen): draw nothing and
      // hold the video, then pick it back up when it opens again.
      const fold = root.clientHeight === 0;
      if (fold !== folded) {
        folded = fold;
        const v = videoRefs.current[sceneRef.current];
        if (v) { if (fold) v.pause(); else v.play().catch(() => {}); }
      }
      if (fold || !st.W || !st.H || document.hidden) return;
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
      {VIDEO_SCENES.map((name) => (
        <video
          key={name}
          ref={(el) => { videoRefs.current[name] = el; }}
          className={`bb-layer bb-video bb-${name}`}
          data-on={scene === name}
          loop muted playsInline disablePictureInPicture
          preload={name === 'disc' ? 'auto' : 'metadata'}
          aria-hidden="true"
        >
          {VIDEO_SRC[name][0] && <source src={VIDEO_SRC[name][0]} type="video/mp4" />}
          <source src={VIDEO_SRC[name][1]} type="video/webm" />
        </video>
      ))}
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
        data-help="Changes what runs either side of the logo: Auto moves through them all, or pick Bars (they move to the music), Disc, Orbit, Lyrics, Molten, Skyline, Song info, or Off."
      >
        {LABEL[mode]}{mode === 'auto' ? ` · ${LABEL[scene]}` : ''}
      </button>
    </div>
  );
}
