/**
 * THE GHOST'S HANDS: PRESS, FILL AND CHOOSE ANYTHING ON SCREEN, BY ITS NAME.
 *
 * Chris, 2026-09-15: *"It needs to be able to push all buttons, write songs and
 * lyrics on any tab or page."*
 *
 * Named actions (ghostBus) are the dependable way to drive a tab, because they
 * call the same code the button does and report what came back. But eighteen
 * tabs have hundreds of controls between them, and a control nobody wrote an
 * action for would otherwise be a thing the Ghost simply cannot touch. So this
 * is the fallback: find the control on the tab that is showing, by the words a
 * person would use for it, and operate it the way a person would.
 *
 * It only ever looks inside the visible tab pane (App.jsx tags each one with
 * data-tab-pane), so it cannot press a button on a hidden tab that happens to
 * share a name, and it never touches the Ghost's own panel.
 *
 * VISIBLE, LIKE A PERSON (Phase 2). Everything here moves the drawn hand from
 * ghostCursor.js first: it glides to the control, a ring shows the press, and
 * words appear in a box letter by letter. With the hand switched off the same
 * calls run instantly.
 */
import {
  pressHand, moveHandTo, typeWithHand, handStopped, getHandSpeed,
} from './ghostCursor.js';

const BUTTONS = [
  'button', '[role="button"]', '[role="tab"]', '[role="option"]', '[role="checkbox"]',
  '[role="switch"]', '[role="menuitem"]', 'a[href]', 'summary',
  'input[type="checkbox"]', 'input[type="radio"]', 'input[type="button"]', 'input[type="submit"]',
].join(',');
const FIELDS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"]):not([type="hidden"]), textarea, select, [contenteditable="true"]';

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const clip = (s, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The tab pane that is on screen right now. */
export function activePane() {
  const panes = [...document.querySelectorAll('[data-tab-pane]')];
  return panes.find((p) => p.style.display !== 'none') || document.body;
}

function visible(el) {
  if (!el || el.closest('.gha, .gha-launch')) return false;
  if (!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)) {
    // A styled checkbox is often hidden behind its label. Still operable.
    return el.matches('input[type="checkbox"], input[type="radio"]') && !!el.closest('label');
  }
  return getComputedStyle(el).visibility !== 'hidden';
}

function buttonName(el) {
  if (el.matches('input[type="checkbox"], input[type="radio"]')) return fieldName(el);
  return norm(el.getAttribute('aria-label') || el.innerText || el.value || el.title || '');
}

/**
 * Every name a box goes by, the one a person would say first.
 *
 * Placeholder-first was wrong: most boxes here carry an example as their
 * placeholder ("e.g. city lights - midnight") and their real name in the label
 * above, so asking to fill "keywords" or "topic" found nothing. The label wins
 * now, and the placeholder, aria-label, name and id still match as well.
 */
function fieldNames(el) {
  const names = [];
  if (el.id) {
    const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (lab) names.push(lab.innerText);
  }
  const wrap = el.closest('label');
  if (wrap) names.push(wrap.innerText);
  // The common layout here: a small label element sitting just above the box.
  let prev = el.previousElementSibling || el.parentElement?.previousElementSibling;
  for (let i = 0; prev && i < 3; i++, prev = prev.previousElementSibling) {
    const t = norm(prev.innerText);
    if (t && t.length < 60) { names.push(t); break; }
  }
  names.push(
    el.getAttribute('aria-label'),
    el.getAttribute('placeholder'),
    el.name,
    el.id && el.id.replace(/[-_]+/g, ' '),
  );
  return [...new Set(names.map(norm).filter(Boolean))];
}
const fieldName = (el) => fieldNames(el)[0] || '';

function score(name, want) {
  if (!name || !want) return 0;
  if (name === want) return 4;
  if (name.startsWith(want)) return 3;
  if (name.includes(want)) return 2;
  if (want.includes(name) && name.length > 2) return 1;
  return 0;
}

/**
 * Best match for a name, retried for a moment: a tab the Ghost just opened may
 * still be mounting, and a panel it just expanded may still be drawing.
 */
async function find(selector, namesOf, label, index = 0, patience = 1500) {
  const want = norm(label);
  if (!want) throw new Error('Say which control, by the name on it.');
  for (let waited = 0; waited <= patience; waited += 150) {
    const hits = [...activePane().querySelectorAll(selector)]
      .filter(visible)
      .map((el) => ({ el, s: Math.max(0, ...[].concat(namesOf(el)).map((n) => score(n, want))) }))
      .filter((h) => h.s > 0);
    if (hits.length) {
      const best = Math.max(...hits.map((h) => h.s));
      const top = hits.filter((h) => h.s === best);
      return top[Math.min(Number(index) || 0, top.length - 1)].el;
    }
    if (patience) await wait(150);
  }
  return null;
}

/** A glow on the control as it is used. Kept with the hand off too, so a fast run still leaves a trail. */
function glow(el) {
  const { outline, outlineOffset } = el.style;
  el.style.outline = '2px solid #9ba1aa';
  el.style.outlineOffset = '2px';
  setTimeout(() => { el.style.outline = outline; el.style.outlineOffset = outlineOffset; }, 900);
}

/** React keeps its own copy of an input's value; set it the way React will notice. */
function setNativeValue(el, value) {
  if (el.isContentEditable) {
    el.textContent = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function notStopped() {
  if (handStopped()) throw new Error('Stopped.');
}

export async function pressControl({ label, index } = {}) {
  notStopped();
  const el = await find(BUTTONS, buttonName, label, index);
  if (!el) throw new Error(`There is no "${label}" button on this tab.`);
  glow(el);
  await pressHand(el);
  notStopped();
  if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
    throw new Error(`"${clip(buttonName(el))}" is greyed out right now, so it cannot be pressed yet.`);
  }
  el.click();
  return `pressed "${clip(buttonName(el) || label)}"`;
}

export async function fillControl({ field, text = '' } = {}) {
  notStopped();
  const el = await find(FIELDS, fieldNames, field);
  if (!el) throw new Error(`There is no "${field}" box on this tab.`);
  if (el instanceof HTMLSelectElement) return chooseControl({ field, option: text });
  glow(el);
  await typeWithHand(el, String(text), (v) => setNativeValue(el, v));
  return `filled "${clip(fieldName(el) || field)}"`;
}

export async function chooseControl({ field, option } = {}) {
  notStopped();
  const want = norm(option);
  if (!want) throw new Error('Say which option to pick.');
  if (field) {
    const sel = await find('select', fieldNames, field);
    if (sel) {
      const opts = [...sel.options];
      const hit = opts.find((o) => norm(o.text) === want || norm(o.value) === want)
        || opts.find((o) => norm(o.text).includes(want) || norm(o.value).includes(want));
      if (!hit) throw new Error(`"${option}" is not one of the choices in "${field}".`);
      glow(sel);
      await pressHand(sel);
      setNativeValue(sel, hit.value);
      return `picked "${clip(hit.text)}" in "${clip(fieldName(sel) || field)}"`;
    }
  }
  // Most pickers in this app are rows of chips, not dropdowns.
  return pressControl({ label: option });
}

/* ------------------------------------------------------------------ */
/* the hand, for named actions                                         */
/* ------------------------------------------------------------------ */

/**
 * WHAT A NAMED ACTION LOOKS LIKE WHEN A PERSON DOES IT.
 *
 * songwriter_write_song calls the tab's own handler directly, which is the
 * right way to do the work and shows nothing on screen at all. So before a
 * named action runs, the hand does what a person would visibly do for it:
 * types the topic into the topic box, glides to Generate Full Song and
 * presses. The handler then does the real work.
 *
 * Kept as one table here rather than inside each tab, so the look of every
 * action is in one place, and a step that cannot find its control is simply
 * skipped. The show is never allowed to get in the way of the work: a named
 * action can run on a tab that is not showing, and then there is nothing to
 * point at and it just runs.
 */
const BEFORE = {
  songwriter_set_topic: [{ type: '[placeholder^="e.g. city lights"]', arg: 'topic' }],
  songwriter_set_artist: [{ type: '[placeholder^="e.g. Kendrick Lamar, Bob"]', arg: 'artist' }],
  songwriter_set_notes: [{ type: '[placeholder^="e.g. keep it clean"]', arg: 'notes' }],
  songwriter_write_song: [{ point: '[data-demo="sw-generate"]' }],
  songwriter_fill_blanks: [{ label: 'fill [blank]' }],

  ghostrider_study: [{ type: '[data-demo="gr-artist"]', arg: 'artist' }, { point: '[data-demo="gr-analyze"]' }],
  ghostrider_write: [
    { type: '[data-demo="gr-artist"]', arg: 'artist' },
    { type: '[placeholder^="Optional Topic"]', arg: 'topic' },
    { point: '[data-demo="gr-write"]' },
  ],
  ghostrider_send_to_songwriter: [{ point: '[data-demo="gr-send"]' }],
  ghostrider_save_song: [{ point: '[data-demo="gr-save-song"]' }],
  ghostrider_send_dna_to_matrix: [{ label: 'send to matrix' }],

  songforge_forge: [{ point: '[data-demo="sf-forge"]' }],
  songforge_surprise: [{ label: 'surprise me' }],
  songforge_remix_art: [{ label: 'remix art' }],
  songforge_send_to_songwriter: [{ point: '[data-demo="sf-send"]' }],

  matrix_load_keywords: [{ type: '#ql-kw-input', arg: 'keywords' }, { point: '[data-demo="ql-load"]' }],
  matrix_autocraft: [
    { type: '#ql-kw-input', arg: 'keywords' },
    { point: '[data-demo="ql-load"]', onlyWith: 'keywords' },
    { point: '[data-demo="matrix-autocraft"]' },
  ],
  matrix_send_to_songwriter: [{ point: '[data-demo="ql-send-songwriter"]' }],
  matrix_send_to_forge: [{ point: '[data-demo="ql-send-forge"]' }],

  // Black Hole Studios. None of these had an entry, so on that tab the Ghost
  // talked about writing the caption and making the song from wherever it
  // was last parked, usually over its own Ask the Ghost button.
  set_lyrics: [{ point: '[data-demo="omb-lyrics"]' }],
  append_lyrics: [{ point: '[data-demo="omb-lyrics"]' }],
  restore_lyrics: [{ point: '[data-demo="omb-lyrics"]' }],
  blackhole_pull_from_songwriter: [{ point: '[data-demo="omb-pull"]' }],
  lay_out_song: [{ point: '[data-demo="omb-shape"]' }],
  write_caption: [{ point: '[data-demo="omb-rewrite"]' }],
  set_caption: [{ point: '[data-demo="omb-caption"]' }],
  restore_caption: [{ point: '[data-demo="omb-caption"]' }],
  set_length: [{ point: '[data-demo="omb-length"]' }],
  set_takes: [{ point: '[data-demo="omb-takes"]' }],
  roll_take_number: [{ point: '[data-demo="omb-takes"]' }],
  set_engine: [{ point: '[data-demo="omb-engine"]' }],
  make_the_song: [{ point: '[data-demo="omb-make"]' }],
  make_the_video: [{ point: '[data-demo="omb-video"]' }],
  stop: [{ point: '[data-demo="omb-make"]' }],
};

/** Actions that are not a control being used, so the hand stays put. */
const NO_SHOW = /^(describe_|say$|set_voice$|play_lesson$|press$|fill$|choose$|obs_)/;

const bare = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The tab button for a tab, by id or by the name on it. The tab bar groups
 * tabs, so when the tab's own square is not showing, its group button is.
 */
function tabButton(tab) {
  const want = bare(tab);
  if (!want) return null;
  const squares = [...document.querySelectorAll('[data-tab-id]')].filter(visible);
  const hit = squares.find((b) => bare(b.dataset.tabId) === want || bare(b.innerText) === want)
    || squares.find((b) => want.length > 3 && bare(b.innerText).includes(want));
  if (hit) return hit;
  return [...document.querySelectorAll('[data-tab-ids]')].filter(visible).find((b) => (
    b.dataset.tabIds.split(' ').some((id) => bare(id) === want)
    || (want.length > 3 && bare(b.dataset.help).includes(want))
  )) || null;
}

/** Somewhere on the tab worth hovering over when an action has no control of its own. */
function paneLandmark(pane) {
  return [...pane.querySelectorAll('h1, h2, h3, header, [role="heading"]')].find(visible) || null;
}

const asText = (v) => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v));

export async function ghostBefore(name, args = {}) {
  if (getHandSpeed() === 'off' || NO_SHOW.test(name)) return;
  // Opening a tab is a press on the tab bar, which sits outside every pane.
  if (name === 'open_tab') {
    const el = tabButton(args.tab);
    if (el && !handStopped()) {
      try { glow(el); await pressHand(el); } catch { /* stopped */ }
    }
    return;
  }
  const pane = activePane();
  if (pane === document.body) return;
  const steps = BEFORE[name];
  // No entry: still go to the tab it is working on, never hover in a corner.
  if (!steps) {
    const el = paneLandmark(pane);
    if (el && !handStopped()) {
      try { await moveHandTo(el); } catch { /* stopped */ }
    }
    return;
  }
  for (const step of steps) {
    if (handStopped()) return;
    try {
      if (step.onlyWith && !asText(args[step.onlyWith]).trim()) continue;
      if (step.type) {
        const value = asText(args[step.arg]);
        if (!value.trim()) continue;
        const box = pane.querySelector(step.type);
        const field = box && (box.matches(FIELDS) ? box : box.querySelector(FIELDS));
        if (!field || !visible(field)) continue;
        glow(field);
        await typeWithHand(field, value, (v) => setNativeValue(field, v));
      } else {
        const el = step.point
          ? pane.querySelector(step.point)
          : await find(BUTTONS, buttonName, step.label, 0, 0);
        if (!el || !visible(el)) continue;
        glow(el);
        await pressHand(el);
      }
    } catch {
      return;   // stopped, or the control moved: the action itself still decides
    }
  }
}

/**
 * WHERE TO LOOK WHILE IT TALKS.
 *
 * A job says a step's line first and only then asks the model what to press,
 * so for the whole sentence the hand used to sit where it started, over the
 * Ask the Ghost button. This reads the step for the tab and the control it is
 * about and glides there as the line starts. Move only, nothing is pressed.
 */
const STEP_AIMS = [
  [/caption/i, '[data-demo="omb-rewrite"]'],
  [/make the song|generate|render|record (it|the song)/i, '[data-demo="omb-make"], [data-demo="sw-generate"], [data-demo="sf-forge"]'],
  [/lyric|words/i, '[data-demo="omb-lyrics"]'],
  [/topic/i, '[placeholder^="e.g. city lights"]'],
  [/length|long|seconds|minutes/i, '[data-demo="omb-length"]'],
  [/engine|cloud|kaggle/i, '[data-demo="omb-engine"]'],
  [/takes?\b/i, '[data-demo="omb-takes"]'],
  [/keywords?/i, '#ql-kw-input'],
  [/artist/i, '[data-demo="gr-artist"]'],
];

/** Every tab on the tab bar by the name on it, read off the group buttons. */
export function tabsByName() {
  const out = [];
  for (const g of document.querySelectorAll('[data-tab-ids]')) {
    const ids = g.dataset.tabIds.split(' ');
    const names = String(g.dataset.help || '').replace(/^[^:]*:/, '').replace(/\.$/, '').split(',').map((t) => t.trim());
    names.forEach((label, i) => { if (label && ids[i]) out.push({ label, id: ids[i] }); });
  }
  return out;
}

export async function aimForStep(text = '') {
  if (getHandSpeed() === 'off' || handStopped()) return;
  const t = String(text);
  try {
    // A tab named in the step that is not the one showing: point at its tab.
    const named = tabsByName()
      .map((tab) => ({ ...tab, at: t.toLowerCase().indexOf(tab.label.toLowerCase()) }))
      .filter((tab) => tab.at >= 0)
      .sort((a, b) => a.at - b.at)[0];
    const pane = activePane();
    if (named && pane?.dataset?.tabPane !== named.id) {
      const el = tabButton(named.id);
      if (el) { await moveHandTo(el); return; }
    }
    if (pane === document.body) return;
    for (const [re, sel] of STEP_AIMS) {
      if (!re.test(t)) continue;
      const el = [...pane.querySelectorAll(sel)].find(visible);
      if (el) { await moveHandTo(el); return; }
    }
    const land = paneLandmark(pane);
    if (land) await moveHandTo(land);
  } catch { /* stopped, or nothing to aim at */ }
}

/** What can be pressed and filled on the tab that is showing, for the Ghost to read. */
export function describeControls() {
  const pane = activePane();
  if (pane === document.body) return '';
  const buttons = [];
  for (const el of pane.querySelectorAll(BUTTONS)) {
    if (!visible(el)) continue;
    const n = buttonName(el);
    if (!n || n.length > 60) continue;
    const label = el.disabled ? `${n} (greyed out)` : n;
    if (!buttons.includes(label)) buttons.push(label);
    if (buttons.length >= 80) break;
  }
  const fields = [];
  for (const el of pane.querySelectorAll(FIELDS)) {
    if (!visible(el)) continue;
    const n = fieldName(el);
    if (!n) continue;
    const v = el instanceof HTMLSelectElement ? el.options[el.selectedIndex]?.text || ''
      : el.isContentEditable ? el.textContent : el.value;
    fields.push(`"${clip(n, 40)}" = "${clip(norm(v), 40)}"`);
    if (fields.length >= 30) break;
  }
  return [
    `CONTROLS ON THE TAB THAT IS SHOWING (use press / fill / choose with these names):`,
    buttons.length ? `Buttons: ${buttons.join(' | ')}` : 'Buttons: none',
    fields.length ? `Boxes: ${fields.join('; ')}` : 'Boxes: none',
  ].join('\n');
}
