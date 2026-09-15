/**
 * THE GHOST'S HAND ON SCREEN. SHIPS TO CUSTOMERS.
 *
 * Chris, 2026-09-15, on how the Ghost should work: *"Visible, like a person"*,
 * and customers get it too, with a ghost cursor drawn inside the app.
 *
 * This is NOT the Ghost Pilot. The pilot (ghostPilot.js, behind the gate in
 * GhostPilotLayer.jsx) drives the operating system's real mouse through nut-js
 * for internal OBS recordings and never reaches an installer. This file only
 * draws: a cursor that glides to the control the Ghost is about to use, a ring
 * when it presses, letters appearing in a box one at a time, and a caption for
 * what it is saying. Nothing here can touch anything outside the app window.
 *
 * The state lives in this module rather than in React so every caller (the
 * press/fill/choose hands, the named-action table, the say action) moves the
 * same one hand without threading props through eighteen tabs. GhostHand.jsx
 * subscribes and draws it.
 */

const HANDS_KEY = 'lyricist.ghost.hands';

/**
 * How it moves. "off" means no hand at all: actions run instantly, which is
 * what an overnight batch nobody is watching wants.
 */
const SPEEDS = {
  normal: { moveMin: 280, moveMax: 750, perPx: 0.9, scroll: 450, press: 170, perChar: 28, typeMax: 2200, smooth: true },
  fast:   { moveMin: 90,  moveMax: 220, perPx: 0.3, scroll: 250, press: 70,  perChar: 12, typeMax: 450,  smooth: true },
  off:    null,
};
export const HAND_SPEED_NAMES = Object.keys(SPEEDS);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const state = {
  x: typeof window !== 'undefined' ? window.innerWidth - 140 : 0,
  y: typeof window !== 'undefined' ? window.innerHeight - 90 : 0,
  dur: 0,
  visible: false,
  pressed: false,
  typing: false,
  ring: 0,
  caption: '',
};
const subscribers = new Set();
const emit = () => {
  const snap = { ...state };
  subscribers.forEach((fn) => { try { fn(snap); } catch { /* a listener must not break the hand */ } });
};

export const readHand = () => ({ ...state });
export function subscribeHand(fn) {
  subscribers.add(fn);
  fn({ ...state });
  return () => subscribers.delete(fn);
}

export function getHandSpeed() {
  try {
    const v = localStorage.getItem(HANDS_KEY);
    return v && v in SPEEDS ? v : 'normal';
  } catch {
    return 'normal';
  }
}
export function setHandSpeed(name) {
  const v = name in SPEEDS ? name : 'normal';
  try { localStorage.setItem(HANDS_KEY, v); } catch { /* storage blocked: session only */ }
  if (v === 'off') { state.visible = false; emit(); }
  return v;
}
const speed = () => SPEEDS[getHandSpeed()];

/**
 * STOP MEANS STOP. The Stop button sets this, and every step of motion and
 * typing checks it, so a run halts mid-word rather than finishing the job it
 * was told to abandon. The next thing the Ghost is asked to do clears it.
 */
let stopped = false;
export function stopHand() {
  stopped = true;
  Object.assign(state, { pressed: false, typing: false, caption: '' });
  emit();
}
export const resetHandStop = () => { stopped = false; };
export const handStopped = () => stopped;
function checkStop() {
  if (stopped) throw new Error('Stopped.');
}

let hideTimer = null;
function wake() {
  clearTimeout(hideTimer);
  if (!state.visible) {
    // Appear where it was last, so the first glide starts from somewhere real.
    state.visible = true;
    state.dur = 0;
    emit();
  }
}
function idleSoon() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (state.typing || state.caption) return;
    state.visible = false;
    emit();
  }, 3500);
}

function fullyOnScreen(r) {
  return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
}

/** Glide to the middle of an element, scrolling it into view first if needed. */
export async function moveHandTo(el) {
  const sp = speed();
  if (!sp || !el) return;
  checkStop();
  wake();
  let r = el.getBoundingClientRect();
  if (!fullyOnScreen(r)) {
    try { el.scrollIntoView({ block: 'center', behavior: sp.smooth ? 'smooth' : 'auto' }); } catch { /* old engines */ }
    await sleep(sp.scroll);
    checkStop();
    r = el.getBoundingClientRect();
  }
  // Never off the edge of the window. A control inside a clipped or
  // horizontally scrolled panel can report a position outside the viewport, and
  // a hand that glides off screen reads as the Ghost wandering away mid-demo.
  const x = Math.min(window.innerWidth - 12, Math.max(12, r.left + Math.min(r.width / 2, 60)));
  const y = Math.min(window.innerHeight - 12, Math.max(12, r.top + r.height / 2));
  const dur = Math.round(Math.min(sp.moveMax, Math.max(sp.moveMin, Math.hypot(x - state.x, y - state.y) * sp.perPx)));
  Object.assign(state, { x, y, dur });
  emit();
  await sleep(dur + 30);
  idleSoon();
}

/** Glide there and show a press. Does not click: the caller decides what the press does. */
export async function pressHand(el) {
  const sp = speed();
  if (!sp || !el) return;
  await moveHandTo(el);
  checkStop();
  Object.assign(state, { pressed: true, ring: state.ring + 1 });
  emit();
  await sleep(sp.press);
  state.pressed = false;
  emit();
  idleSoon();
}

/**
 * Type into a box the way a person would be seen to.
 *
 * `setValue` does the actual writing (the caller knows whether it is a React
 * input, a textarea or a contenteditable). A long text is written in chunks so
 * a whole song still appears in about two seconds instead of a minute.
 */
export async function typeWithHand(el, text, setValue) {
  const sp = speed();
  const t = String(text ?? '');
  if (!sp || !el) { setValue(t); return; }
  await pressHand(el);
  try { el.focus({ preventScroll: true }); } catch { /* not focusable */ }
  state.typing = true;
  emit();
  try {
    const steps = Math.max(1, Math.min(t.length, Math.ceil(sp.typeMax / sp.perChar)));
    const chunk = Math.max(1, Math.ceil(t.length / steps));
    if (!t.length) setValue('');
    for (let i = chunk; i < t.length + chunk; i += chunk) {
      checkStop();
      setValue(t.slice(0, Math.min(i, t.length)));
      await sleep(sp.perChar);
    }
  } finally {
    state.typing = false;
    emit();
    idleSoon();
  }
}

/** A line of narration by the hand. Shown even with the voice off, so a silent viewer still follows. */
export function captionHand(text) {
  const line = String(text || '').trim();
  if (!line || !speed()) return;
  wake();
  state.caption = line;
  emit();
}
export function clearCaption() {
  if (!state.caption) return;
  state.caption = '';
  emit();
  idleSoon();
}
