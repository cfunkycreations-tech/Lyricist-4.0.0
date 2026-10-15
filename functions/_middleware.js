/**
 * NOTHING OF THE PHONE APP LOADS UNTIL THE CODE IS CHECKED.
 *
 * Chris, 2026-10-15: "I don't want people hacking into my app." The old lock
 * lived in the browser: every script and sound of the app downloaded for
 * anyone with the link, and someone handy with a browser could skip the code
 * screen. Cloudflare now runs this before every request. Without a genuine
 * lp_unlock cookie (functions/_shared/unlockCookie.js, set by /api/unlock
 * once Gumroad says yes) a page request gets the code screen and anything
 * else gets 401.
 *
 * Open to everyone: the code check itself, and what a phone needs to install
 * the app to its Home Screen (the service worker, the manifest, the icons).
 * No UNLOCK_SECRET on the project means nobody gets in, not everybody;
 * scripts/deploy-web.mjs makes sure it is there before every deploy.
 */
import { readUnlock } from './_shared/unlockCookie.js';
import { LOCK_PAGE } from './_shared/lockPage.js';

const OPEN = [/^\/api\/unlock$/, /^\/sw\.js$/, /^\/manifest\.webmanifest$/, /^\/pwa\/[\w.-]+$/, /^\/favicon\.[a-z]+$/];

const SAFE = {
  'cache-control': 'no-store',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=31536000',
  'content-security-policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  'x-robots-tag': 'noindex',
};

export async function onRequest({ request, env, next }) {
  const { pathname } = new URL(request.url);
  if (OPEN.some((r) => r.test(pathname))) return next();
  if (await readUnlock(request, env.UNLOCK_SECRET)) return next();

  const page = request.method === 'GET'
    && (request.headers.get('sec-fetch-mode') === 'navigate' || (request.headers.get('accept') || '').includes('text/html'));
  if (page) {
    return new Response(LOCK_PAGE, { status: 401, headers: { ...SAFE, 'content-type': 'text/html; charset=utf-8' } });
  }
  return new Response('Locked. Enter your purchase code first.', {
    status: 401, headers: { ...SAFE, 'content-type': 'text/plain; charset=utf-8' },
  });
}
