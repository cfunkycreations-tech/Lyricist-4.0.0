/**
 * EVERY OPENROUTER CALL GOES THROUGH HERE, ON THE OFFICIAL SDK.
 *
 * One client setup means one attribution: every request carries the same
 * HTTP-Referer and title, which is what OpenRouter's app rankings count. Before
 * this, seven call sites sent two different URLs and five different names.
 *
 * The SDK's typed request has no `reasoning.exclude` and its parsed result has
 * no `provider`, and both matter here (the scratchpad must stay out of lyrics;
 * AIService reports who served a call). So the exact wire body is sent through
 * the SDK's beforeRequest hook, and callers get OpenRouter's raw JSON back,
 * with the status, whatever the SDK's own parser thought of it.
 */
import { OpenRouter, HTTPClient } from '@openrouter/sdk';
import { noteModelFailure } from './modelFit.js';
import { record, clipText } from './ghostRecorder.js';

export const APP_URL = 'https://cfunkycreationsllc.com';
export const APP_TITLE = 'Lyricist Pro';

function client(apiKey, body) {
  const seen = { res: null };
  const http = new HTTPClient();
  http.addHook('beforeRequest', (req) => {
    const headers = new Headers(req.headers);
    headers.set('X-Title', APP_TITLE);
    const init = { headers };
    if (body && req.method !== 'GET') {
      init.body = JSON.stringify(body);
      headers.set('Content-Type', 'application/json');
    }
    return new Request(req, init);
  });
  http.addHook('response', (res) => { seen.res = res.clone(); });
  // The title goes out as X-Title only (set in the hook): it's the header the
  // packaged app has always sent from file://, so OpenRouter's CORS is known to
  // allow it. The SDK's newer X-OpenRouter-Title is left off until it's proven.
  const sdk = new OpenRouter({
    apiKey: apiKey || undefined,
    httpReferer: APP_URL,
    httpClient: http,
    // The Ghost switches model on a fast 429; SDK retries would sit on it.
    retryConfig: { strategy: 'none' },
  });
  return { sdk, seen };
}

/**
 * Run one SDK call. Resolves { ok, status, json, res, message }; status 0 means
 * OpenRouter was never reached. An abort rejects, as fetch does.
 */
async function run(apiKey, call, { body, signal, binary } = {}) {
  const { sdk, seen } = client(apiKey, body);
  try {
    await call(sdk, { signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    if (!seen.res) return { ok: false, status: 0, json: null, res: null, message: e?.message || 'Could not reach OpenRouter.' };
    // An HTTP error, or a reply the SDK's schema didn't expect: use the raw reply.
  }
  const res = seen.res;
  const ok = res.status >= 200 && res.status < 300;
  if (binary && ok) return { ok, status: res.status, json: null, res, message: '' };
  let json = null;
  try { json = JSON.parse(await res.text()); } catch { /* not JSON */ }
  const message = ok ? '' : (json?.error?.message || res.statusText || `OpenRouter answered ${res.status}.`);
  return { ok, status: res.status, json, res, message };
}

/** POST /chat/completions with a wire-format body. */
export async function chatCompletion(body, { apiKey, signal } = {}) {
  const started = Date.now();
  const asked = (body.messages || [])
    .map((m) => `${String(m.role).toUpperCase()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
    .join('\n\n');
  let r;
  try {
    r = await run(apiKey, (sdk, o) => sdk.chat.send(
      { chatRequest: { model: body.model, messages: [{ role: 'user', content: '' }] } },
      { signal: o.signal },
    ), { body, signal });
  } catch (e) {
    record('ai', `${body.model} ✗ ${e?.message || 'aborted'} (${((Date.now() - started) / 1000).toFixed(1)}s)`, `ASKED:\n${asked}`);
    throw e;
  }
  // The flight recorder: every AI call, what was asked and what came back.
  const reply = r.json?.choices?.[0]?.message?.content;
  const served = r.json?.model && r.json.model !== body.model ? ` (served by ${r.json.model})` : '';
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const lastAsk = (body.messages || []).filter((m) => m.role === 'user').pop()?.content;
  record(
    'ai',
    `${body.model}${served} ${r.ok ? '✓' : `✗ ${r.status} ${r.message}`} ${secs}s · asked: ${clipText(typeof lastAsk === 'string' ? lastAsk.replace(/\s+/g, ' ') : '', 140)}`,
    `ASKED:\n${asked}\n\nANSWERED:\n${typeof reply === 'string' ? reply : clipText(reply ?? r.message ?? '', 4000)}`,
  );
  // A model that can never work here (agent-only, no longer free) is
  // remembered, so the model list says so and the free chains skip it.
  if (!r.ok) noteModelFailure(body.model, r.message);
  return r;
}

/** POST /audio/speech. On success `res` holds the audio. */
export function createSpeech(body, { apiKey, signal } = {}) {
  return run(apiKey, (sdk, o) => sdk.tts.createSpeech(
    { speechRequest: { model: body.model, input: body.input || '' } },
    { signal: o.signal },
  ), { body, signal, binary: true });
}

/**
 * The model catalogue, raw (snake_case, as the API sends it). With a key it
 * also merges the account's own list, where stealth models tend to show up.
 */
export async function listModels(apiKey) {
  const calls = [run(null, (sdk) => sdk.models.list())];
  if (apiKey) calls.push(run(apiKey, (sdk) => sdk.models.listForUser({ bearer: apiKey })));
  const byId = new Map();
  let reached = false;
  for (const r of await Promise.all(calls)) {
    if (!r.ok) continue;
    reached = true;
    (r.json?.data || []).forEach((m) => byId.set(m.id, m));
  }
  if (!reached) throw new Error('OpenRouter did not answer.');
  return [...byId.values()];
}

const verified = new Map();          // id -> { at, result }
const VERIFY_TTL = 10 * 60 * 1000;

/**
 * Is this model really on OpenRouter right now, with a provider serving it?
 *   { state: 'live', providers, name }
 *   { state: 'dead', reason }   404, or listed with no endpoints (the
 *                                "No endpoints found for ..." error)
 *   { state: 'unknown', reason } offline, or OpenRouter had a bad moment
 * Only 'dead' is a reason to change anything.
 */
export async function verifyModel(id, apiKey) {
  const model = String(id || '').trim();
  const hit = verified.get(model);
  if (hit && Date.now() - hit.at < VERIFY_TTL) return hit.result;
  const result = await check(model, apiKey);
  if (result.state !== 'unknown') verified.set(model, { at: Date.now(), result });
  return result;
}

async function check(model, apiKey) {
  const at = model.indexOf('/');
  if (at <= 0 || at === model.length - 1) {
    return { state: 'dead', reason: 'not an OpenRouter model id (it needs provider/model)' };
  }
  const author = model.slice(0, at);
  const slug = model.slice(at + 1);
  // models.get takes variant suffixes like :free and returns the endpoints;
  // endpoints.list is the second opinion for anything it doesn't know.
  const got = await run(apiKey, (sdk) => sdk.models.get({ author, slug }));
  let r = got;
  let endpoints = got.json?.data?.endpoints;
  if (!got.ok || !Array.isArray(endpoints)) {
    r = await run(apiKey, (sdk) => sdk.endpoints.list({ author, slug }));
    endpoints = r.json?.data?.endpoints;
  }
  if (r.ok && Array.isArray(endpoints)) {
    if (!endpoints.length) {
      // An alias like "Claude Haiku Latest" has no endpoints of its own: it
      // forwards to the current model, and calls to it work. So an empty list
      // is a question, not a verdict. Ask with one real token.
      const probe = await probeModel(model, apiKey);
      if (probe === 'answers') return { state: 'live', providers: null, name: r.json?.data?.name || got.json?.data?.name || model };
      if (probe === 'no-endpoints') return { state: 'dead', reason: 'OpenRouter lists it, but no provider is serving it' };
      return { state: 'unknown', reason: 'OpenRouter lists it with no providers, and a test call did not answer' };
    }
    return { state: 'live', providers: endpoints.length, name: r.json?.data?.name || got.json?.data?.name || model };
  }
  if (got.status === 404 && r.status === 404) {
    // Third opinion before calling it dead, since dead gets the model replaced:
    // the catalogue itself, account list included.
    const list = await listModels(apiKey).catch(() => null);
    const listed = list?.find((m) => m.id === model);
    if (listed) return { state: 'live', providers: null, name: listed.name || model };
    if (list) return { state: 'dead', reason: 'not on OpenRouter' };
  }
  return { state: 'unknown', reason: r.message || got.message || 'OpenRouter did not answer' };
}

/**
 * What to tell someone whose call came back "No endpoints found for <model>".
 *
 * That error does NOT mean the model is gone. Stealth models (e.g.
 * stealth/space-bunny-alpha) log every prompt, so an account whose privacy
 * settings refuse logging or training providers, or that has Zero Data
 * Retention on, has no endpoint it is allowed to use. Only if the model
 * itself is gone from OpenRouter is "pick another" the answer.
 */
/** " (reason)", unless the reason just repeats "not on OpenRouter". */
export const why = (v) => (v.reason && v.reason !== 'not on OpenRouter' ? ` (${v.reason})` : '');

export async function noEndpointsHelp(model, apiKey) {
  const v = await verifyModel(model, apiKey);
  if (v.state === 'dead') return `${model} isn't on OpenRouter any more${why(v)}. Pick another model in Settings.`;
  return [
    `OpenRouter has ${model}, but your account's settings rule out every provider serving it ("No endpoints found").`,
    '',
    'Stealth models log every prompt. At https://openrouter.ai/settings/privacy:',
    '  1. Allow providers that may log or train on your prompts.',
    '  2. Turn Zero Data Retention (ZDR) off.',
    'Then run it again here.',
  ].join('\n');
}

/**
 * The one real test: a tiny call. Only a 404 counts against the model; any
 * other answer (even a 400 over the 1-token budget) means OpenRouter routed it.
 */
export async function probeModel(model, apiKey) {
  if (!apiKey) return 'unknown';
  const r = await chatCompletion({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }, { apiKey });
  if (r.ok || (r.status && r.status !== 404)) return 'answers';
  return r.status === 404 ? 'no-endpoints' : 'unknown';
}
