/**
 * In-app replacements for alert(), confirm() and prompt().
 *
 * The browser's own boxes are a grey Windows dialog dropped on top of a studio
 * made of brushed nickel, they freeze the whole app (audio scheduling included)
 * while they're up, and they title themselves "localhost says". These render
 * inside Lyricist Pro instead, through <DialogHost/> (components/common).
 *
 *   notify(message, { tone })            a toast; tone 'info' | 'ok' | 'error'
 *   ask(message, { ok, cancel, danger }) resolves true / false
 *   askText(message, defaultValue)       resolves the text, or null if cancelled
 */

let host = null;          // set by <DialogHost/> when it mounts
const early = [];         // anything asked before the host exists

function send(req) {
  if (host) host(req);
  else early.push(req);
}

export function registerDialogHost(fn) {
  host = fn;
  if (fn) while (early.length) fn(early.shift());
  return () => { if (host === fn) host = null; };
}

export function notify(message, { tone = 'info', ms } = {}) {
  send({ kind: 'toast', message: String(message), tone, ms: ms ?? (tone === 'error' ? 7000 : 4500) });
}

export function ask(message, { ok = 'OK', cancel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => send({ kind: 'ask', message: String(message), ok, cancel, danger, resolve }));
}

export function askText(message, defaultValue = '', { ok = 'OK', cancel = 'Cancel' } = {}) {
  return new Promise((resolve) => send({ kind: 'text', message: String(message), value: defaultValue, ok, cancel, resolve }));
}
