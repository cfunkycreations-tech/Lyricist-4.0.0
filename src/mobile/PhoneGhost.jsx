import React, { useCallback, useEffect, useRef, useState } from 'react';
import { phoneGhostFor, phoneGhostKey } from './phoneGhostScripts.js';
import { captureAll, restoreAll } from '../services/demoSafety.js';
import { playBed, bedFor, primeBed, dropPrimedBed } from '../services/ghostBed.js';
import { withFades } from '../services/clipFade.js';
import ghostArt from '../assets/ghost-logo.png';
import './PhoneGhost.css';

/**
 * THE GHOST, ON THE PHONE. Phone build only; the desktop keeps GhostDemo.jsx.
 *
 * Chris, 2026-10-22: no speech bubbles. The Ghost flies to the control he is
 * talking about, points at it with his mic stand, and the words on it glow
 * while he talks. He sounds like a person, not a manual: the lines are in
 * phoneGhostScripts.js, the voice in src/assets/ghost-vo-phone/.
 *
 * Every line is voiced in the Voice Lab. A line with no clip yet is silent
 * (he still points and glows); there is deliberately no stand-in voice.
 */
const CLIPS = import.meta.glob('../assets/ghost-vo-phone/*.mp3', {
  eager: true, query: '?url', import: 'default',
});
const clipFor = (id) => CLIPS[`../assets/ghost-vo-phone/${id}.mp3`] || null;

/**
 * Has this tool's walkthrough been voiced yet? The phone's Ghost button only
 * shows for tools that have, so nobody gets a silent Ghost while the lines are
 * still being recorded in the Voice Lab.
 */
export function phoneGhostReady(tabId) {
  return Object.keys(CLIPS).some((k) => k.startsWith(`../assets/ghost-vo-phone/${phoneGhostKey(tabId)}-`));
}

const SIZE = 96;                  // the ghost, in CSS px
const TIP = { x: 0.655, y: 0.973 }; // his mic stand's foot, as a share of the art
const MUSIC_KEY = 'lyricistGhostMusic';
const BED_LEVEL = 0.3;
const BED_UNDER_VOICE = 0.12;

/**
 * iPHONE ONLY PLAYS SOUND THAT STARTS INSIDE A TAP, and the Ghost starts talking
 * after he has flown to his first control. The Ghost button calls this inside
 * its own tap: it plays a blip of silence through the voice's <audio> element
 * (which lets that element speak later), and wakes the music's audio context.
 */
const SILENCE = 'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
let primedVoice = null;
export function primePhoneGhost() {
  try {
    const a = withFades(new Audio());
    a.src = SILENCE;
    const p = a.play();
    if (p?.catch) p.catch(() => {});
    primedVoice = a;
  } catch { /* no audio at all: he still points and glows */ }
  if (musicWanted()) primeBed();
}

function musicWanted() {
  try { return localStorage.getItem(MUSIC_KEY) !== 'off'; } catch { return true; }
}

/** The first match that is actually on screen (every opened tab stays mounted, hidden). */
function shown(sel) {
  return [...document.querySelectorAll(sel)].find((n) => {
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }) || null;
}

/** The label that names a text box, so "Artist name" glows with its box. */
function labelFor(el) {
  const field = el.matches('input, textarea, select') ? el : el.querySelector('input, textarea, select');
  if (!field) return null;
  if (field.labels && field.labels[0]) return field.labels[0];
  let n = field;
  for (let up = 0; up < 3 && n && n !== el.parentElement; up += 1, n = n.parentElement) {
    const p = n.previousElementSibling;
    const t = p && p.textContent.trim();
    if (t && t.length <= 48 && !p.querySelector('input, textarea, select, button')) return p;
  }
  return null;
}

function setReactValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc?.set) desc.set.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** A real tap: the pointer events a touch makes, then the click React listens for. */
function tap(el) {
  const r = el.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, view: window };
  for (const type of ['pointerdown', 'pointerup']) {
    try { el.dispatchEvent(new PointerEvent(type, { ...opts, pointerId: 1, pointerType: 'touch', isPrimary: true })); } catch { /* old WebKit */ }
  }
  el.click();
}

/** The top of the free screen: just under the phone's bar (which sits below the island). */
function topLimit() {
  const bar = document.querySelector('.mob-bar');
  return (bar ? bar.getBoundingClientRect().bottom : 0) + 6;
}

/**
 * Where the ghost hangs for a pointing spot (x, y). Normally above it, so the
 * foot of his mic stand rests on the spot and his body stays OFF the glowing
 * words (the spot is the top edge of the lit area). `below` hangs him under
 * the lit area instead, for when there is no room above it.
 */
function ghostSpot(x, y, below) {
  const flip = x - TIP.x * SIZE < 6;                          // no room on the left: mirror him
  const left = flip ? x - (1 - TIP.x) * SIZE : x - TIP.x * SIZE;
  const top = below ? y + 10 : y - TIP.y * SIZE;
  return { left, top, flip };
}

export default function PhoneGhost({ tabId, onClose }) {
  const demo = phoneGhostFor(tabId);
  const clipKey = phoneGhostKey(tabId);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [point, setPoint] = useState({ x: window.innerWidth * 0.5, y: window.innerHeight * 0.42 });
  const [pointing, setPointing] = useState(false);   // the glowing dot at his stand's foot
  const [below, setBelow] = useState(false);         // hanging under the lit area
  const [tapping, setTapping] = useState(false);
  const [spot, setSpot] = useState(null);             // the lit area around what he is on
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const [musicOn, setMusicOn] = useState(musicWanted);

  const runIdRef = useRef(0);
  const deadRef = useRef(false);
  const pausedRef = useRef(false);
  const pointRef = useRef(point);
  const audioRef = useRef(null);
  const bedRef = useRef(null);
  const snapshotRef = useRef(null);
  const glowRef = useRef([]);
  const tabAtStart = useRef(tabId);

  const isDead = (id) => deadRef.current || runIdRef.current !== id;

  // ---- time that stops when you press Pause -------------------------------
  const wait = (ms, id) => new Promise((resolve) => {
    let left = Math.max(0, ms || 0);
    let last = Date.now();
    const tick = () => {
      if (isDead(id)) return resolve();
      const now = Date.now();
      if (!pausedRef.current) left -= now - last;
      last = now;
      if (left <= 0) resolve(); else setTimeout(tick, 40);
    };
    tick();
  });

  // ---- glow -----------------------------------------------------------------
  // The control gets the ring and the glow; its label and extras glow only.
  const unglow = () => {
    glowRef.current.forEach((n) => n.classList.remove('pg-glow', 'pg-glow-text'));
    glowRef.current = [];
  };
  const glow = (main, others) => {
    unglow();
    main.classList.add('pg-glow');
    glowRef.current.push(main);
    others.filter(Boolean).forEach((n) => { n.classList.add('pg-glow-text'); glowRef.current.push(n); });
  };

  // ---- voice ----------------------------------------------------------------
  const stopVoice = () => {
    const a = audioRef.current;
    if (a) { try { a.pause(); } catch { /* */ } }
  };

  /**
   * Say a line and resolve once he has finished it (or the run stopped).
   *
   * A run that has been cancelled must never start talking. Dev mode mounts
   * every component twice on purpose; the first run used to reach this point
   * after it was cancelled, start the opening line, and the second run then
   * restarted the same clip: "Welcome... Welcome to Black Hole Studios" on
   * every tool (Chris, 2026-10-23). Same for Stop pressed mid-flight.
   */
  const say = async (clipId, text, id) => {
    if (isDead(id)) return;
    const url = clipFor(clipId);
    if (url) {
      let a = audioRef.current;
      if (!a) {
        a = primedVoice || withFades(new Audio());
        primedVoice = null;
        a.addEventListener('play', () => bedRef.current?.level(BED_UNDER_VOICE, 0.25));
        a.addEventListener('ended', () => bedRef.current?.level(BED_LEVEL, 0.9));
        audioRef.current = a;
      }
      a.src = url;
      let failed = false;
      a.onerror = () => { failed = true; };
      try { await a.play(); } catch { failed = true; }
      const t0 = Date.now();
      while (!isDead(id) && !failed && !a.ended && Date.now() - t0 < 45000) {
        if (pausedRef.current && !a.paused) a.pause();
        if (!pausedRef.current && a.paused && !a.ended) { try { await a.play(); } catch { failed = true; } }
        await wait(60, id);
      }
      if (!failed) return;
    }
    // No clip yet: NO stand-in voice (Chris, 2026-10-22: never the phone's
    // robot voice; every line is voiced in the Voice Lab). He stays on the
    // control, glowing, for as long as the line takes to read, then moves on.
    await wait(Math.min(14000, 1400 + text.split(/\s+/).length * 400), id);
  };

  // ---- flight ---------------------------------------------------------------
  const flyTo = (x, y, id, ms = 750) => new Promise((resolve) => {
    const from = { ...pointRef.current };
    const mid = { x: (from.x + x) / 2 + (x > from.x ? -1 : 1) * 30, y: Math.min(from.y, y) - 40 };
    const t0 = performance.now();
    let pausedFor = 0;
    let pauseAt = 0;
    const step = (now) => {
      if (isDead(id)) return resolve();
      if (pausedRef.current) { if (!pauseAt) pauseAt = now; requestAnimationFrame(step); return; }
      if (pauseAt) { pausedFor += now - pauseAt; pauseAt = 0; }
      const t = Math.min(1, (now - t0 - pausedFor) / ms);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const u = 1 - e;
      const p = { x: u * u * from.x + 2 * u * e * mid.x + e * e * x, y: u * u * from.y + 2 * u * e * mid.y + e * e * y };
      pointRef.current = p;
      setPoint(p);
      if (t < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });

  /**
   * Where he points: the top edge of the lit area, toward its left, so he
   * hangs above it. No room above (a tall control near the top): the bottom
   * edge, hanging under it. Kept clear of the phone bar and the controls.
   */
  const aimAt = (box) => {
    const bottom = window.innerHeight - 96;             // clear of Pause / Music / Stop
    const x = Math.min(window.innerWidth - 14, Math.max(14, box.left + Math.min((box.right - box.left) / 2, 110)));
    const roomAbove = box.top - TIP.y * SIZE >= topLimit();
    if (roomAbove) return { x, y: box.top + 4, below: false };
    return { x, y: Math.min(bottom - SIZE, box.bottom - 4), below: true };
  };

  /**
   * Wait until the page has STOPPED scrolling to this control. A smooth scroll
   * takes longer than any fixed pause on a long page, and a highlight measured
   * mid-scroll lands where the control no longer is, then jumps: that read as
   * flicker (Chris, 2026-10-23).
   */
  const settled = async (el, id) => {
    let last = null;
    let still = 0;
    for (let n = 0; n < 40 && still < 3; n += 1) {
      await wait(60, id);
      if (isDead(id)) return;
      const top = el.getBoundingClientRect().top;
      still = last !== null && Math.abs(top - last) < 0.5 ? still + 1 : 0;
      last = top;
    }
  };

  const finish = useCallback((fadeMs = 450) => {
    deadRef.current = true;
    stopVoice();
    unglow();
    setSpot(null);
    setPointing(false);
    bedRef.current?.stop(0.8);
    bedRef.current = null;
    if (snapshotRef.current) { const s = snapshotRef.current; snapshotRef.current = null; restoreAll(s); }
    setLeaving(true);
    setTimeout(() => onCloseRef.current?.(), fadeMs);
  }, []);

  const run = async (id) => {
    if (!demo) { finish(0); return; }
    // One tick before touching anything: in dev, React mounts, tears down and
    // remounts in the same commit, and the first run must be dead by now. This
    // is also what keeps the primed audio for the run that survives.
    await Promise.resolve();
    if (isDead(id)) return;
    snapshotRef.current = captureAll();
    if (musicWanted()) bedRef.current = playBed(bedFor(tabId), { level: BED_LEVEL });

    for (let i = 0; i < demo.steps.length; i += 1) {
      if (isDead(id)) return;
      const s = demo.steps[i];
      let el = s.target ? shown(s.target) : null;
      if (s.target && !el) { await wait(350, id); el = shown(s.target); }

      // No control to point at: a talking step, or an optional control that
      // only appears after a result. He says the step's one line from the
      // middle of the screen (optional lines are worded to be true either way).
      if (s.target && !el && !s.optional) continue;
      if (!el) {
        unglow(); setSpot(null); setPointing(false); setBelow(false);
        await flyTo(window.innerWidth * 0.5, window.innerHeight * 0.45, id);
        if (isDead(id)) return;
        await say(`${clipKey}-${i}`, s.line, id);
        await wait(300, id);
        continue;
      }

      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      await settled(el, id);
      if (isDead(id)) return;             // never light up anything for a cancelled run
      const label = labelFor(el);
      const extra = (s.glow || []).map(shown);
      glow(el, [label, ...extra]);
      const rects = [el, label, ...extra].filter(Boolean).map((n) => n.getBoundingClientRect());
      const box = {
        left: Math.min(...rects.map((q) => q.left)) - 8,
        top: Math.min(...rects.map((q) => q.top)) - 8,
        right: Math.max(...rects.map((q) => q.right)) + 8,
        bottom: Math.max(...rects.map((q) => q.bottom)) + 8,
      };
      setSpot(box);
      const aim = aimAt(box);
      setPointing(false);
      setBelow(aim.below);
      await flyTo(aim.x, aim.y, id);
      if (isDead(id)) return;
      setPointing(true);
      await say(`${clipKey}-${i}`, s.line, id);
      if (isDead(id)) return;

      if (s.action === 'type' && s.typeText) {
        const field = el.matches('input, textarea') ? el : el.querySelector('input, textarea');
        if (field) {
          // No focus(): on a phone that throws the keyboard up over half the screen.
          let built = '';
          for (const ch of s.typeText) {
            if (isDead(id)) return;
            built += ch;
            setReactValue(field, built);
            await wait(45 + Math.random() * 55, id);
          }
        }
      } else if (s.action === 'click') {
        setTapping(true);
        await wait(140, id);
        if (isDead(id)) return;
        tap(el);
        await wait(220, id);
        setTapping(false);
      }
      await wait(s.action ? 700 : 350, id);
    }
    if (!isDead(id)) finish();
  };

  // Mount-only: re-renders (and his own typing) must never restart the tour.
  useEffect(() => {
    const id = ++runIdRef.current;
    deadRef.current = false;
    run(id);
    return () => {
      deadRef.current = true;
      stopVoice();
      unglow();
      bedRef.current?.stop(0.4);
      bedRef.current = null;
      dropPrimedBed();
      if (snapshotRef.current) { const s = snapshotRef.current; snapshotRef.current = null; restoreAll(s); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The app moved to another tool: everything he would point at is hidden now.
  useEffect(() => {
    if (tabId !== tabAtStart.current) finish(0);
  }, [tabId, finish]);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused) bedRef.current?.pause(); else bedRef.current?.resume();
  }, [paused]);

  const toggleMusic = () => {
    const next = !musicOn;
    setMusicOn(next);
    try { localStorage.setItem(MUSIC_KEY, next ? 'on' : 'off'); } catch { /* storage blocked */ }
    if (!next) { bedRef.current?.stop(0.6); bedRef.current = null; }
    else if (!bedRef.current && !deadRef.current) bedRef.current = playBed(bedFor(tabId), { level: BED_LEVEL });
  };

  const g = ghostSpot(point.x, point.y, below);

  return (
    <div className={`pg-root ${leaving ? 'is-leaving' : ''}`} aria-label={`The Ghost is showing you ${demo?.title || 'this tool'}`}>
      {spot && (
        <div className="pg-dim" aria-hidden="true">
          <i style={{ left: 0, top: 0, right: 0, height: Math.max(0, spot.top) }} />
          <i style={{ left: 0, top: spot.bottom, right: 0, bottom: 0 }} />
          <i style={{ left: 0, top: spot.top, width: Math.max(0, spot.left), height: spot.bottom - spot.top }} />
          <i style={{ left: spot.right, top: spot.top, right: 0, height: spot.bottom - spot.top }} />
        </div>
      )}

      {pointing && <span className={`pg-dot ${tapping ? 'is-tap' : ''}`} style={{ transform: `translate3d(${point.x}px, ${point.y}px, 0)` }} />}

      <div className={`pg-ghost ${g.flip ? 'is-flip' : ''}`} style={{ transform: `translate3d(${g.left}px, ${g.top}px, 0)`, width: SIZE, height: SIZE }}>
        <div className="pg-bob">
          <img src={ghostArt} alt="" draggable={false} />
        </div>
      </div>

      <div className="pg-controls">
        <button type="button" className="pg-btn" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Keep going' : 'Pause the Ghost'}>
          {paused ? 'Play' : 'Pause'}
        </button>
        <button type="button" className={`pg-btn ${musicOn ? 'is-on' : ''}`} onClick={toggleMusic} aria-pressed={musicOn}>
          Music
        </button>
        <button type="button" className="pg-btn pg-btn-stop" onClick={() => finish()} aria-label="Stop the Ghost">
          Stop
        </button>
      </div>
    </div>
  );
}
