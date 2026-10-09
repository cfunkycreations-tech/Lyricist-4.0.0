import { withFades } from '../../services/clipFade.js';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getGhostDemo } from './ghostDemoScripts.js';
import { captureAll, restoreAll } from '../../services/demoSafety.js';
// The ghost portrait (ghost.demo.png) was stripped 2026-08-27 with the rest of
// the artwork. Chris, later same day, watching a test recording: *"if you built
// it right, I don't want the cursor to say remote on it. It needs to look like
// a person is actually guiding, driving the mouse."* — so the "Remote" name tag
// went too. What is left is a plain SVG pointer that looks and moves like any
// other cursor a viewer might be watching. The .png file is left in src/assets/
// untouched but no longer imported.
// Chris, 2026-10-09: the Ghost is back on screen during the demo, with a button
// to hide it. Same art as the Ask-the-Ghost hand (ghost-sprite.png).
import ghostSprite from '../../assets/ghost-sprite.png';
import './GhostDemo.css';

/**
 * The ghost's voice — am_adam dragged down to ~68 Hz, baked by
 * `scripts/generate-ghost-audio.py`. Chris picked the voice and the depth by
 * ear on 2026-08-12.
 *
 * Resolved through Vite's import.meta.glob, NOT loaded from public/ at runtime.
 * Assets under public/ do not resolve once the app is packaged — that exact
 * mistake shipped 17 black tab panels in build 063 and a dead header clip in
 * 067. If a clip is missing the demo simply runs silent; it never blocks.
 */
const VO_URLS = import.meta.glob('../../assets/ghost-vo/*.mp3', {
  eager: true, query: '?url', import: 'default',
});
const VO = Object.fromEntries(
  Object.entries(VO_URLS).map(([path, url]) => [
    path.split('/').pop().replace(/\.mp3$/, ''),
    url,
  ])
);

// Lines re-baked in the Voice Lab (Ghost panel, Creator build) sit in the voice
// pack and win over the built-in clip, so a new voice is heard without a
// rebuild. Loaded once; a bake refreshes it through refreshOwnGhostVoice().
let OWN = {};
export function refreshOwnGhostVoice() {
  return (window.lyricistAPI?.voicePack?.() || Promise.resolve(null))
    .then((r) => { if (r?.ok) OWN = r.ghost || {}; })
    .catch(() => { /* no pack is the normal case */ });
}
refreshOwnGhostVoice();
const clipFor = (id) => OWN[id] || VO[id];

/**
 * Ghost Demo — operates the UI like a remote operator:
 * hides the real cursor, moves a visible pointer, types into fields,
 * and really clicks buttons so the feature runs.
 */

function setReactInputValue(el, value) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc?.set) desc.set.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Dispatch a pointer sequence at an element.
 *
 * `click` MUST be opt-in. This function used to always fire a click event and
 * then call el.click() on top of it — including from the 'point' branch, whose
 * own comment said "Don't force button actions on pure point steps". It did.
 * That is why the Quantum Lab demo ended up on Song Forge: the "Send to Song
 * Forge" step is a point step, it really pressed the button, the app changed
 * tabs underneath the demo, and every remaining target went display:none.
 */
function firePointerSequence(el, clientX, clientY, { click = true } = {}) {
  if (!el) return;
  const opts = { bubbles: true, cancelable: true, clientX, clientY, view: window, buttons: click ? 1 : 0 };
  const types = click
    ? [
        'pointerover', 'pointerenter', 'mouseover', 'mouseenter',
        'pointermove', 'mousemove',
        'pointerdown', 'mousedown',
        'pointerup', 'mouseup',
        'click',
      ]
    : // Hover only — enough for the UI to light up, nothing that activates it.
      ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove'];
  for (const type of types) {
    try {
      if (type.startsWith('pointer')) {
        el.dispatchEvent(new PointerEvent(type, { ...opts, pointerId: 1, pointerType: 'mouse' }));
      } else {
        el.dispatchEvent(new MouseEvent(type, opts));
      }
    } catch {
      el.dispatchEvent(new MouseEvent(type.replace('pointer', 'mouse'), opts));
    }
  }
  // React synthetic listeners often listen on the element itself
  if (click) { try { el.click(); } catch { /* */ } }
}

/**
 * WHERE THE SPEECH BUBBLE GOES SO IT NEVER LANDS ON THE GHOST.
 *
 * Chris: "make sure that ghost never goes behind the speech box ... he's
 * always pointing to the right, so make sure it's always on the right or above
 * it or somewhere, just not behind the box."
 *
 * The ghost is drawn at a fixed offset from the cursor by .ghost-demo-figure
 * in GhostDemo.css: left -96px, top -118px, 112x112 plus the "Remote" label.
 * The numbers below mirror that box with a little slack. If you move the ghost
 * in the CSS, move it here too.
 *
 * The old code was one line, `x = min(innerWidth - 330, max(12, tx + 28))`.
 * On a target near the right edge that clamp dragged the bubble left, straight
 * on top of him.
 *
 * Order of preference: right of the ghost (the way he faces, so he points at
 * what he is saying), then left, then above, then below. Never on top.
 */
function placeBubble(tx, ty) {
  const M = 12;                                        // keep off the edges
  const GAP = 18;
  const W = Math.min(300, window.innerWidth - 32);      // matches the CSS width
  const H = 150;                                       // generous; text varies

  // The ghost's own rectangle in viewport coordinates.
  const gLeft = tx - 100;
  const gRight = tx + 20;
  const gTop = ty - 122;
  const gBottom = ty + 16;

  let x = gRight + GAP;
  let y = Math.max(M, ty - 130);

  if (x + W > window.innerWidth - M) {
    const leftX = gLeft - GAP - W;
    if (leftX >= M) {
      x = leftX;                                       // put him on the right
    } else {
      // No room either side. Go above him, or below if the top is tight.
      x = Math.min(window.innerWidth - M - W, Math.max(M, tx - W / 2));
      const aboveY = gTop - GAP - H;
      y = aboveY >= M ? aboveY : gBottom + GAP;
    }
  }

  x = Math.min(window.innerWidth - M - W, Math.max(M, x));
  y = Math.min(window.innerHeight - M - H, Math.max(M, y));

  // Last look. If clamping to the viewport pushed it back over him, drop it
  // below him, which is always somewhere.
  const overlaps = x < gRight && x + W > gLeft && y < gBottom && y + H > gTop;
  if (overlaps) y = Math.min(window.innerHeight - M - H, gBottom + GAP);

  return { x, y };
}

export default function GhostDemo({ tabId, onClose }) {
  const demo = getGhostDemo(tabId);

  /**
   * onClose comes in as an inline arrow from App.jsx, so its identity changes
   * on EVERY App render. runDemo used to close over it through useCallback, and
   * the effect depended on runDemo — so every App re-render tore the running
   * demo down and started it again from step 1. Because the demo really types
   * into fields, its own typing re-rendered App, which restarted it, which
   * typed again: the cursor snapping back and forth until it gave up. Holding
   * the callback in a ref breaks that loop — identity churn can no longer
   * reach the effect.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const closeDemo = useCallback(() => { onCloseRef.current?.(); }, []);

  /**
   * Every launch of the walkthrough gets an id. A run keeps going only while
   * its own id is still the current one, so a superseded run stops on its next
   * await instead of racing the new one.
   *
   * This is what makes the mount-only effect safe under React.StrictMode, which
   * deliberately mounts, tears down, and remounts every effect in dev. A plain
   * "only start once" flag looked right and was worse than the bug it replaced:
   * StrictMode's teardown cancelled run 1, the remount saw the flag and never
   * started run 2, and the demo sat on step 1 with the bar open forever.
   */
  const runIdRef = useRef(0);
  // The tab it was launched for. If the app navigates away mid-run, stop —
  // every target on the old tab is display:none and the run would just hang.
  const tabAtStartRef = useRef(tabId);
  const [stepIdx, setStepIdx] = useState(0);
  const [cursor, setCursor] = useState({ x: window.innerWidth * 0.5, y: window.innerHeight * 0.4 });
  const [bubble, setBubble] = useState({ text: '', x: 0, y: 0, visible: false });
  const [highlight, setHighlight] = useState(null);
  const [clickPulse, setClickPulse] = useState(false);
  const [paused, setPaused] = useState(false);
  const [statusLine, setStatusLine] = useState('Connecting…');
  const cancelRef = useRef(false);
  const snapshotRef = useRef(null);

  /**
   * Playback speed. Chris, 2026-08-12: "don't zip across the screen so fast…
   * give people a chance to read what you're doing. You can go medium speed."
   * Medium is the default and it is the honest default — the old build had no
   * speed control at all and every bubble was capped at 1.2s on screen before
   * the click fired, which is less time than it takes to read one sentence.
   * Slow is roughly half pace for someone reading carefully; Fast is for a
   * second watch when you already know the tab.
   */
  const SPEEDS = { slow: 1.55, medium: 1.0, fast: 0.62 };
  const [speed, setSpeed] = useState('medium');
  const speedRef = useRef(1.0);
  useEffect(() => { speedRef.current = SPEEDS[speed] ?? 1.0; }, [speed]);

  // Voice on by default, and switchable from the demo bar — a labelled button,
  // not a setting hidden on another tab.
  const [voiceOn, setVoiceOn] = useState(true);
  const FIGURE_KEY = 'lyricistGhostFigure';
  const [showGhost, setShowGhost] = useState(() => {
    try { return localStorage.getItem(FIGURE_KEY) !== 'off'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(FIGURE_KEY, showGhost ? 'on' : 'off'); } catch { /* storage blocked */ }
  }, [showGhost]);
  const voiceOnRef = useRef(true);
  const audioRef = useRef(null);

  const stopVoice = useCallback(() => {
    const a = audioRef.current;
    if (a) { try { a.pause(); a.currentTime = 0; } catch { /* */ } }
  }, []);

  useEffect(() => {
    voiceOnRef.current = voiceOn;
    if (!voiceOn) stopVoice();
  }, [voiceOn, stopVoice]);

  // Never leave a voice talking to an empty room.
  useEffect(() => () => stopVoice(), [stopVoice]);

  /**
   * Speak a baked line. Resolves with how long it runs, in ms, so the step can
   * hold the bubble up until the ghost has actually finished the sentence —
   * the clips run well past the reading estimate (one is 21 seconds), and
   * cutting the voice off mid-word to advance would be worse than silence.
   * Resolves 0 when voice is off or the clip is missing, and the step then
   * falls back to read-time alone.
   */
  const speak = useCallback((id) => new Promise((resolve) => {
    if (!voiceOnRef.current || !clipFor(id)) return resolve(0);
    let a = audioRef.current;
    if (!a) { a = withFades(new Audio()); audioRef.current = a; }
    try { a.pause(); } catch { /* */ }
    a.onloadedmetadata = null;
    a.onerror = null;
    a.src = clipFor(id);
    // Slow/Fast changes the pace of the whole walkthrough; the voice follows it
    // rather than desyncing from the captions. Clamped because the browser
    // refuses rates outside this range and throws.
    a.playbackRate = Math.min(2, Math.max(0.5, 1 / (speedRef.current || 1)));
    a.onloadedmetadata = () => {
      const ms = Number.isFinite(a.duration) ? (a.duration * 1000) / a.playbackRate : 0;
      resolve(ms);
    };
    a.onerror = () => resolve(0);
    const p = a.play();
    if (p?.catch) p.catch(() => resolve(0));
  }), []);

  /**
   * How long a bubble must stay up before the ghost acts on it. Derived from
   * the actual sentence, not a constant: ~2.6 words/sec is an unhurried adult
   * reading pace, plus a beat to find the highlighted control. Floored at 2.6s
   * so even a four-word line does not flash past, ceilinged at 13s so a long
   * explanation cannot strand someone who already gets it (Pause holds it
   * open indefinitely, and the bubble stays up during the action anyway).
   */
  const readTimeFor = (text) => {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
    const raw = (words / 2.6) * 1000 + 1100;
    return Math.round(Math.min(13000, Math.max(2600, raw)) * speedRef.current);
  };

  /**
   * Put the user's work back. Safe to call more than once — the snapshot is
   * cleared after the first restore, so the finish path and the unmount
   * cleanup can both call it without fighting each other.
   */
  const restoreWork = useCallback(() => {
    if (!snapshotRef.current) return;
    const snap = snapshotRef.current;
    snapshotRef.current = null;
    restoreAll(snap);
  }, []);
  const pauseRef = useRef(false);
  const cursorRef = useRef({ x: window.innerWidth * 0.5, y: window.innerHeight * 0.4 });

  useEffect(() => { pauseRef.current = paused; }, [paused]);

  // Hide the real system cursor for the whole app while demo runs
  useEffect(() => {
    document.body.classList.add('ghost-demo-active');
    return () => {
      document.body.classList.remove('ghost-demo-active');
      document.querySelectorAll('.ghost-demo-click').forEach((n) => n.classList.remove('ghost-demo-click'));
    };
  }, []);

  /** True once this run has been stopped, or superseded by a newer run. */
  const isDead = (runId) => cancelRef.current || (runId != null && runIdRef.current !== runId);

  const wait = (ms, runId) =>
    new Promise((resolve) => {
      // A NaN duration here would spin forever — `Date.now() - start >= NaN` is
      // never true — so the duration is sanitised at the door.
      const dur = Number.isFinite(ms) ? Math.max(0, ms) : 0;
      const start = Date.now();
      let paused = 0, pausedAt = 0;
      const tick = () => {
        if (isDead(runId)) return resolve();
        const a = audioRef.current;
        if (pauseRef.current) {
          // Pause holds the VOICE too. Without this the ghost kept narrating
          // over a frozen screen, which is worse than either alone.
          if (!pausedAt) { pausedAt = Date.now(); if (a && !a.paused) { try { a.pause(); } catch { /* */ } } }
          setTimeout(tick, 60);
          return;
        }
        if (pausedAt) {
          paused += Date.now() - pausedAt;
          pausedAt = 0;
          if (a && a.paused && a.currentTime > 0 && !a.ended && voiceOnRef.current) {
            const p = a.play(); if (p?.catch) p.catch(() => {});
          }
        }
        if (Date.now() - start - paused >= dur) resolve();
        else setTimeout(tick, 30);
      };
      tick();
    });

  /** Human-ish path with a slight curve */
  const animateCursorTo = (x, y, duration = 850, runId) =>
    new Promise((resolve) => {
      const from = { ...cursorRef.current };
      const midX = (from.x + x) / 2 + (Math.random() - 0.5) * 40;
      const midY = (from.y + y) / 2 + (Math.random() - 0.5) * 30;
      const t0 = performance.now();
      const step = (now) => {
        if (isDead(runId)) return resolve();
        if (pauseRef.current) {
          requestAnimationFrame(step);
          return;
        }
        const t = Math.min(1, (now - t0) / duration);
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        // quadratic bezier
        const u = 1 - ease;
        const nx = u * u * from.x + 2 * u * ease * midX + ease * ease * x;
        const ny = u * u * from.y + 2 * u * ease * midY + ease * ease * y;
        cursorRef.current = { x: nx, y: ny };
        setCursor({ x: nx, y: ny });
        if (t < 1) requestAnimationFrame(step);
        else {
          cursorRef.current = { x, y };
          setCursor({ x, y });
          resolve();
        }
      };
      requestAnimationFrame(step);
    });

  const findEl = async (sel) => {
    if (!sel) return null;
    let el = document.querySelector(sel);
    if (!el) {
      await wait(350);
      el = document.querySelector(sel);
    }
    // Prefer inner input/textarea/button if wrapper selected
    if (el && !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLButtonElement)) {
      const inner = el.querySelector('input, textarea, button, [role="button"]');
      if (inner && (sel.includes('keywords') || sel.includes('input') || sel.includes('key'))) {
        return inner;
      }
    }
    return el;
  };

  const typeLikeHuman = async (el, text, runId) => {
    if (!el || !text) return;
    el.focus();
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await wait(200, runId);
    setReactInputValue(el, '');
    let built = '';
    for (const ch of text) {
      if (isDead(runId)) return;
      built += ch;
      setReactInputValue(el, built);
      // Was 28–73ms — faster than any human types and it read as a blur.
      // 42–110ms scaled by the speed control lands around 110 wpm: clearly
      // a person typing, slow enough to watch the words appear.
      await wait((42 + Math.random() * 68) * speedRef.current, runId);
    }
    // Let the finished text sit before anything else happens.
    await wait(700 * speedRef.current, runId);
  };

  const realClick = async (el, runId) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    setClickPulse(true);
    el.classList.add('ghost-demo-click');
    await wait(90, runId);
    firePointerSequence(el, cx, cy);
    await wait(160, runId);
    setClickPulse(false);
    el.classList.remove('ghost-demo-click');
  };

  const runDemo = useCallback(async (runId) => {
    if (!demo) {
      setStatusLine('This tab uses Tips hover — no walkthrough needed.');
      setBubble({
        text: 'Dictionary, Thesaurus, and the simple tools don’t get a walkthrough. Use Tips ON and hover. Ghost Demo is for Quantum Lab, Ghost Rider, Song Forge, RC-Funk 5000, MIDI, Mastering, and the other hard tabs.',
        x: Math.max(16, window.innerWidth / 2 - 170),
        y: Math.max(90, window.innerHeight / 2 - 50),
        visible: true,
      });
      const noneMs = await speak('system-0-notabdemo');
      await wait(Math.max(4800, noneMs + 600), runId);
      if (!isDead(runId)) closeDemo();
      return;
    }

    // Snapshot before touching anything. The demo really types and really
    // clicks, so without this it overwrites work in progress — it once wiped a
    // Quantum Lab lattice the user had filled in. Restored in finishDemo().
    snapshotRef.current = captureAll();

    setStatusLine(`Running: ${demo.title}`);
    cursorRef.current = { x: window.innerWidth * 0.62, y: window.innerHeight * 0.28 };
    setCursor(cursorRef.current);

    const steps = demo.steps || [];

    for (let i = 0; i < steps.length; i++) {
      if (isDead(runId)) break;
      setStepIdx(i);
      const step = steps[i];
      let tx = window.innerWidth * 0.5;
      let ty = window.innerHeight * 0.4;
      let el = null;

      if (step.target) {
        el = await findEl(step.target);
      }

      // A step that names a control it cannot find used to fall through to
      // 'say': the ghost drifted to the middle of the screen and narrated a
      // button nobody could see. That is what made the demo look broken on
      // most tabs — 13 of these anchors had never been added to the components
      // at all. Now a miss is explicit.
      if (step.target && !el) {
        if (step.optional) {
          // Genuinely conditional controls (Send appears only after a result).
          // Say why it is not there instead of pointing at nothing.
          setHighlight(null);
          setBubble({
            text: step.whenMissing || `${step.say} — it is not on screen yet; it appears once the step before it has produced a result.`,
            x: Math.max(16, window.innerWidth / 2 - 190),
            y: Math.max(80, window.innerHeight * 0.32),
            visible: true,
          });
          setStatusLine('Not on screen yet — explaining instead of pointing');
          const missMs = await speak(`${tabId}-${i}-whenMissing`);
          await wait(Math.max(readTimeFor(step.whenMissing || step.say), missMs + 450), runId);
          continue;
        }
        // Not optional: the anchor is missing from the component. Loud in dev,
        // skipped cleanly for the user rather than faked.
        console.warn(`[GhostDemo] step ${i + 1} target not found: ${step.target}`);
        setStatusLine(`Skipped a step — control not found (${step.target})`);
        continue;
      }

      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        await wait(500 * speedRef.current, runId);
        const r = el.getBoundingClientRect();
        tx = r.left + Math.min(r.width * 0.55, r.width - 8);
        ty = r.top + r.height / 2;
        setHighlight({
          left: r.left - 4,
          top: r.top - 4,
          width: r.width + 8,
          height: r.height + 8,
        });
      } else {
        setHighlight(null);
      }

      // Move the visible mouse like a remote session
      await animateCursorTo(tx, ty, (el ? 900 + Math.random() * 200 : 600) * speedRef.current, runId);

      const spot = placeBubble(tx, ty);
      setBubble({ text: step.say, x: spot.x, y: spot.y, visible: true });
      // THE pacing bug. This was `Math.min(1200, …)` — a hard 1.2s ceiling on
      // how long the explanation sat there before the ghost clicked, no matter
      // how long the sentence was. You could not finish reading a step before
      // the app had already moved on. Now it waits for the sentence — and, when
      // the voice is on, for the ghost to finish saying it, whichever is longer.
      const sayMs = await speak(`${tabId}-${i}-say`);
      await wait(Math.max(readTimeFor(step.say), sayMs + 450), runId);

      const action = step.action || (el ? 'click' : 'say');

      if (action === 'type' && el && step.typeText) {
        // If target is a wrapper, type into its field
        let field = el;
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
          field = el.querySelector('textarea, input') || el;
        }
        await typeLikeHuman(field, step.typeText, runId);
        setStatusLine(`Typed into ${step.target || 'field'}`);
      } else if (action === 'click' && el) {
        // Default: really operate the control
        if (step.skipClick) {
          setStatusLine('Pointing (no click — would open mic/API)');
        } else {
          await realClick(el, runId);
          setStatusLine(`Clicked ${step.target || 'control'}`);
        }
      } else if (action === 'point' && el) {
        // Hover only — fires mouseenter so the UI can highlight, but never
        // activates the control. See firePointerSequence: click is opt-in now.
        const r = el.getBoundingClientRect();
        firePointerSequence(el, r.left + r.width / 2, r.top + r.height / 2, { click: false });
        setStatusLine('Pointing — not pressing it');
      }

      // Beat after the action so the result is visible before the ghost leaves.
      // `then` is the optional "here is what just happened" line — the demo used
      // to click and move on without ever saying what changed on screen.
      if (step.then) {
        setBubble((b) => ({ ...b, text: step.then }));
        setStatusLine('Showing the result');
        const thenMs = await speak(`${tabId}-${i}-then`);
        await wait(Math.max(readTimeFor(step.then), thenMs + 450), runId);
      } else {
        await wait((step.wait ?? 2800) * speedRef.current, runId);
      }
    }

    if (!isDead(runId)) {
      setHighlight(null);
      restoreWork();
      setBubble({
        text: `Walkthrough finished for ${demo.title}. Your own work has been put back exactly as you left it — the demo never keeps anything. Play Demo again anytime while Ghost Demo is On.`,
        x: Math.max(16, window.innerWidth / 2 - 170),
        y: Math.max(70, window.innerHeight / 2 - 40),
        visible: true,
      });
      setStatusLine('Session complete — your work restored');
      const endMs = await speak('system-0-finished');
      await wait(Math.max(3500, endMs + 600), runId);
      stopVoice();
      closeDemo();
    }
  }, [demo, closeDemo, restoreWork]);

  const runDemoRef = useRef(runDemo);
  useEffect(() => { runDemoRef.current = runDemo; }, [runDemo]);

  // Mount-only. Empty deps means no amount of re-rendering — including the
  // re-renders the demo causes itself by typing into the app — can restart it.
  // StrictMode's dev remount bumps the run id, which retires run 1 on its next
  // await and lets run 2 proceed cleanly. Teardown restores the user's work.
  useEffect(() => {
    const myId = ++runIdRef.current;
    cancelRef.current = false;
    runDemoRef.current(myId);
    return () => {
      cancelRef.current = true;
      restoreWork();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If something navigates the app to a different tab while the demo is
  // running, every remaining target is on a display:none pane. Stop cleanly
  // instead of standing there pointing at nothing.
  useEffect(() => {
    if (tabId !== tabAtStartRef.current) {
      cancelRef.current = true;
      setStatusLine('Tab changed — demo stopped');
      restoreWork();
      closeDemo();
    }
  }, [tabId, restoreWork, closeDemo]);

  const skip = () => {
    cancelRef.current = true;
    stopVoice();
    restoreWork();
    closeDemo();
  };

  return (
    <div className="ghost-demo-root" role="dialog" aria-label="Ghost walkthrough">
      {/* Dim overlay does NOT block the UI — ghost clicks pass through to real controls */}
      <div className="ghost-demo-scrim" aria-hidden />

      {highlight && (
        <div
          className="ghost-demo-ring"
          style={{
            left: highlight.left,
            top: highlight.top,
            width: highlight.width,
            height: highlight.height,
          }}
        />
      )}

      {/* The only visible mouse during the session */}
      <div
        className={`ghost-demo-operator ${clickPulse ? 'is-click' : ''}`}
        style={{ left: cursor.x, top: cursor.y }}
      >
        {/* The transparent ghost art and the "Remote" name tag both used to
            hang off the cursor here. Both are gone: Chris does not want the
            recording to betray that a canned operator is driving, and a name
            tag hovering next to a pointer is the tell. The cursor stands
            alone now, and looks like any other cursor on screen. */}
        {showGhost && (
          <div className="ghost-demo-figure" aria-hidden>
            <div className="ghost-demo-sprite-wrap">
              <img className="ghost-demo-sprite" src={ghostSprite} alt="" draggable={false} />
            </div>
          </div>
        )}
        <div className="ghost-demo-cursor" aria-hidden>
          <svg width="32" height="32" viewBox="0 0 24 24">
            <path
              d="M5 3 L5 18 L9.5 14.5 L12.5 21 L15 20 L12 13.5 L18 13 Z"
              fill="#f8fafc"
              stroke="#9ba1aa"
              strokeWidth="1.1"
            />
          </svg>
        </div>
      </div>

      {bubble.visible && (
        <div className="ghost-demo-bubble" style={{ left: bubble.x, top: bubble.y }}>
          <div className="ghost-demo-bubble-name">Ghost</div>
          <div className="ghost-demo-bubble-text">{bubble.text}</div>
          <div className="ghost-demo-bubble-meta">
            {demo
              ? `Step ${Math.min(stepIdx + 1, demo.steps.length)} / ${demo.steps.length} · ${demo.title}`
              : 'Tips only'}
          </div>
        </div>
      )}

      <div className="ghost-demo-bar">
        <span className="ghost-demo-bar-title">
          Ghost walkthrough — {demo?.title || 'Tips'} · {statusLine}
        </span>
        {/* Speed is a visible, labelled control — not a preference buried in
            Settings. Medium is the default. */}
        <span className="ghost-demo-bar-speed" aria-label="Demo speed">
          <span className="ghost-demo-bar-speed-label">Speed</span>
          {[['slow', 'Slow'], ['medium', 'Medium'], ['fast', 'Fast']].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`ghost-demo-bar-btn ghost-demo-bar-speed-btn ${speed === id ? 'is-on' : ''}`}
              aria-pressed={speed === id}
              onClick={() => setSpeed(id)}
            >
              {label}
            </button>
          ))}
        </span>

        <button
          type="button"
          className={`ghost-demo-bar-btn ghost-demo-bar-voice ${voiceOn ? 'is-on' : ''}`}
          aria-pressed={voiceOn}
          onClick={() => setVoiceOn((v) => !v)}
          title={voiceOn ? 'Turn the ghost’s voice off' : 'Turn the ghost’s voice on'}
        >
          {voiceOn ? 'Voice On' : 'Voice Off'}
        </button>

        <button
          type="button"
          className={`ghost-demo-bar-btn ${showGhost ? 'is-on' : ''}`}
          aria-pressed={showGhost}
          onClick={() => setShowGhost((v) => !v)}
          title={showGhost ? 'Hide the Ghost on screen' : 'Show the Ghost on screen'}
        >
          {showGhost ? 'Ghost On' : 'Ghost Off'}
        </button>

        <button type="button" className="ghost-demo-bar-btn" onClick={() => setPaused((p) => !p)}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className="ghost-demo-bar-btn ghost-demo-bar-skip" onClick={skip}>
          Stop
        </button>
      </div>
    </div>
  );
}
