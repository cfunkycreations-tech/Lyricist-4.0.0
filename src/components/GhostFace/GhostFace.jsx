import React, { useEffect, useRef } from 'react';
import { FACE } from '../../assets/ghost-face/layout.js';
import baseArt from '../../assets/ghost-face/base.webp';
import mouth1 from '../../assets/ghost-face/mouth1.webp';
import mouth2 from '../../assets/ghost-face/mouth2.webp';
import mouth3 from '../../assets/ghost-face/mouth3.webp';
import eyeL from '../../assets/ghost-face/eyeL.webp';
import eyeR from '../../assets/ghost-face/eyeR.webp';
import browL from '../../assets/ghost-face/browL.webp';
import browR from '../../assets/ghost-face/browR.webp';
import './GhostFace.css';

/**
 * THE GHOST, WITH A FACE THAT MOVES. (Chris, 2026-10-25: "actual moving eyes and mouth".)
 *
 * The art is layers (scripts/ghost-face/bake.py): the body with the eyes lifted
 * off, three mouths that sit over the grin, and the two eyes and brows as ink.
 *   - Mouth: follows the line he is speaking. The mouth's width at every moment of
 *     every clip was measured ahead of time (scripts/ghost-face/envelopes.py), so
 *     this reads the playing <audio>'s currentTime and looks it up. It never
 *     routes the audio through Web Audio, which on iPhone can silence it.
 *   - Eyes: blink every few seconds, glance around, and look at what he is
 *     pointing at. Brows lift on the loud syllables.
 * Nothing re-renders per frame: the loop writes straight to the layers' styles.
 *
 * Props
 *   speech  () => ({ id, t }) | null    which clip is playing and how far in (seconds)
 *   kind    'phone' | 'desktop'         which set of measured clips the ids belong to
 *   look    { x, y }                    where he is looking, -1..1 (y > 0 is down)
 */
const FPS = 25;
const loaders = {
  phone: () => import('../../assets/ghost-face/mouth-phone.json'),
  desktop: () => import('../../assets/ghost-face/mouth-desktop.json'),
};

const pct = (n) => `${(n * 100).toFixed(3)}%`;
const boxStyle = (b) => ({ left: pct(b[0]), top: pct(b[1]), width: pct(b[2]), height: pct(b[3]) });
const rand = (a, b) => a + Math.random() * (b - a);
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function GhostFace({ speech, kind = 'phone', look, className = '', style }) {
  const rootRef = useRef(null);
  const layers = useRef({});
  const speechRef = useRef(speech);
  speechRef.current = speech;
  const lookRef = useRef(look);
  lookRef.current = look;

  const put = (name) => (el) => { layers.current[name] = el; };

  useEffect(() => {
    let raf = 0;
    let dead = false;
    let data = null;
    loaders[kind]().then((m) => { if (!dead) data = m.default || m; }).catch(() => { /* no measured clips: he talks by rhythm instead */ });

    const calm = reduced();
    const s = {
      mouth: 0, mouthAt: 0, shown: -1,
      blinkAt: performance.now() + rand(1200, 3000), blinkStart: -1,
      glanceAt: performance.now() + rand(900, 2200), glance: { x: 0, y: 0 },
      eye: { x: 0, y: 0 }, brow: 0, width: 0, widthAt: 0,
      last: {},
    };
    const setStyle = (name, key, value) => {
      const el = layers.current[name];
      if (!el) return;
      const k = `${name}.${key}`;
      if (s.last[k] === value) return;
      s.last[k] = value;
      el.style[key] = value;
    };

    const frame = (now) => {
      if (dead) return;
      raf = requestAnimationFrame(frame);
      const root = rootRef.current;
      if (!root) return;
      if (now - s.widthAt > 400) { s.width = root.offsetWidth || 100; s.widthAt = now; }
      const W = s.width;

      // ---- mouth --------------------------------------------------------------
      let want = 0;
      const sp = speechRef.current?.();
      if (sp) {
        const row = data?.[sp.id];
        if (row) {
          const i = Math.floor(sp.t * FPS);
          const c = i >= 0 && i < row.length ? row.charCodeAt(i) - 48 : 0;
          want = c >= 0 && c <= 3 ? c : 0;
        } else {
          // a clip with no measurements yet: talk by rhythm, never freeze
          const wave = (Math.sin(now / 95) + Math.sin(now / 41) * 0.6 + 1.6) / 3.2;
          want = wave > 0.78 ? 3 : wave > 0.52 ? 2 : wave > 0.3 ? 1 : 0;
        }
      }
      if (want !== s.mouth && now - s.mouthAt > 55) { s.mouth = want; s.mouthAt = now; }
      if (s.mouth !== s.shown) {
        s.shown = s.mouth;
        for (let n = 1; n <= 3; n += 1) setStyle(`mouth${n}`, 'opacity', s.mouth === n ? '1' : '0');
      }

      // ---- eyes ---------------------------------------------------------------
      const lk = lookRef.current || { x: 0, y: 0 };
      if (!calm && now > s.glanceAt) {
        s.glance = Math.random() < 0.35 ? { x: 0, y: 0 } : { x: rand(-1, 1), y: rand(-0.5, 0.6) };
        s.glanceAt = now + rand(1100, 3200);
      }
      const tx = Math.max(-1, Math.min(1, (lk.x || 0) * 0.7 + s.glance.x * 0.55));
      const ty = Math.max(-1, Math.min(1, (lk.y || 0) * 0.7 + s.glance.y * 0.45));
      s.eye.x += (tx - s.eye.x) * 0.2;
      s.eye.y += (ty - s.eye.y) * 0.2;

      let lid = 1;                                     // 1 open, 0.08 shut
      if (!calm) {
        if (s.blinkStart < 0 && now > s.blinkAt) s.blinkStart = now;
        if (s.blinkStart >= 0) {
          const p = (now - s.blinkStart) / 150;
          if (p >= 1) {
            s.blinkStart = -1;
            s.blinkAt = now + (Math.random() < 0.2 ? 220 : rand(2400, 5600));   // now and then, twice
          } else {
            lid = 1 - Math.sin(Math.PI * p) * 0.92;
          }
        }
      }
      const want_brow = s.mouth === 3 ? -1 : s.mouth === 2 ? -0.4 : 0;
      s.brow += (want_brow - s.brow) * 0.25;

      const ex = s.eye.x * W * 0.022;
      const ey = s.eye.y * W * 0.016;
      const bx = s.eye.x * W * 0.008;
      const by = s.brow * W * 0.013 + s.eye.y * W * 0.006;
      const q = (v) => v.toFixed(2);
      setStyle('eyeL', 'transform', `translate(${q(ex)}px, ${q(ey)}px) scaleY(${q(lid)})`);
      setStyle('eyeR', 'transform', `translate(${q(ex * 0.8)}px, ${q(ey * 0.8)}px) scaleY(${q(Math.max(0.2, lid))})`);
      setStyle('browL', 'transform', `translate(${q(bx)}px, ${q(by)}px)`);
      setStyle('browR', 'transform', `translate(${q(bx)}px, ${q(by)}px)`);
    };
    raf = requestAnimationFrame(frame);
    return () => { dead = true; cancelAnimationFrame(raf); };
  }, [kind]);

  const L = (name, src, extra) => (
    <img
      key={name}
      ref={put(name)}
      className={`gf-layer gf-${name}`}
      src={src}
      alt=""
      draggable={false}
      decoding="async"
      style={{ ...boxStyle(FACE[name === 'mouth1' || name === 'mouth2' || name === 'mouth3' ? 'mouth' : name].box), ...extra }}
    />
  );

  return (
    <div ref={rootRef} className={`gf ${className}`} style={style} aria-hidden="true">
      <img className="gf-layer gf-base" src={baseArt} alt="" draggable={false} decoding="async" />
      {L('mouth1', mouth1, { opacity: 0 })}
      {L('mouth2', mouth2, { opacity: 0 })}
      {L('mouth3', mouth3, { opacity: 0 })}
      {L('eyeL', eyeL)}
      {L('eyeR', eyeR)}
      {L('browL', browL)}
      {L('browR', browR)}
    </div>
  );
}
