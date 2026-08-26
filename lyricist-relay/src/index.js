/**
 * LYRICIST KAGGLE RELAY
 *
 * One Man Band is the best thing in Lyricist and it is the one feature that
 * cannot work in a browser on its own. A phone cannot call Kaggle's API
 * directly: the browser blocks the cross-origin request and Kaggle sends no
 * CORS headers, so the call dies before it leaves the device.
 *
 * This is the shim that fixes that, and it is deliberately as dumb as
 * possible.
 *
 * ============================================================================
 * IT HOLDS NO SECRETS. READ THIS BEFORE CHANGING ANYTHING.
 * ============================================================================
 * The user's own Kaggle token rides through in the Authorization header,
 * exactly as it already does in the desktop app, and is never read, logged or
 * stored here. Nobody's songs run on Chris's Kaggle account and nobody spends
 * his 30 weekly GPU hours. Every person brings their own account, same as the
 * desktop app has always asked them to.
 *
 * The temptation, when someone eventually says "make it work without the user
 * needing a Kaggle account", will be to put HIS token in a secret here. Do not.
 * That is one shared account funding everyone's renders, a weekly quota that
 * one heavy user drains for everybody, and a term-of-service problem on top.
 *
 * WHAT IT GUARDS AGAINST
 *   - Becoming an open proxy. Only the Kaggle hosts below are reachable.
 *   - Other sites spending the request quota. Origin must be on the list.
 *   - Surprises. Only the exact methods One Man Band needs are allowed.
 *
 * DEPLOY: see README.md. Free tier is 100,000 requests a day, which at a 20
 * second poll is roughly 250 full songs a day. Waiting on a fetch does not
 * count toward the 10ms CPU limit, so a proxy is a good fit for the free plan.
 */

const KAGGLE_API = 'https://api.kaggle.com/v1';

/** Only these two services, and only these methods. Nothing else gets through. */
const ALLOWED = {
  'kernels.KernelsApiService': new Set([
    'SaveKernel',
    'GetKernelSessionStatus',
    'ListKernelSessionOutput',
  ]),
  'security.OAuthService': new Set(['IntrospectToken']),
};

/**
 * Hosts the file proxy may fetch from. Kaggle hands back output URLs on its own
 * domains and on Google storage. Without this list the /file route would be an
 * open proxy for the whole internet, running on Chris's quota.
 */
const FILE_HOSTS = [
  'api.kaggle.com',
  'www.kaggle.com',
  'kaggle.com',
  // Where the finished songs actually live. ListKernelSessionOutput hands back
  // signed https://www.kaggleusercontent.com/kf/... urls, NOT kaggle.com ones.
  // This was missing on the first deploy and every download would have been
  // refused with a 403 from our own guard. Verified live 2026-08-24.
  'kaggleusercontent.com',
  'storage.googleapis.com',
  'kkb-production.jupyter-proxy.kaggle.net',
];

/** Who may call this. Add an origin here, do not switch it off. */
const ALLOWED_ORIGINS = [
  'https://cfunkycreationsllc.com',
  'https://www.cfunkycreationsllc.com',
  'https://app.cfunkycreationsllc.com',
  'http://localhost:5173',   // vite dev
  'http://localhost:5602',   // the site preview
];

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function deny(status, why, origin) {
  return new Response(JSON.stringify({ error: why }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin || '*') },
  });
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    // Preflight. The browser asks before it will send the Authorization header.
    if (request.method === 'OPTIONS') {
      if (!ALLOWED_ORIGINS.includes(origin)) return deny(403, 'Origin not allowed', origin);
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'lyricist-kaggle-relay' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin || '*') },
      });
    }

    if (!ALLOWED_ORIGINS.includes(origin)) {
      return deny(403, 'Origin not allowed', origin);
    }

    const auth = request.headers.get('Authorization');
    if (!auth) {
      // Deliberate: no token, no call. This relay never supplies one.
      return deny(401, 'Send your own Kaggle token in the Authorization header', origin);
    }

    /* ---- The API calls One Man Band makes ---------------------------- */
    // /api/{service}/{method}
    const api = url.pathname.match(/^\/api\/([^/]+)\/([^/]+)$/);
    if (api) {
      if (request.method !== 'POST') return deny(405, 'Kaggle wants POST', origin);
      const [, service, method] = api;
      if (!ALLOWED[service] || !ALLOWED[service].has(method)) {
        return deny(403, `Not an allowed call: ${service}/${method}`, origin);
      }

      let body;
      try {
        body = await request.text();
      } catch {
        return deny(400, 'Could not read the request body', origin);
      }

      const upstream = await fetch(`${KAGGLE_API}/${service}/${method}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth,          // the user's token, passed straight through
          'User-Agent': 'Lyricist/4.2.0 (relay)',
        },
        body,
      });

      // Kaggle's own status and body, handed back untouched. A relay that
      // rewrites errors is a relay that hides them, and this project has been
      // bitten by silent failures twice.
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
          ...corsHeaders(origin),
        },
      });
    }

    /* ---- Fetching the finished song --------------------------------- */
    // /file?url=<the url ListKernelSessionOutput gave us>
    if (url.pathname === '/file') {
      const target = url.searchParams.get('url');
      if (!target) return deny(400, 'Missing url', origin);

      let t;
      try {
        t = new URL(target);
      } catch {
        return deny(400, 'That is not a url', origin);
      }
      if (t.protocol !== 'https:') return deny(400, 'https only', origin);
      const host = t.hostname;
      const ok = FILE_HOSTS.some((h) => host === h || host.endsWith('.' + h));
      if (!ok) return deny(403, `Not a Kaggle file host: ${host}`, origin);

      const upstream = await fetch(t.toString(), {
        headers: { Authorization: auth, 'User-Agent': 'Lyricist/4.2.0 (relay)' },
        redirect: 'follow',
      });

      // Streamed, not buffered. A finished song is tens of megabytes and
      // buffering it would be pointless memory and pointless latency.
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') || 'application/octet-stream',
          'Content-Disposition': upstream.headers.get('Content-Disposition') || '',
          ...corsHeaders(origin),
        },
      });
    }

    return deny(404, 'No such route. Try /api/{service}/{method}, /file, or /health', origin);
  },
};
