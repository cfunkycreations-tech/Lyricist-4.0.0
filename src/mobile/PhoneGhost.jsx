import React, { useCallback, useEffect, useRef, useState } from 'react';
import { phoneGhostFor, phoneGhostKey } from './phoneGhostScripts.js';
import { PROMO_LINES } from './promoLines.js';
import { captureAll, restoreAll } from '../services/demoSafety.js';
import { playBed, bedFor, primeBed, dropPrimedBed, PROMO_BEDS, ghostPlaylist } from '../services/ghostBed.js';
import { withFades } from '../services/clipFade.js';
import GhostRiderMascot, { MASCOT } from '../components/GhostRiderMascot/GhostRiderMascot.jsx';
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

const SIZE = 112;                 // the ghost, in CSS px (his face moves now, so it has to be big enough to see)
const TIP = { x: MASCOT.tail[0], y: MASCOT.tail[1] }; // the bottom of his robe, as a share of the art
const MUSIC_KEY = 'lyricistGhostMusic';
// One steady level, low enough to sit under his voice and still be heard. It used
// to jump up between lines and duck for each one, which pumped (Chris, 2026-10-30).
const BED_LEVEL = 0.9;
const BED_UNDER_VOICE = BED_LEVEL;

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

/** The thing that actually scrolls when `el` moves: a scrolling box, or the page. */
function scrollParent(el) {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 4) return n;
  }
  return document.scrollingElement || document.documentElement;
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
function ghostSpot(x, y, below, flip) {
  const W = window.innerWidth;
  const raw = flip ? x - (1 - TIP.x) * SIZE : x - TIP.x * SIZE;
  const left = Math.max(2, Math.min(W - SIZE - 2, raw));
  const top = below ? y + 10 : y - TIP.y * SIZE;
  return { left, top, flip };
}

/**
 * `promo` (promoScripts.js) swaps the walkthrough for a promo run: one script
 * across several tools that presses the real buttons and waits for the real
 * results. It keeps what it made (no snapshot put back), survives the tool
 * changing under it, and stops when the Ghost himself is tapped.
 */
/**
 * A walkthrough's steps in the order he runs them, each with its clip index.
 * `live` (a writing key is set) adds the live steps around the ones they belong
 * to; they all keep that step's index, so the `${tab}-${i}` clips never shift.
 */
function stepPlan(demo, live) {
  const plan = [];
  (demo?.steps || []).forEach((s, i) => {
    if (live && s.liveSkip) return;
    const add = (list) => (list || []).forEach((x) => plan.push([x, i]));
    add(s.pre);
    if (live) add(s.livePre);
    let main = s;
    if (live && s.liveAction) main = { ...main, action: s.liveAction };
    if (live && s.liveRead) main = { ...main, read: s.liveRead };
    plan.push([main, i]);
    if (live) add(s.livePost);
    add(s.post);
  });
  return plan;
}

// Chris's own songs under every phone walkthrough and promo run (2026-10-25:
// "It's got the old music"). The old beds only if his are missing.
const ghostMusic = (tabId) => (PROMO_BEDS.length ? ghostPlaylist() : bedFor(tabId));

/**
 * Start a clip, or give up. iPhone can leave play() pending for good when a
 * clip stalls, and the Ghost then sat in the middle of The Matrix forever
 * (Chris, 2026-10-25). True once it plays.
 */
const startClip = (a) => Promise.race([
  a.play().then(() => true, () => false),
  new Promise((resolve) => setTimeout(() => resolve(false), 4000)),
]);

export default function PhoneGhost({ tabId, onClose, promo = null, onRequestTab, live = false }) {
  const demo = promo || phoneGhostFor(tabId);
  const clipKey = phoneGhostKey(tabId);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const requestTabRef = useRef(onRequestTab);
  requestTabRef.current = onRequestTab;
  // A promo line is recorded once and shared between runs, so it goes by its id.
  // A step with no words has no clip (never the tool's clip at that index).
  const clipOf = (s, i) => (s.id ? `promo-${s.id}` : s.line ? `${clipKey}-${i}` : null);
  const lineOf = (s) => (s.id ? PROMO_LINES[s.id] : s.line) || '';

  const [point, setPoint] = useState({ x: window.innerWidth * 0.5, y: window.innerHeight * 0.42 });
  const [pointing, setPointing] = useState(false);   // the glowing dot at his stand's foot
  const [below, setBelow] = useState(false);         // hanging under the lit area
  const [faceLeft, setFaceLeft] = useState(false);    // turned round to point left
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
  const clipIdRef = useRef(null);                // the line he is saying, for his mouth
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
      clipIdRef.current = clipId;
      let failed = false;
      a.onerror = () => { failed = true; };
      if (!(await startClip(a))) { failed = true; try { a.pause(); } catch { /* */ } }
      // Ended, or as good as: Safari can stop on the last frame without `ended`,
      // and playing it again from there never finishes either.
      const over = () => a.ended || (Number.isFinite(a.duration) && a.duration > 0 && a.currentTime >= a.duration - 0.08);
      const t0 = Date.now();
      let lastT = -1;
      let movedAt = Date.now();
      while (!isDead(id) && !failed && !over() && Date.now() - t0 < 45000) {
        if (pausedRef.current && !a.paused) a.pause();
        if (!pausedRef.current && a.paused && !(await startClip(a))) failed = true;
        // A clip that stops moving for 5 s (and isn't paused) is over.
        if (pausedRef.current || a.currentTime !== lastT) { lastT = a.currentTime; movedAt = Date.now(); }
        else if (Date.now() - movedAt > 5000) { failed = a.currentTime < 0.5; break; }
        await wait(60, id);
      }
      if (!failed) return;
      try { a.pause(); } catch { /* */ }
    }
    // No clip yet: NO stand-in voice (Chris, 2026-10-22: never the phone's
    // robot voice; every line is voiced in the Voice Lab). He stays on the
    // control, glowing, for as long as the line takes to read, then moves on.
    if (!text) return;                                  // a promo step with nothing to say
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
    // He points to his right. He turns round to point left when the lit area
    // lies to the left of the spot, or, if it is centred on it, when the spot is
    // over on the right half of the screen (Chris, 2026-10-30).
    const mid = (box.left + box.right) / 2;
    const faceLeft = Math.abs(mid - x) > 24 ? mid < x : x > window.innerWidth / 2;
    if (roomAbove) return { x, y: box.top + 4, below: false, faceLeft };
    return { x, y: Math.min(bottom - SIZE, box.bottom - 4), below: true, faceLeft };
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

  // ---- pointing, pressing, finding ----------------------------------------------

  /** The lit area around a control, its label and any extras. */
  const boxOf = (nodes) => {
    const rects = nodes.filter(Boolean).map((n) => n.getBoundingClientRect());
    return {
      left: Math.min(...rects.map((q) => q.left)) - 8,
      top: Math.min(...rects.map((q) => q.top)) - 8,
      right: Math.max(...rects.map((q) => q.right)) + 8,
      bottom: Math.max(...rects.map((q) => q.bottom)) + 8,
    };
  };

  /** Scroll to a control, light it up and fly over to it. Resolves once he is there. */
  const pointAt = async (el, glowSels, id) => {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await settled(el, id);
    if (isDead(id)) return null;             // never light up anything for a cancelled run
    const label = labelFor(el);
    const extra = (glowSels || []).map(shown);
    glow(el, [label, ...extra]);
    const box = boxOf([el, label, ...extra]);
    setSpot(box);
    const aim = aimAt(box);
    setPointing(false);
    setBelow(aim.below); setFaceLeft(aim.faceLeft);
    await flyTo(aim.x, aim.y, id);
    if (isDead(id)) return null;
    setPointing(true);
    return box;
  };

  /** A real tap, with the dot pressing in. */
  const press = async (el, id) => {
    setTapping(true);
    await wait(140, id);
    if (isDead(id)) return;
    tap(el);
    await wait(220, id);
    setTapping(false);
  };

  /** The first match on screen, waiting up to `ms` for it to mount. */
  const findShown = async (sel, ms, id) => {
    let el = shown(sel);
    for (let waited = 0; !el && waited < ms && !isDead(id); waited += 150) {
      await wait(150, id);
      el = shown(sel);
    }
    return el;
  };

  const sayFromMiddle = async (s, i, id) => {
    unglow(); setSpot(null); setPointing(false); setBelow(false); setFaceLeft(false);
    await flyTo(window.innerWidth * 0.5, window.innerHeight * 0.45, id);
    if (isDead(id)) return;
    await say(clipOf(s, i), lineOf(s), id);
  };

  // ---- promo steps -------------------------------------------------------------------

  const paneShown = (tab) => {
    const p = document.querySelector(`[data-tab-pane="${tab}"]`);
    return !!p && p.style.display !== 'none';
  };
  const toolOpen = (tab) => paneShown(tab) && (!document.querySelector('.mob-home') || !!document.querySelector('.mob-home.is-hidden'));

  /** Go to a tool the way a person does: its tile, or the menu and then its tile. */
  const openTool = async (tab, id) => {
    if (!toolOpen(tab)) {
      let tile = shown(`.mob-home:not(.is-hidden) [data-tool="${tab}"]`);
      if (!tile) {
        const menu = shown('.mob-bar button[aria-label="All tools"]');
        if (menu) {
          await pointAt(menu, [], id);
          await press(menu, id);
          tile = await findShown(`.mob-sheet [data-tool="${tab}"]`, 1500, id);
        }
      }
      if (tile && !isDead(id)) {
        await pointAt(tile, [], id);
        await press(tile, id);
      } else {
        requestTabRef.current?.(tab);
      }
      for (let n = 0; n < 40 && !toolOpen(tab) && !isDead(id); n += 1) await wait(100, id);
    }
    // A tool's first-time card would sit over everything he points at.
    const ok = await findShown('.mob-help-ok', 600, id);
    if (ok && !isDead(id)) { await wait(400, id); tap(ok); await wait(300, id); }
    unglow(); setSpot(null);
    return toolOpen(tab);
  };

  /**
   * HE WAITS FOR THE REAL RESULT. Chris: "make sure the ghost is waiting for the
   * lyrics to come up". He hangs over the busy control (it says what it is doing
   * and for how long) and the screen stays on it until `wait()` comes true.
   * False when it failed or ran out of time.
   */
  const waitStep = async (s, i, id) => {
    const at = s.at ? await findShown(s.at, 3000, id) : null;
    let box = at ? await pointAt(at, [], id) : null;
    if (!at) await flyTo(window.innerWidth * 0.5, window.innerHeight * 0.45, id);
    if (isDead(id)) return false;
    let talking = say(clipOf(s, i), lineOf(s), id);
    let speaking = true;
    talking.then(() => { speaking = false; });
    const idle = [...(s.idle || [])];
    const t0 = Date.now();
    let ok = false;
    while (!isDead(id)) {
      let done = false;
      try { done = !!s.wait(Date.now() - t0); } catch { /* not there yet */ }
      if (done) { ok = !(s.fail && s.fail()); break; }
      if (Date.now() - t0 > (s.timeout || 60000)) break;
      // A long wait gets another line, once he has finished the last one.
      if (idle.length && !speaking && Date.now() - t0 > idle[0].after) {
        const next = idle.shift();
        speaking = true;
        talking = say(`promo-${next.id}`, PROMO_LINES[next.id] || '', id);
        talking.then(() => { speaking = false; });
      }
      // Keep the busy control on screen and him on it: a status line grows and
      // moves while it works, and the app may scroll on its own.
      if (at && at.isConnected) {
        const r = at.getBoundingClientRect();
        if (r.bottom < topLimit() + 10 || r.top > window.innerHeight - 110) {
          at.scrollIntoView({ block: 'center', behavior: 'smooth' });
          await settled(at, id);
        }
        const nb = boxOf([at]);
        if (!box || Math.abs(nb.top - box.top) > 6 || Math.abs(nb.bottom - box.bottom) > 6 || Math.abs(nb.left - box.left) > 6) {
          box = nb;
          setSpot(nb);
          const aim = aimAt(nb);
          setBelow(aim.below); setFaceLeft(aim.faceLeft);
          await flyTo(aim.x, aim.y, id, 320);
        }
      }
      await wait(250, id);
    }
    await talking;                       // he finishes his sentence either way
    return ok;
  };

  /**
   * THE SCREEN MOVES WITH HIM. Chris: "the screen is scrolling along with the
   * ghost". The result scrolls up under him from its top to its end while he
   * rides along the right edge, reading it, at a pace a viewer can follow.
   */
  const readStep = async (s, i, id) => {
    const el = await findShown(s.read, 5000, id);
    if (isDead(id)) return;
    if (!el) { await sayFromMiddle(s, i, id); return; }
    // He rides the right edge, so he faces left: pointing in at the text that
    // scrolls past, not out of the screen.
    unglow(); setSpot(null); setPointing(false); setBelow(false); setFaceLeft(true);
    const sc = scrollParent(el);
    const page = sc === document.scrollingElement || sc === document.documentElement;
    const viewTop = page ? 0 : sc.getBoundingClientRect().top;
    const viewH = page ? window.innerHeight : sc.clientHeight;
    const max = sc.scrollHeight - sc.clientHeight;
    const elTop = el.getBoundingClientRect().top - viewTop + sc.scrollTop;
    const clamp = (v) => Math.max(0, Math.min(max, v));
    const from = clamp(elTop - Math.max(topLimit() - viewTop, 0) - viewH * 0.12);
    const to = Math.max(from, clamp(elTop + el.offsetHeight - viewH * 0.8));
    sc.scrollTo({ top: from, behavior: 'smooth' });
    await settled(el, id);
    if (isDead(id)) return;
    await flyTo(window.innerWidth - 26, topLimit() + (window.innerHeight - topLimit()) * 0.42, id);
    if (isDead(id)) return;
    const talking = say(clipOf(s, i), lineOf(s), id);
    // About 70px a second, so a viewer can read along; long ones go faster.
    const dur = Math.max(2500, Math.min(s.ms || 12000, ((to - from) / 70) * 1000));
    const behavior = sc.style.scrollBehavior;
    sc.style.scrollBehavior = 'auto';          // CSS smooth scrolling would fight every frame
    const t0 = Date.now();
    while (!isDead(id)) {
      const p = Math.min(1, (Date.now() - t0) / dur);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      sc.scrollTop = from + (to - from) * e;
      if (p >= 1) break;
      await wait(30, id);
    }
    sc.style.scrollBehavior = behavior;
    await talking;
    await wait(400, id);
  };

  /** Play a finished take and listen to it with the viewer. */
  const playStep = async (s, i, id) => {
    const el = await findShown(s.play, 5000, id);
    if (!el) { await sayFromMiddle(s, i, id); return; }
    await pointAt(el, [], id);
    if (isDead(id)) return;
    await say(clipOf(s, i), lineOf(s), id);
    if (isDead(id)) return;
    await press(el, id);
    try { el.currentTime = 0; await el.play(); } catch { /* the controls are still there to tap */ }
    const t0 = Date.now();
    while (!isDead(id) && !el.ended && Date.now() - t0 < (s.ms || 40000)) await wait(200, id);
    await wait(500, id);
  };

  const run = async (id) => {
    if (!demo) { finish(0); return; }
    // One tick before touching anything: in dev, React mounts, tears down and
    // remounts in the same commit, and the first run must be dead by now. This
    // is also what keeps the primed audio for the run that survives.
    await Promise.resolve();
    if (isDead(id)) return;
    // A walkthrough puts the tool back as it found it. A promo, or a live
    // walkthrough, keeps what it made: that is what he came to see.
    if (!promo && !live) snapshotRef.current = captureAll();
    if (musicWanted()) bedRef.current = playBed(ghostMusic(tabId), { level: BED_LEVEL });

    for (const [s, i] of stepPlan(demo, live && !promo)) {
      if (isDead(id)) return;

      if (s.bed === 'off') { bedRef.current?.stop(1.2); bedRef.current = null; continue; }
      if (s.run) {
        try { await s.run(); } catch { /* nothing to do there */ }
        await wait(300, id);
        continue;
      }
      if (s.open) {
        if (lineOf(s)) await sayFromMiddle(s, i, id);
        if (isDead(id)) return;
        if (!(await openTool(s.open, id))) { if (!isDead(id)) finish(); return; }
        continue;
      }
      if (s.wait) {
        // It failed or never came: stop where the reason is on screen. A `soft`
        // wait was only giving it time, so he carries on.
        if (!(await waitStep(s, i, id)) && !s.soft) { if (!isDead(id)) finish(); return; }
        continue;
      }
      if (s.read) { await readStep(s, i, id); continue; }
      if (s.play) { await playStep(s, i, id); continue; }

      let el = s.target ? shown(s.target) : null;
      // Results arrive late on a run that makes them, so it waits for them.
      if (s.target && !el) el = await findShown(s.target, promo || live ? 4000 : 350, id);

      // No control to point at: a talking step, or an optional control that
      // only appears after a result. He says the step's one line from the
      // middle of the screen (optional lines are worded to be true either way).
      if (s.target && !el && !s.optional) continue;
      if (!el) {
        if (!lineOf(s)) continue;
        await sayFromMiddle(s, i, id);
        await wait(300, id);
        continue;
      }

      if (!(await pointAt(el, s.glow, id))) return;
      await say(clipOf(s, i), lineOf(s), id);
      if (isDead(id)) return;

      if (s.action === 'type' && s.typeText) {
        const field = el.matches('input, textarea') ? el : el.querySelector('input, textarea');
        if (field) {
          // No focus(): on a phone that throws the keyboard up over half the screen.
          let built = '';
          if (s.clear) setReactValue(field, '');
          const text = typeof s.typeText === 'function' ? s.typeText() : s.typeText;
          for (const ch of text) {
            if (isDead(id)) return;
            built += ch;
            setReactValue(field, built);
            await wait(45 + Math.random() * 55, id);
          }
        }
      } else if (s.action === 'click') {
        s.before?.();
        await press(el, id);
      }
      if (s.act) {
        try { await s.act(); } catch { /* the step still happened on screen */ }
      }
      await wait(s.action || s.act ? 700 : 350, id);
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
  // A promo run changes tools itself, so it carries on.
  useEffect(() => {
    if (!promo && tabId !== tabAtStart.current) finish(0);
  }, [tabId, finish, promo]);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused) bedRef.current?.pause(); else bedRef.current?.resume();
  }, [paused]);

  const toggleMusic = () => {
    const next = !musicOn;
    setMusicOn(next);
    try { localStorage.setItem(MUSIC_KEY, next ? 'on' : 'off'); } catch { /* storage blocked */ }
    if (!next) { bedRef.current?.stop(0.6); bedRef.current = null; }
    else if (!bedRef.current && !deadRef.current) bedRef.current = playBed(ghostMusic(tabId), { level: BED_LEVEL });
  };

  const g = ghostSpot(point.x, point.y, below, faceLeft);
  // His mouth: which clip is playing and how far in. Null while he is quiet.
  const speech = useCallback(() => {
    const a = audioRef.current;
    const id = clipIdRef.current;
    return a && id && !a.paused && !a.ended ? { id, t: a.currentTime } : null;
  }, []);

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

      {/* In a promo run the screen is being recorded, so there are no buttons:
          tapping the Ghost himself stops it. */}
      <div
        className={`pg-ghost ${g.flip ? 'is-flip' : ''} ${promo ? 'is-tappable' : ''}`}
        style={{ transform: `translate3d(${g.left}px, ${g.top}px, 0)`, width: SIZE, height: SIZE }}
        onClick={promo ? () => finish() : undefined}
        role={promo ? 'button' : undefined}
        aria-label={promo ? 'Stop the promo run' : undefined}
      >
        <div className="pg-bob">
          <GhostRiderMascot variant="guide" kind="phone" speech={speech} />
        </div>
      </div>

      {!promo && <div className="pg-controls">
        <button type="button" className="pg-btn" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Keep going' : 'Pause the Ghost'}>
          {paused ? 'Play' : 'Pause'}
        </button>
        <button type="button" className={`pg-btn ${musicOn ? 'is-on' : ''}`} onClick={toggleMusic} aria-pressed={musicOn}>
          Music
        </button>
        <button type="button" className="pg-btn pg-btn-stop" onClick={() => finish()} aria-label="Stop the Ghost">
          Stop
        </button>
      </div>}
    </div>
  );
}
