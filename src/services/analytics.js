/**
 * PRODUCT ANALYTICS — PostHog.
 *
 * What is measured here is FEATURE ADOPTION: which tabs get opened, which
 * engines get run, where people stop. That is the whole brief and it is also
 * the whole permitted scope.
 *
 * ══ WHAT NEVER LEAVES THIS MACHINE ════════════════════════════════════════
 * No lyric text. No keywords. No prompts. No model output. No file paths. No
 * file names. No audio. No API keys. Not truncated, not hashed, not "just the
 * first few words" — none of it, in any form.
 *
 * That is not only policy, it is enforced twice on the way out:
 *
 *   1. Every call goes through sanitize() below, which drops any property whose
 *      NAME looks like content or a path, and any string value long enough or
 *      shaped enough to be one.
 *   2. autocapture and session recording are OFF. Autocapture is the real
 *      hazard in an app like this: left on, PostHog records the text content of
 *      clicked elements and the values of inputs, which in a lyrics editor is
 *      the user's song. It is disabled explicitly rather than left to default.
 *
 * The sanitiser is a backstop, not the plan. Callers pass counts and ids; if
 * one ever passes something else, the wrong thing is dropped here instead of
 * shipped. See the deny lists.
 *
 * ══ WHY THE SDK IS LOADED DYNAMICALLY ═════════════════════════════════════
 * `import('posthog-js')` inside the configured branch, never at module scope.
 *
 * Lyricist Pro's footer says Air-Gapped Safe and that has to be TRUE for the
 * build a customer installs. With a static import the SDK would sit in the
 * bundle and run its initialisation on every launch whether or not a key
 * existed. Dynamic import behind the key check means a build with no
 * VITE_POSTHOG_KEY never fetches the chunk, never executes a line of it, and
 * opens no sockets. Analytics is opt-in AT BUILD TIME, by the person cutting
 * the release, and isEnabled() is what the UI reads so the footer can tell the
 * truth about which build this is.
 *
 * Every entry point is fire-and-forget and swallows its own errors. An
 * analytics call must never be the reason a songwriter loses a verse, so
 * offline, firewalled, ad-blocked and misconfigured all resolve to "nothing
 * happened" rather than to an exception.
 */

const KEY = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

/** Configured at build time? The footer and Settings both read this. */
export function isEnabled() {
  return Boolean(KEY);
}

/**
 * Has this person turned it off?
 *
 * Read BEFORE the SDK is asked to do anything, and read from localStorage
 * rather than from PostHog's own opt-out state, because PostHog's lives inside
 * the SDK and the whole point is not to load the SDK for someone who said no.
 * The Settings switch writes this same entry.
 */
const OPTOUT_KEY = 'lyricist.analytics.optout';
function optedOut() {
  try { return localStorage.getItem(OPTOUT_KEY) === '1'; } catch { return false; }
}

/**
 * THE LOADER IS A MODULE-LEVEL TERNARY, and that shape is load-bearing.
 *
 * Measured, not assumed. With the import() sitting inside initAnalytics()
 * behind a runtime `if (!isEnabled()) return`, Rollup correctly folded
 * isEnabled() down to `return false` — and still emitted the whole 250 KB
 * posthog-js chunk, because a dynamic import inside a live function is
 * reachable code as far as the bundler is concerned. Nothing ever fetched it,
 * but every commercial installer carried a quarter of a megabyte of telemetry
 * SDK, which makes "no telemetry of any kind is bundled in this build" a lie
 * by a technicality.
 *
 * Hoisted out here, `KEY` folds to undefined, `loadPostHog` folds to null, the
 * arrow function holding the import() is a dead ternary branch, and the chunk
 * is never emitted at all. Same mechanism as the Ghost Pilot gate — see
 * components/Ghost/GhostPilotLayer.jsx.
 */
const loadPostHog = KEY ? () => import('posthog-js') : null;

/**
 * PROPERTY NAMES THAT ARE NEVER SENT, whatever they contain.
 *
 * Matched as substrings against the lowercased key, so `lyricText`,
 * `verse_body` and `promptForModel` are all caught by one entry each.
 */
const DENY_KEY = [
  'lyric', 'verse', 'chorus', 'text', 'body', 'content', 'prompt', 'caption',
  'word', 'keyword', 'phrase', 'title', 'name', 'path', 'file', 'dir', 'folder',
  'url', 'email', 'key', 'token', 'secret', 'password', 'auth', 'artist',
  'query', 'search', 'message', 'transcript', 'audio', 'sample', 'note',
];

/** Values that are content-shaped no matter what they are called. */
const MAX_STRING = 40;          // an id or an enum, not a sentence
const PATHISH = /[\\/]|^[a-z]:|\.[a-z0-9]{2,4}$/i;

/**
 * Strip anything that could carry user content.
 *
 * Only primitives survive, and only short, non-path-shaped strings among them.
 * Objects and arrays are dropped whole rather than walked: a nested structure
 * is exactly where a lyric would hide, and there is no event in this app that
 * needs one.
 */
function sanitize(props) {
  const out = {};
  if (!props || typeof props !== 'object') return out;

  for (const [k, v] of Object.entries(props)) {
    const key = String(k).toLowerCase();
    if (DENY_KEY.some((bad) => key.includes(bad))) continue;

    if (typeof v === 'number' && Number.isFinite(v)) { out[k] = v; continue; }
    if (typeof v === 'boolean') { out[k] = v; continue; }
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s || s.length > MAX_STRING || PATHISH.test(s) || s.includes(' ')) continue;
      out[k] = s;
      continue;
    }
    // null, undefined, objects, arrays, functions: dropped.
  }
  return out;
}

let client = null;         // the posthog module once it has loaded
let loading = null;        // the in-flight load, shared by every caller
let dead = false;          // load failed once; stop trying
const queue = [];          // events fired before the SDK finished loading

/** Hand the queue over once the client is up. Never throws. */
function drain() {
  if (!client) return;
  while (queue.length) {
    const [event, props] = queue.shift();
    try { client.capture(event, props); } catch { /* a dropped event is fine */ }
  }
}

/**
 * Load and configure PostHog. Idempotent, safe to call from anywhere, and
 * resolves to null rather than rejecting when analytics is off or unreachable.
 */
export function initAnalytics() {
  if (!loadPostHog || dead || optedOut()) return Promise.resolve(null);
  if (client) return Promise.resolve(client);
  if (loading) return loading;

  loading = loadPostHog()
    .then(({ default: posthog }) => {
      posthog.init(KEY, {
        api_host: HOST,

        // ── THE PRIVACY CONFIGURATION ──────────────────────────────────────
        // autocapture records the text of clicked elements and the values of
        // form fields. In a lyrics editor that IS the user's song, so it is off
        // and must stay off.
        autocapture: false,
        disable_session_recording: true,
        session_recording: { maskAllInputs: true, maskTextSelector: '*' },
        // Pageviews are captured by hand from the tab router — this app is one
        // HTML document, so the automatic ones would all read as "/index.html".
        capture_pageview: false,
        capture_pageleave: false,
        // The URL of a file:// Electron window carries the install path.
        // Nothing about the location is useful and some of it is personal.
        sanitize_properties: (properties) => {
          const p = { ...properties };
          delete p.$current_url;
          delete p.$pathname;
          delete p.$host;
          delete p.$referrer;
          delete p.$referring_domain;
          delete p.$initial_current_url;
          delete p.$initial_pathname;
          return p;
        },
        // No IP-based geolocation, and do not sit on a persistent cookie: this
        // is a desktop install, localStorage is enough to keep one anonymous id
        // stable without writing a tracking cookie.
        ip: false,
        persistence: 'localStorage',
        // Let the SDK fail quietly rather than logging into the user's console.
        loaded: () => {},
      });
      client = posthog;
      drain();
      return posthog;
    })
    .catch(() => {
      // Offline, firewalled, blocked by an extension, or the package is not
      // installed in this checkout. All four mean the same thing here.
      dead = true;
      queue.length = 0;
      return null;
    });

  return loading;
}

/**
 * Record that something happened.
 *
 * `props` is sanitised before it goes anywhere — see the deny lists above.
 * Fire-and-forget: nothing to await, nothing to catch, and it does nothing at
 * all in a build with no key.
 */
export function track(event, props = {}) {
  if (!loadPostHog || dead || optedOut()) return;
  const clean = sanitize(props);
  if (client) {
    try { client.capture(event, clean); } catch { /* never break a feature */ }
    return;
  }
  // Fired during startup, before the SDK finished loading. Hold a bounded
  // number so a burst of tab switches on a dead connection cannot grow forever.
  if (queue.length < 50) queue.push([event, clean]);
  initAnalytics();
}

/**
 * Stop collecting for this install. Wired to the Settings switch.
 *
 * Drops the queue as well as telling the SDK: anything sitting in it was
 * captured before the person said no, and sending it after they said no is
 * precisely the thing they asked not to happen.
 */
export function optOut() {
  queue.length = 0;
  try { client?.opt_out_capturing?.(); } catch { /* nothing to stop */ }
}

/** Resume collecting after an opt-out. */
export function optIn() {
  try { client?.opt_in_capturing?.(); } catch { /* nothing to resume */ }
  // The SDK may never have loaded — if they opted out before first launch,
  // this is where it finally starts.
  initAnalytics();
}
