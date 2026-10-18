/**
 * YOUR OWN AI SERVER, IN PLACE OF OPENROUTER, FOR THE WRITING TOOLS.
 *
 * Settings → "Your own AI server". Anything that speaks the OpenAI chat API
 * works: OmniRoute, LM Studio, Ollama, a vLLM box. When it is on and filled in,
 * every text call in openrouter.js#chatCompletion goes here instead, with the
 * model they named. Pictures (Song Forge / Mastering cover art) and voices stay
 * on OpenRouter, because a local text server can't draw or speak.
 *
 * It never falls back to OpenRouter on its own. A server that is down says so,
 * names the address, and says how to switch it off — the same rule as never
 * swapping a model they picked for one they didn't.
 *
 * On the desktop the call goes through the main process (main.js, 'custom-ai'):
 * the window's CSP only lets it reach OpenRouter, and a local server rarely
 * sends CORS headers. On the phone it is a plain fetch, so the server has to
 * be https and allow CORS.
 */

/** What assertApiKey hands back in this mode when there is no OpenRouter key. */
export const NO_OPENROUTER_KEY = 'own-ai-server';

export const PRESETS = [
  { name: 'OmniRoute', url: 'http://localhost:20128/v1' },
  { name: 'LM Studio', url: 'http://localhost:1234/v1' },
  { name: 'Ollama', url: 'http://localhost:11434/v1' },
];

const unquote = (v) => String(v ?? '').trim().replace(/^["'“”]+|["'“”]+$/g, '');

/** "localhost:1234/v1/chat/completions/" -> "http://localhost:1234/v1" */
export function normalizeBaseUrl(raw) {
  let u = unquote(raw).replace(/\/+(chat\/completions|completions|models)\/*$/i, '').replace(/\/+$/, '');
  if (u && !/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = `http://${u}`;
  return u;
}

export const normalizeKey = (raw) => unquote(raw).replace(/^Bearer\s+/i, '');

/** { url, key, model } when it is switched on and usable, else null. */
export function customAIFrom(config) {
  if (!config?.customAiOn) return null;
  const url = normalizeBaseUrl(config.customAiUrl);
  const model = String(config.customAiModel || '').trim();
  if (!url || !model) return null;
  return { url, model, key: normalizeKey(config.customAiKey) };
}

/** Can the writing tools write? An OpenRouter key, or their own server. */
export const hasWritingAI = (config) =>
  Boolean(String(config?.openRouterApiKey || '').trim()) || Boolean(customAIFrom(config));

// Set by LyricStore whenever the settings change; read by chatCompletion,
// which is called from places that never see the config.
let active = null;
export function setCustomAI(config) { active = customAIFrom(config); }
export const activeCustomAI = () => active;

/** The address as a person would say it: host only, never a path or query. */
export function hostOf(url) {
  try { return new URL(url).host; } catch { return String(url || ''); }
}

const OFF_HINT = 'or switch "Your own AI server" off in Settings to use OpenRouter.';

/**
 * One request to their server. path is 'chat/completions' or 'models'.
 * Resolves { ok, status, json, message }; status 0 means it was never reached.
 * An abort rejects, as fetch does.
 */
export async function customRequest(path, { url, key, body, signal } = {}) {
  const where = hostOf(url);
  let status = 0;
  let text = '';
  let failed = '';

  const bridge = typeof window !== 'undefined' ? window.lyricistAPI?.customAI : null;
  if (bridge) {
    const call = bridge({ url, path, key, body });
    const r = signal
      ? await Promise.race([call, new Promise((_, reject) => {
        if (signal.aborted) reject(new DOMException('Aborted', 'AbortError'));
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      })])
      : await call;
    status = r?.status || 0;
    text = r?.text || '';
    failed = r?.error || '';
  } else {
    // A phone or browser page is https, and it may not call an http address
    // other than its own machine (mixed content), so say that plainly.
    const page = typeof location !== 'undefined' ? location.protocol : '';
    if (page === 'https:' && /^http:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url)) {
      return { ok: false, status: 0, json: null, message: `On a phone or in a browser your AI server's address has to start with https:// (${where} is http). Use a tunnel, ${OFF_HINT}` };
    }
    const headers = { Accept: 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;
    if (body) headers['Content-Type'] = 'application/json';
    try {
      const res = await fetch(`${url}/${path}`, {
        method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, signal,
      });
      status = res.status;
      text = await res.text();
    } catch (e) {
      if (signal?.aborted) throw e;
      failed = 'Could not connect.';
    }
  }

  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  const ok = status >= 200 && status < 300;
  if (ok) return { ok, status, json, message: '' };
  if (!status) {
    return { ok, status, json, message: `Could not reach your AI server at ${where}${failed && failed !== 'Could not connect.' ? ` (${failed})` : ''}. Make sure it is running, ${OFF_HINT}` };
  }
  const said = json?.error?.message || json?.error || json?.message || text.slice(0, 200) || `status ${status}`;
  const hint = status === 401 || status === 403
    ? 'Check the key for it in Settings, '
    : (status === 404 ? 'Check the address and the model name in Settings, ' : 'Check it in Settings, ');
  return { ok, status, json, message: `Your AI server at ${where} answered ${status}: ${typeof said === 'string' ? said : JSON.stringify(said)}. ${hint}${OFF_HINT}` };
}

// OpenRouter-only fields. Most servers ignore what they don't know; a strict
// one refuses the whole request over them.
const OPENROUTER_ONLY = ['provider', 'reasoning', 'models', 'transforms', 'route', 'plugins', 'usage'];

/** The chat body with their model in and OpenRouter's extras out. */
export function customChatBody(body, model) {
  const out = { ...body, model };
  OPENROUTER_ONLY.forEach((k) => { delete out[k]; });
  return out;
}

// A server that is down fails every call the same way, and a few callers walk
// a list of models on failure. Within a few seconds, say so again without
// knocking on the same closed door.
let down = null;
const DOWN_MS = 5000;

export async function customChat(body, { signal } = {}) {
  const ai = active;
  if (down && down.url === ai.url && Date.now() - down.at < DOWN_MS) return down.result;
  const r = await customRequest('chat/completions', { url: ai.url, key: ai.key, body: customChatBody(body, ai.model), signal });
  down = r.status === 0 ? { url: ai.url, at: Date.now(), result: r } : null;
  return r;
}
