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
 */
export async function runGhostAction(name, args = {}) {
  const fn = handlers.get(name);
  if (!fn) {
    return { ok: false, said: `I cannot do "${name}" from here. Open the tab it belongs to first.` };
  }
  try {
    const said = await fn(args);
    return { ok: true, said: said || null };
  } catch (e) {
    return { ok: false, said: e?.message || `"${name}" did not work.` };
  }
}
