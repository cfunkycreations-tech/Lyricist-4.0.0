import { runGhostAction } from './ghostBus.js';
import { prewarm } from './GhostVoice.js';

/**
 * TEACH THE GHOST BY DOING IT.
 *
 * Chris, 2026-09-15: *"I need to take control of the mouse and go through the
 * steps of everything and record everything... and then train the ghost to do
 * exactly what I'm doing. That's the only way this is going to actually look
 * like a human is running the mouse and the computer."*
 *
 * The hand that glides to the middle of a button in a straight line is exactly
 * what reads as a robot. So nothing here invents motion. Teaching records his
 * real pointer path, clicks, scrolls and keys with their timing. A lesson plays
 * back on the real Windows cursor (main.js pilot-replay) along that same path
 * at that same speed.
 *
 * LANDING ON THE RIGHT BUTTON. A layout shifts between takes: a longer lyric, a
 * different tab scrolled. Every click remembers what it hit, and at replay the
 * path into that click is bent, gradually, onto where that control is now. The
 * motion stays his; only the last stretch is steered.
 *
 * Only the Lyricist window is recorded. That needs nothing installed.
 */

const MOVE_EVERY_MS = 16;
const IGNORE = '.gha, .gha-launch';
const INTERACTIVE = 'button, a, input, textarea, select, label, summary, [role="button"], [role="tab"], [role="slider"], [role="checkbox"], [role="radio"], [role="menuitem"], [role="option"], [data-demo], [tabindex]';
const OBS_KEY = 'lyricist.ghost.teachObs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = () => (typeof window !== 'undefined' ? window.lyricistAPI : null);

let rec = null;         // the take being recorded
let starting = false;   // OBS is coming up, recording has not begun
let playing = null;     // name of the lesson playing
let stopAsked = false;
let pending = null;     // a finished take waiting for a name
let note = '';
let obsForTake = false;

const subs = new Set();
export function teachState() {
  return {
    recording: Boolean(rec),
    starting,
    since: rec ? rec.wall : 0,
    playing,
    pending: pending ? {
      duration: pending.duration,
      clicks: pending.events.filter((e) => e.type === 'down').length,
      lines: pending.events.filter((e) => e.line).length,
    } : null,
    note,
  };
}
function emit() {
  const s = teachState();
  subs.forEach((fn) => { try { fn(s); } catch { /* a listener must not break teaching */ } });
}
export function subscribeTeach(fn) {
  subs.add(fn);
  fn(teachState());
  return () => subs.delete(fn);
}

export function getTeachObs() {
  try { return localStorage.getItem(OBS_KEY) !== '0'; } catch { return true; }
}
export function setTeachObs(on) {
  try { localStorage.setItem(OBS_KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
}

/* ---------- what a click hit, and finding it again ---------- */

const esc = (s) => (window.CSS?.escape ? window.CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));
const unique = (sel) => { try { return document.querySelectorAll(sel).length === 1; } catch { return false; } };
const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

function labelOf(el) {
  const tag = el.tagName.toLowerCase();
  const raw = tag === 'input' || tag === 'textarea' || tag === 'select'
    ? (el.getAttribute('aria-label') || el.placeholder || el.name || el.id || '')
    : (el.getAttribute('aria-label') || el.innerText || el.title || '');
  return String(raw).replace(/\s+/g, ' ').trim().slice(0, 80);
}

function cssPath(el) {
  const parts = [];
  for (let n = el; n && n.nodeType === 1 && n !== document.body && parts.length < 14; n = n.parentElement) {
    if (n.id && unique(`#${esc(n.id)}`)) { parts.unshift(`#${esc(n.id)}`); break; }
    const tag = n.tagName.toLowerCase();
    const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(n) + 1})` : tag);
  }
  return parts.join(' > ');
}

function describe(target, x, y) {
  const el = (target.closest && target.closest(INTERACTIVE)) || target;
  const r = el.getBoundingClientRect();
  const d = {
    tag: el.tagName.toLowerCase(),
    label: labelOf(el),
    fx: r.width ? (x - r.left) / r.width : 0.5,
    fy: r.height ? (y - r.top) / r.height : 0.5,
    path: cssPath(el),
  };
  const demo = el.getAttribute('data-demo');
  const aria = el.getAttribute('aria-label');
  if (demo && unique(`[data-demo="${esc(demo)}"]`)) d.sel = `[data-demo="${esc(demo)}"]`;
  else if (el.id && unique(`#${esc(el.id)}`)) d.sel = `#${esc(el.id)}`;
  else if (aria && unique(`${d.tag}[aria-label="${esc(aria)}"]`)) d.sel = `${d.tag}[aria-label="${esc(aria)}"]`;
  return d;
}

function resolve(d) {
  const tries = [];
  if (d.sel) tries.push(() => document.querySelector(d.sel));
  if (d.label) {
    tries.push(() => [...document.querySelectorAll(d.tag)]
      .find((el) => visible(el) && !el.closest(IGNORE) && labelOf(el) === d.label));
  }
  if (d.path) tries.push(() => document.querySelector(d.path));
  for (const t of tries) {
    try {
      const el = t();
      if (el && visible(el)) return el;
    } catch { /* bad selector on this page */ }
  }
  return null;
}

/* ---------- recording ---------- */

const now = () => performance.now() - rec.t0;
const push = (ev) => { rec.events.push(ev); };
let skipUp = false;

const onMove = (e) => {
  if (!rec) return;
  const t = now();
  if (t - rec.lastMove < MOVE_EVERY_MS) return;
  rec.lastMove = t;
  push({ type: 'move', t: Math.round(t), x: e.clientX, y: e.clientY });
};
const onDown = (e) => {
  if (!rec) return;
  // Pressing the Ghost's own Teach and Stop buttons is not part of the lesson.
  if (e.target.closest?.(IGNORE)) { skipUp = true; return; }
  push({ type: 'down', t: Math.round(now()), x: e.clientX, y: e.clientY, button: e.button, target: describe(e.target, e.clientX, e.clientY) });
};
const onUp = (e) => {
  if (!rec) return;
  if (skipUp) { skipUp = false; return; }
  push({ type: 'up', t: Math.round(now()), x: e.clientX, y: e.clientY, button: e.button });
};
const onWheel = (e) => {
  if (!rec || e.target.closest?.(IGNORE)) return;
  const notches = e.deltaMode === 1 ? e.deltaY / 3 : e.deltaMode === 2 ? e.deltaY : e.deltaY / 100;
  push({ type: 'wheel', t: Math.round(now()), x: e.clientX, y: e.clientY, notches });
};
const onKey = (e) => {
  if (!rec) return;
  if (e.key === 'F9' || e.key === 'F10') return;
  if (['Control', 'Shift', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
  // Never record a password.
  if (e.target?.type === 'password') return;
  if (e.target.closest?.(IGNORE)) return;
  push({ type: 'key', t: Math.round(now()), key: e.key, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey });
};

const LISTEN = [['pointermove', onMove], ['pointerdown', onDown], ['pointerup', onUp], ['wheel', onWheel], ['keydown', onKey]];

/** Start a take. OBS first when asked, so the footage covers the whole lesson. */
export async function beginTeach({ tab, obs = getTeachObs() } = {}) {
  if (rec || starting || playing) return false;
  starting = true;
  note = '';
  emit();
  obsForTake = false;
  if (obs) {
    const r = await runGhostAction('obs_record_start');
    obsForTake = Boolean(r?.ok);
    if (!obsForTake) note = `OBS did not start, so this take is recorded in the app only: ${r?.said || 'no answer'}`;
  }
  rec = {
    t0: performance.now(), wall: Date.now(), events: [], lastMove: -1e9, startTab: tab || null,
    view: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
  };
  skipUp = false;
  LISTEN.forEach(([type, fn]) => window.addEventListener(type, fn, { capture: true, passive: true }));
  starting = false;
  emit();
  return true;
}

/** End the take. It waits for a name in the Lessons view. */
export async function endTeach() {
  if (!rec) return null;
  LISTEN.forEach(([type, fn]) => window.removeEventListener(type, fn, { capture: true }));
  const take = rec;
  rec = null;
  const last = take.events.length ? take.events[take.events.length - 1].t : 0;
  pending = {
    version: 1, createdAt: take.wall, startTab: take.startTab, view: take.view, duration: last, events: take.events,
  };
  emit();
  if (obsForTake) {
    obsForTake = false;
    const r = await runGhostAction('obs_record_stop');
    if (!r?.ok) note = `OBS did not stop: ${r?.said || 'no answer'}`;
    emit();
  }
  return pending;
}

/**
 * WHAT IT SAYS, AND WHERE.
 *
 * Chris: *"walk me through training the ghost WITH VOICE."* The hands are
 * taught by doing; the words are typed afterwards. Every press in the take can
 * carry one line, and at that point in the replay the Ghost says it — in its
 * own voice, with its bubble up — and only then presses the button.
 */
export function pendingClicks() {
  if (!pending) return [];
  return pending.events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.type === 'down')
    .map(({ e, i }) => ({
      index: i,
      at: e.t,
      what: e.target?.label || e.target?.sel || e.target?.tag || 'a control',
      line: e.line || '',
    }));
}

export function setPendingLine(index, text) {
  if (!pending?.events[index]) return;
  pending.events[index].line = String(text || '');
  emit();
}

export async function savePending(name) {
  if (!pending) return null;
  const a = api();
  if (!a?.lessonSave) throw new Error('Saving a lesson needs the Creator desktop app.');
  const r = await a.lessonSave({ ...pending, name: String(name || '').trim() || `Lesson ${new Date(pending.createdAt).toLocaleString()}` });
  if (!r?.ok) throw new Error(r?.error || 'The lesson did not save.');
  pending = null;
  emit();
  return r.name;
}

export function discardPending() {
  pending = null;
  emit();
}

export async function listLessons() {
  const a = api();
  if (!a?.lessonList) return [];
  const r = await a.lessonList();
  if (!r?.ok) throw new Error(r?.error || 'Could not read the lessons folder.');
  return r.lessons;
}

export async function deleteLesson(name) {
  const r = await api()?.lessonDelete?.(name);
  if (!r?.ok) throw new Error(r?.error || 'Could not delete that lesson.');
}

export const revealLessons = () => api()?.lessonReveal?.();

/* ---------- playing it back ---------- */

export function stopLesson() {
  stopAsked = true;
  api()?.pilotReplayStop?.();
}

/**
 * Play a lesson on the real cursor.
 *
 * The take is cut at every press. Before each stretch the button it ends on is
 * found on screen (waiting for it if a tab is still loading), and that stretch
 * is sent to main.js in one go, so the motion inside it is never held up by the
 * renderer. The pause he left between stretches is kept.
 */
export async function playLesson(name, { obs = false } = {}) {
  const a = api();
  if (!a?.pilotReplay || !a?.lessonLoad) throw new Error('Playing a lesson needs the Creator desktop app.');
  if (playing) throw new Error(`"${playing}" is already playing.`);
  if (rec || starting) throw new Error('Stop teaching before playing a lesson.');
  const loaded = await a.lessonLoad(name);
  if (!loaded?.ok) throw new Error(loaded?.error || 'That lesson would not load.');
  const lesson = loaded.lesson;

  playing = lesson.name || name;
  stopAsked = false;
  note = '';
  emit();
  let obsOn = false;
  const misses = [];
  try {
    if (obs) {
      const r = await runGhostAction('obs_record_start');
      obsOn = Boolean(r?.ok);
      if (!obsOn) note = `OBS did not start: ${r?.said || 'no answer'}`;
    }
    if (lesson.startTab) {
      await runGhostAction('open_tab', { tab: lesson.startTab });
      await sleep(700);
    }

    const ev = lesson.events || [];
    // Make every line before the first one is needed, so each one plays the
    // moment its press comes up instead of after a wait for the voice.
    const lines = ev.map((e) => e.line).filter(Boolean);
    if (lines.length) prewarm(lines);
    let i = 0;
    let prev = { dx: 0, dy: 0 };
    let prevEnd = ev.length ? ev[0].t : 0;
    while (i < ev.length && !stopAsked) {
      const began = performance.now();
      let j = i;
      while (j < ev.length && ev[j].type !== 'down') j++;
      const down = j < ev.length ? ev[j] : null;
      // The stretch ends on the RELEASE, not the press: the button must never
      // sit held down while the next target is being looked for.
      let end = j;
      if (down) {
        while (end + 1 < ev.length && ev[end + 1].type !== 'up' && ev[end + 1].type !== 'down') end++;
        if (end + 1 < ev.length && ev[end + 1].type === 'up') end++;
      }
      const seg = ev.slice(i, Math.min(end + 1, ev.length));

      let delta = prev;
      if (down?.target) {
        let el = resolve(down.target);
        const deadline = performance.now() + 5000;
        while (!el && performance.now() < deadline && !stopAsked) {
          await sleep(120);
          el = resolve(down.target);
        }
        if (el) {
          let r = el.getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight) {
            el.scrollIntoView({ block: 'center' });
            await sleep(250);
            r = el.getBoundingClientRect();
          }
          delta = {
            dx: r.left + down.target.fx * r.width - down.x,
            dy: r.top + down.target.fy * r.height - down.y,
          };
        } else {
          misses.push(down.target.label || down.target.sel || down.target.path);
        }
      }
      if (stopAsked) break;

      // Keep the pause he left before this stretch, minus the time spent finding the button.
      const gap = seg[0].t - prevEnd - (performance.now() - began);
      if (gap > 0) await sleep(gap);

      // SAY IT, THEN DO IT. The line finishes before the hand moves, the way a
      // person talks a viewer through what they are about to press.
      if (down?.line) {
        await runGhostAction('say', { text: down.line });
        if (stopAsked) break;
      }

      const t0 = seg[0].t;
      const span = Math.max(1, (down ? down.t : seg[seg.length - 1].t) - t0);
      const out = seg.map((e) => {
        if (e.type === 'key') return { type: 'key', t: e.t - t0, key: e.key, ctrl: e.ctrl, alt: e.alt, shift: e.shift, meta: e.meta };
        const k = down ? Math.min(1, (e.t - t0) / span) : 0;
        return {
          type: e.type,
          t: e.t - t0,
          x: e.x + prev.dx + (delta.dx - prev.dx) * k,
          y: e.y + prev.dy + (delta.dy - prev.dy) * k,
          button: e.button,
          notches: e.notches,
        };
      });
      const r = await a.pilotReplay(out);
      if (r && r.ok === false) throw new Error(r.error || 'The replay stopped.');
      if (r?.stopped) stopAsked = true;

      prevEnd = seg[seg.length - 1].t;
      prev = delta;
      i = end + 1;
    }
    return { ok: !stopAsked, stopped: stopAsked, misses };
  } finally {
    if (obsOn) await runGhostAction('obs_record_stop');
    if (misses.length) note = `Could not find: ${misses.slice(0, 3).join(', ')}${misses.length > 3 ? '…' : ''}`;
    playing = null;
    emit();
  }
}
