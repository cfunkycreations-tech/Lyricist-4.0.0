/**
 * Demo safety net — Lyricist 4.2.0
 *
 * The Ghost Demo drives the real UI: it types into real fields and clicks real
 * buttons so the feature genuinely runs. That is the point of it, but it also
 * means a demo can overwrite work in progress. It did exactly that once — a
 * Quantum Lab lattice full of the user's own words was replaced by the demo's
 * seed words the moment the ghost clicked Load.
 *
 * Nothing the user typed may ever be lost to a demo. So before a demo starts we
 * snapshot everything it could touch, and when it ends — finished, cancelled,
 * closed, or interrupted — we put it all back.
 *
 * Tabs opt in by registering a snapshot/restore pair. Plain form fields are
 * captured automatically and need no registration.
 */

const providers = new Map();

/**
 * Register a tab's state so a demo can't destroy it.
 * Returns an unregister function suitable for a useEffect cleanup.
 */
export function registerDemoSnapshot(id, handlers) {
  providers.set(id, handlers);
  return () => providers.delete(id);
}

/** Capture registered tab state plus the value of every field on screen. */
export function captureAll() {
  const state = {};
  for (const [id, p] of providers) {
    try {
      state[id] = p.snapshot();
    } catch {
      /* a tab that can't snapshot must not block the demo */
    }
  }

  const fields = [];
  for (const el of document.querySelectorAll('input, textarea')) {
    if (el.type === 'file' || el.type === 'password') continue;
    fields.push({ el, value: el.value });
  }

  return { state, fields, at: Date.now() };
}

/** Put everything back exactly as it was. */
export function restoreAll(snap) {
  if (!snap) return;

  // Fields first, so any tab restore that reads from them sees the real values.
  for (const { el, value } of snap.fields || []) {
    if (!el.isConnected || el.value === value) continue;
    const proto = el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) desc.set.call(el, value);
    else el.value = value;
    // React listens for these, so its state follows the DOM back.
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  for (const [id, saved] of Object.entries(snap.state || {})) {
    const p = providers.get(id);
    if (!p?.restore) continue;
    try {
      p.restore(saved);
    } catch {
      /* keep restoring the others */
    }
  }
}

/**
 * Does the user have work that a demo would clobber?
 * Used to warn before starting, so the demo is never a surprise.
 */
export function hasWorkInProgress() {
  for (const [, p] of providers) {
    try {
      if (p.hasWork?.()) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}
