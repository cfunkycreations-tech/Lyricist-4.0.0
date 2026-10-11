/**
 * HOW THE GHOST REACHES THE REST OF THE APP.
 *
 * Chris, 2026-08-21: *"can you make the demo ghost an AI that would just always
 * be available to help run the app, write lyrics, write the specific prompts
 * needed to use MiniMax, and just help with anything in the app?"* And when
 * asked how far it should reach: **everything**, including pressing things.
 *
 * So the ghost needs to set the lyrics box, change the length, roll a take
 * number and press Make the song. Threading callbacks for all of that from App
 * down through every tab would mean touching every tab in the app to add a
 * feature that lives outside all of them.
 *
 * Instead each tab REGISTERS the handful of things it is willing to have done
 * to it, by name, while it is mounted. The ghost asks for an action by name and
 * either it is registered or it is not. Two things fall out of that and both
 * matter:
 *
 *   - A tab that is not open cannot be driven, because its handlers are not
 *     registered. The ghost has to open the tab first, exactly like a person.
 *   - The list of what is possible is the list of what is registered. Nothing
 *     is reachable by accident, and the ghost can be told the truth about what
 *     it can do right now rather than guessing and failing.
 *
 * This is deliberately not a general event bus with strings flying everywhere.
 * It is a registry with one owner per action.
 */

/**
 * The Ghost is the creator's tool only (Chris, 2026-09-15), so the hand that
 * shows each action is loaded only in a creator build. In a customer build this
 * folds to null and ghostHands.js / ghostCursor.js never enter the bundle.
 *
 * `?.` so plain Node (the check scripts) can import this file: there
 * `import.meta.env` does not exist. Vite still folds it, verified both ways:
 * a customer build emits no Ghost chunk and a creator build emits all of them.
 */
export const PILOT_ENABLED = import.meta.env?.VITE_FAFO_INTERNAL_BUILD === 'true';
const loadHands = PILOT_ENABLED
  ? () => Promise.all([import('./ghostHands.js'), import('./ghostCursor.js')])
  : null;
let hands = null;

import { record, snapshot, visibleTab, clipText } from './ghostRecorder.js';

const handlers = new Map();
const watchers = new Set();

/**
 * Offer an action for as long as the caller is mounted.
 * Returns the unregister function, so it drops straight into a useEffect.
 */
export function registerGhostAction(name, fn) {
  handlers.set(name, fn);
  watchers.forEach((w) => { try { w(); } catch { /* a listener must not break a register */ } });
  return () => {
    // Only remove it if it is still ours: a remount can register the new copy
    // before the old copy's cleanup runs, and blindly deleting there would
    // leave the action unavailable while its owner is on screen.
    if (handlers.get(name) === fn) {
      handlers.delete(name);
      watchers.forEach((w) => { try { w(); } catch { /* as above */ } });
    }
  };
}

/** Register several at once. Same contract, one unregister for the lot. */
export function registerGhostActions(map) {
  const offs = Object.entries(map).map(([name, fn]) => registerGhostAction(name, fn));
  return () => offs.forEach((off) => off());
}

/**
 * Let React catch up.
 *
 * A tab's handlers read state from the render they were made in, so an action
 * that sets the artist and then presses Write in the same tick writes for the
 * OLD artist. Actions set what they need, wait for this, and then call the
 * handler from the fresh render (every tab keeps its latest handlers in a ref).
 */
export const ghostSettle = (ms = 120) => new Promise((r) => setTimeout(r, ms));

/** What can be done right now, given what is on screen. */
export function availableGhostActions() {
  return [...handlers.keys()].sort();
}

/** Tell me when that list changes. */
export function watchGhostActions(fn) {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

/**
 * Do one thing.
 *
 * Resolves { ok, said } either way rather than throwing: a bad action is
 * something the ghost has to be able to report and recover from mid-answer, not
 * an exception that eats the rest of the reply.
 *
 * A HANDLER MAY HAND BACK A WAY TO UNDO ITSELF, and one that overwrites work
 * has to. Chris asked the Ghost for a song, said yes, and watched every line of
 * lyrics vanish. Guarding the empty case stops that exact bug and nothing else:
 * a full, confident, wrong replacement erases just as much work and passes
 * every guard. So a handler can return
 *
 *   { said, undo: { action, args, label }, warn }
 *
 * instead of a bare sentence. `undo` puts a real button next to the tick in the
 * conversation, `warn` says in plain words what does not look right about what
 * it just did. A plain string still works and still means "no undo needed".
 */
/**
 * WHICH TAB OWNS AN ACTION, so the Ghost opens it itself.
 *
 * Chris's test run, 2026-09-15: "✗ I cannot do set_lyrics from here. Open the
 * tab it belongs to first." A person would just open the tab, so the bus does.
 */
const ACTION_TAB = [
  [/^songwriter_/, 'songwriter'],
  [/^ghostrider_/, 'analyzer'],
  [/^songforge_/, 'songforge'],
  [/^matrix_/, 'quantum'],
  [/^(blackhole_|set_lyrics$|append_lyrics$|write_caption$|set_caption$|set_length$|set_takes$|roll_take_number$|set_engine$|lay_out_song$|make_the_song$|stop$)/, 'onemanband'],
];
export const tabForAction = (name) => ACTION_TAB.find(([re]) => re.test(name))?.[1] || null;

const waitFor = async (name, ms) => {
  let fn = handlers.get(name);
  for (let waited = 0; !fn && waited < ms; waited += 100) {
    await new Promise((r) => setTimeout(r, 100));
    fn = handlers.get(name);
  }
  return fn;
};

/**
 * What every tab looks like right now, in its own words (each tab's describe_*
 * answer). The flight recorder writes it after every action, so a log shows
 * not just what the Ghost pressed but what the tab held afterwards.
 */
const DESCRIBER = { songwriter: 'describe_songwriter', analyzer: 'describe_ghostrider', quantum: 'describe_matrix', songforge: 'describe_songforge', onemanband: 'describe_song' };
export async function peekTabs(tabIds = null) {
  const out = [];
  const wanted = tabIds ? new Set(tabIds.map((id) => DESCRIBER[id]).filter(Boolean)) : null;
  for (const [name, fn] of handlers) {
    if (!name.startsWith('describe_') || name === 'describe_controls') continue;
    if (wanted && !wanted.has(name)) continue;
    try { out.push(String(await fn({}) || '').trim()); } catch { /* a tab that cannot say is skipped */ }
  }
  return out.filter(Boolean).join('\n');
}

const QUIET = /^(describe_|say$)/;
export async function runGhostAction(name, args = {}) {
  if (QUIET.test(name)) {
    if (name === 'say') record('say', String(args?.text || ''));
    return runGhostActionInner(name, args);
  }
  const started = Date.now();
  record('action', `${name} ${clipText(args && Object.keys(args).length ? args : '', 300)}`.trim());
  const r = await runGhostActionInner(name, args);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  record('result', `${r.ok ? '✓' : '✗'} ${clipText(r.said || (r.ok ? 'done' : 'failed'), 400)}${r.warn ? `  ⚠ ${clipText(r.warn, 200)}` : ''} (${secs}s)`);
  // What the tab it acted on (and the one on screen) holds now.
  const owner = tabForAction(name);
  // Let React commit what the action set, or the tab reads back its old state.
  await new Promise((ok) => setTimeout(ok, 250));
  const look = await peekTabs([owner, visibleTab()].filter(Boolean)).catch(() => '');
  if (look) record('state', `after ${name}`, look);
  snapshot(name);
  // Let it be seen before the next one (the hand speed's hold; none with hands off).
  try { if (hands) await hands[1].holdAfterAction(); } catch { /* the show never blocks the work */ }
  return r;
}

async function runGhostActionInner(name, args = {}) {
  // A tab mounts on its first open, and its actions register in an effect a
  // frame or two after that. "open_tab" then "songwriter_write_song" in the
  // same breath used to fail on the second one for no reason a person would
  // see, so give a freshly opened tab a moment to hand its controls over.
  let fn = await waitFor(name, handlers.has(name) ? 0 : 600);
  const owner = tabForAction(name);
  // With the hand showing, the Ghost works where it can be seen: an action for
  // a tab that is mounted but hidden used to run there unseen while the hand
  // hovered over whatever tab was in front. A run with the hand off (a batch
  // nobody is watching) still works in the background.
  if (loadHands) hands ||= await loadHands().catch(() => null);
  const watched = Boolean(hands) && hands[1].getHandSpeed() !== 'off';
  const pane = owner && typeof document !== 'undefined' && document.querySelector(`[data-tab-pane="${owner}"]`);
  const hidden = !pane || pane.style.display === 'none';
  if (owner && handlers.get('open_tab') && (!fn || (watched && hidden))) {
    // Seen going there, not just teleported: the hand presses the tab first.
    try { if (watched) await hands[0].ghostBefore('open_tab', { tab: owner }); } catch { /* the show never blocks the work */ }
    try { await handlers.get('open_tab')({ tab: owner }); } catch { /* reported below */ }
    fn = await waitFor(name, 4000);
  }
  if (!fn) {
    return { ok: false, said: `"${name}" is not something any tab offers.` };
  }
  try {
    // Show it the way a person would do it, then do it. See BEFORE in ghostHands.js.
    // Creator builds only; a customer build runs the action with no hand.
    if (loadHands) {
      hands ||= await loadHands();
      const [{ ghostBefore }, { handStopped }] = hands;
      if (handStopped()) return { ok: false, said: 'stopped' };
      await ghostBefore(name, args);
      if (handStopped()) return { ok: false, said: 'stopped' };
    }
    const out = await fn(args);
    if (out && typeof out === 'object') {
      // A handler that says { ok: false } has refused. Reporting that as a tick
      // told the user it worked when the action had rejected the command.
      if (out.ok === false) {
        return { ok: false, said: out.said || out.error || `"${name}" did not work.`, undo: null, warn: out.warn || null };
      }
      return { ok: true, said: out.said || null, undo: out.undo || null, warn: out.warn || null };
    }
    return { ok: true, said: out || null };
  } catch (e) {
    return { ok: false, said: e?.message || `"${name}" did not work.` };
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   GHOST PILOT — the robotics door.

   The registry above is the PUBLIC bus: tabs offer named actions, the Ghost
   asks for them, and all of it ships to customers. What follows is the
   INTERNAL side — the visual robotics layer that drives an on-screen cursor,
   synthesises DOM events, narrates through the voice engine and remote-controls
   OBS Studio, so marketing videos can be recorded hands-free.

   IT MUST NOT SHIP. The machinery therefore does not live in this file, which
   is statically imported by App.jsx and by half the tabs and consequently ends
   up in the bundle no matter what any flag says. It lives in ghostPilot.js and
   obsClient.js behind the dynamic import below, so that in a commercial build
   `PILOT_ENABLED` folds to false, the import() becomes unreachable, and Rollup
   emits no chunk for either module. See components/Ghost/GhostPilotLayer.jsx
   for the full explanation of the mechanism.

   What is left here is the door: one constant and one function, both of which
   compile away to a stub that immediately reports the layer is not present.
   ══════════════════════════════════════════════════════════════════════════ */

// PILOT_ENABLED is defined at the top of this file, beside the hand loader.
const loadPilotModule = PILOT_ENABLED ? () => import('./ghostPilot.js') : null;
let pilotModule = null;

/**
 * Run an array of GhostAction objects through the visual executor.
 *
 * Resolves { ok, error } rather than throwing, exactly like runGhostAction
 * above and for the same reason: a script that cannot run is something to
 * report, not an exception that takes the page with it.
 */
export async function runGhostPilot(actions) {
  if (!loadPilotModule) {
    return { ok: false, error: 'The Ghost Pilot robotics layer is not part of this build.' };
  }
  try {
    pilotModule ||= await loadPilotModule();
    return await pilotModule.runGhostScript(actions);
  } catch (e) {
    return { ok: false, error: e?.message || 'Ghost Pilot could not run that script.' };
  }
}
