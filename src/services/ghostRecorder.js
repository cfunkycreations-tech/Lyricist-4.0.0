/**
 * THE GHOST'S FLIGHT RECORDER.
 *
 * Chris, 2026-10-10: "You need a way to be able to go back and log everything
 * that it does. On every tab. Because I can't explain it to you."
 *
 * So everything goes in one timeline: every action the Ghost takes and what
 * came back, what each tab looked like straight after, every AI call (model,
 * prompt, reply, time), every spoken line, every chat message, every job step,
 * every tab change, every button pressed, and every error. In the desktop app
 * it is also written to disk line by line as it happens (Documents\Lyricist
 * Ghost Logs\<this session>\log.txt, with a screenshot after each Ghost
 * action), so a crash cannot lose it. "Copy log" puts a compact copy on the
 * clipboard to paste straight into a chat.
 */

// Creator builds only, like the Ghost itself: a customer's prompts are never written to their disk.
const ON = import.meta.env?.VITE_FAFO_INTERNAL_BUILD === 'true';
const MAX = 4000;
const KEEP_KEY = 'lyricist.ghost.flight';
const events = [];
const subs = new Set();
let seq = 0;

const api = () => (typeof window !== 'undefined' ? window.lyricistAPI : null);

// The last session's log survives a restart, so a run that crashed the app can still be read.
try {
  const kept = JSON.parse(localStorage.getItem(KEEP_KEY) || '[]');
  if (Array.isArray(kept)) events.push(...kept.slice(-1500));
} catch { /* nothing kept */ }

let saveTimer = null;
function keep() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // Clipped: the full prompts and replies are on disk; this must not eat the space his key and picks live in.
    try { localStorage.setItem(KEEP_KEY, JSON.stringify(events.slice(-1500).map((e) => (e.full ? { ...e, full: clip(e.full, 700) } : e)))); } catch { /* full: memory and disk still have it */ }
  }, 800);
}

const clip = (v, n) => {
  const s = typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })();
  return s && s.length > n ? `${s.slice(0, n)}… (${s.length} chars)` : (s || '');
};

const stamp = (t) => {
  const d = new Date(t);
  return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

/** Which tab is on screen right now, by the name on its button. */
export function visibleTab() {
  if (typeof document === 'undefined') return '';
  const pane = [...document.querySelectorAll('[data-tab-pane]')].find((p) => p.style.display !== 'none');
  return pane?.dataset.tabPane || '';
}
let tabNames = {};
export const setTabNames = (map) => { tabNames = map || {}; };
const tabName = (id) => tabNames[id] || id || '?';

/**
 * One line of the timeline. `full` holds long text (a whole prompt, a whole
 * reply) for the file on disk; the compact copy for a chat trims it.
 */
export function record(kind, text, full = null) {
  if (!ON) return null;
  const e = { n: ++seq, t: Date.now(), kind, tab: visibleTab(), text: String(text ?? ''), full: full ? String(full) : null };
  events.push(e);
  if (events.length > MAX) events.splice(0, events.length - MAX);
  keep();
  try { api()?.ghostLogAppend?.(formatOne(e, { full: true }))?.catch?.(() => {}); } catch { /* browser */ }
  subs.forEach((fn) => { try { fn(e); } catch { /* a viewer must not break the recorder */ } });
  return e;
}

/** A screenshot of the window, saved next to the log on disk. Desktop only. */
export function snapshot(label) {
  if (!ON) return;
  try { api()?.ghostLogShot?.(`${String(seq).padStart(4, '0')} ${label}`)?.catch?.(() => {}); } catch { /* browser */ }
}

export function subscribeRecorder(fn) { subs.add(fn); return () => subs.delete(fn); }
export const recorded = () => events.slice();

export function clearRecorder() {
  events.length = 0;
  try { localStorage.removeItem(KEEP_KEY); } catch { /* blocked */ }
  record('note', 'log cleared');
}

const MARK = {
  action: '▶', result: '  ', state: '  ≡', field: '  ✎', ai: '  ⇄', say: '  🗣', you: '👤', ghost: '👻', job: '⚙', tab: '⇥', click: '•', error: '‼', note: '·',
};

export function formatOne(e, { full = false } = {}) {
  const body = full && e.full ? `${e.text}\n${e.full.split('\n').map((l) => `      | ${l}`).join('\n')}` : e.text;
  return `${stamp(e.t)} [${tabName(e.tab)}] ${MARK[e.kind] || '·'} ${body}`;
}

/** The whole log as text. `compact` trims long prompts and replies for pasting into a chat. */
export function formatLog({ compact = true, last = 0 } = {}) {
  const list = last ? events.slice(-last) : events;
  const head = `LYRICIST PRO GHOST LOG · ${new Date().toLocaleString()} · ${list.length} events\n`;
  return head + list.map((e) => formatOne(compact ? { ...e, full: e.full ? clip(e.full, 700) : null } : e, { full: true })).join('\n');
}

export const clipText = clip;

/**
 * Buttons pressed (by him or by the Ghost's hand), tab changes and errors.
 * Installed once, in the creator build only.
 */
let installed = false;
export function installRecorder() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const say = (el) => {
    const t = (el.getAttribute('aria-label') || el.textContent || el.title || el.value || '').replace(/\s+/g, ' ').trim();
    return clip(t, 60) || el.dataset.demo || el.tagName.toLowerCase();
  };
  window.addEventListener('click', (ev) => {
    const el = ev.target?.closest?.('button, [role="button"], [role="radio"], [role="tab"], a, input[type="checkbox"], select');
    if (!el || el.closest('.gha-flight')) return;
    record('click', `${ev.isTrusted ? 'pressed' : 'Ghost pressed'} "${say(el)}"${el.dataset.demo ? ` (${el.dataset.demo})` : ''}`);
  }, { capture: true, passive: true });
  window.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el?.tagName !== 'SELECT') return;
    record('click', `picked "${clip(el.options[el.selectedIndex]?.text || el.value, 60)}" in ${clip(el.getAttribute('aria-label') || el.name || 'a list', 40)}`);
  }, { capture: true, passive: true });
  window.addEventListener('error', (ev) => record('error', clip(ev.message || 'script error', 300), ev.error?.stack || null));
  window.addEventListener('unhandledrejection', (ev) => record('error', `unhandled: ${clip(ev.reason?.message || String(ev.reason), 300)}`, ev.reason?.stack || null));
  record('note', 'recorder on');
}
