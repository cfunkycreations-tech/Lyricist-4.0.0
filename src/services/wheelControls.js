/**
 * EVERY SLIDER, POT AND KNOB RUNS ON THE MOUSE WHEEL.
 *
 * Chris, 2026-09-27: "I want all the knobs and the pots and the sliders to be
 * able to be run by the wheel of the mouse. So they can be fine-tuned."
 *
 * Nearly every knob in the app is an <input type="range"> underneath (Screw
 * Shop, Black Hole Studios, the FX rack, the drum machine, Mastering), so one
 * listener on the document covers all of them, including ones added later:
 *
 *   wheel          one step
 *   Shift + wheel  a tenth of a step (fine-tune)
 *   Ctrl + wheel   ten steps
 *
 * The value is set through the input's native setter and an `input` event, so
 * React's onChange fires exactly as if the thumb had been dragged. A small
 * readout floats over the control while it moves.
 *
 * It also keeps `--fill` (0–100%) on every range input current, which is what
 * lets the stylesheet paint the lit part of the slot (materials.css).
 */

const NOTCH = 50;            // pixels of trackpad scroll that count as one notch
const SCROLL_GRACE_MS = 350; // a slider passing under the pointer mid-scroll is not grabbed

let lastPageScroll = 0;
let acc = 0;
let bubble = null;
let bubbleTimer = 0;

const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;

function numAttr(el, name, fallback) {
  const v = parseFloat(el.getAttribute(name));
  return Number.isFinite(v) ? v : fallback;
}

/** One notch: the input's own step, unless that makes the full sweep take hundreds of notches. */
function baseStep(el, min, max) {
  const range = max - min;
  // Fine-tune rewrites the step to "any"; the notch keeps using the one the control shipped with.
  if (el.dataset.wheelStep === undefined) el.dataset.wheelStep = el.getAttribute('step') || '';
  const step = el.dataset.wheelStep;
  const s = step === 'any' || !step ? range / 100 : parseFloat(step);
  if (!Number.isFinite(s) || s <= 0) return range / 100;
  return range / s > 200 ? range / 100 : s;
}

function decimals(x) {
  if (!Number.isFinite(x) || x >= 1) return 0;
  return Math.min(4, Math.ceil(-Math.log10(x) - 1e-9));
}

export function syncFill(el) {
  const min = numAttr(el, 'min', 0), max = numAttr(el, 'max', 100);
  const t = max > min ? (parseFloat(el.value) - min) / (max - min) : 0;
  el.style.setProperty('--fill', `${Math.max(0, Math.min(1, t)) * 100}%`);
}

function showBubble(el, text) {
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.className = 'wheel-readout';
    document.body.appendChild(bubble);
  }
  const r = el.getBoundingClientRect();
  bubble.textContent = text;
  bubble.style.left = `${r.left + r.width / 2}px`;
  bubble.style.top = `${r.top - 6}px`;
  bubble.classList.add('on');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubble && bubble.classList.remove('on'), 900);
}

function onWheel(e) {
  const el = e.target instanceof Element ? e.target.closest('input[type="range"]') : null;
  // Custom knobs (the pad header's) turn themselves in their own onWheel. React
  // attaches that listener passive, so the page would scroll under the knob;
  // holding the page still is the one thing they need from here.
  if (!el && e.target instanceof Element && e.target.closest('[role="slider"]')) {
    e.preventDefault();
    return;
  }
  if (!el) {
    lastPageScroll = e.timeStamp;
    return;
  }
  if (el.disabled || el.dataset.wheel === 'off') return;
  // Scrolling the page and the pointer happens to cross a slider: let it scroll.
  if (e.timeStamp - lastPageScroll < SCROLL_GRACE_MS) {
    lastPageScroll = e.timeStamp;
    return;
  }
  e.preventDefault();

  // Mouse wheels send one big delta per notch; trackpads send a stream of small ones.
  const px = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
  acc += Math.abs(px) >= NOTCH ? Math.sign(px) * NOTCH : px;
  if (Math.abs(acc) < NOTCH) return;
  const notches = Math.trunc(acc / NOTCH);
  acc -= notches * NOTCH;

  const min = numAttr(el, 'min', 0), max = numAttr(el, 'max', 100);
  const base = baseStep(el, min, max);
  const mult = e.shiftKey ? 0.1 : (e.ctrlKey || e.metaKey) ? 10 : 1;
  const inc = base * mult;
  // Fine-tune goes below the input's own step, which the browser would snap back.
  if (e.shiftKey && el.getAttribute('step') !== 'any') el.setAttribute('step', 'any');

  const cur = parseFloat(el.value);
  const dp = decimals(inc);
  const next = Math.min(max, Math.max(min, +(cur - notches * inc).toFixed(dp + 1)));
  if (next === cur) return;

  valueSetter.call(el, String(next));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  syncFill(el);
  showBubble(el, next.toFixed(dp));
}

function onInput(e) {
  if (e.target instanceof HTMLInputElement && e.target.type === 'range') syncFill(e.target);
}

let started = false;
export function startWheelControls() {
  if (started || typeof document === 'undefined') return;
  started = true;
  // Capture + non-passive so the page never scrolls under a control being turned.
  document.addEventListener('wheel', onWheel, { capture: true, passive: false });
  document.addEventListener('input', onInput, true);
  // Values also change from code (presets, loading a take), so keep the fills honest.
  const sweep = () => document.querySelectorAll('input[type="range"]').forEach(syncFill);
  sweep();
  setInterval(sweep, 250);
}
