/**
 * THE PHONE APP'S "THIS PERSON PAID" COOKIE.
 *
 * Chris, 2026-10-15: "I don't want people hacking into my app." Until now the
 * phone lock was a flag in the browser, and every file of the app downloaded
 * for anyone who asked. Now /api/unlock hands out this cookie once Gumroad
 * says the code is real, and functions/_middleware.js serves nothing but the
 * code screen to a browser without it.
 *
 *   lp_unlock = <expiry, unix seconds>.<first 16 hex of SHA-256(code)>.<HMAC>
 *
 * The HMAC key is UNLOCK_SECRET, a Pages secret that scripts/deploy-web.mjs
 * makes on Chris's account and that never appears anywhere else. HttpOnly, so
 * nothing running in the page can read or copy it.
 */
export const COOKIE = 'lp_unlock';
const DAYS = 400;   // the longest a browser keeps a cookie
const enc = new TextEncoder();

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

const hmacKey = (secret) => crypto.subtle.importKey(
  'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
);

/** Short fingerprint of a purchase code. The code itself is never stored. */
export async function codeHash(code) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(code)));
  return [...d.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A Set-Cookie value for this code's fingerprint. endsMs: a trial's end, so the cookie dies with it. */
export async function makeUnlock(hash, secret, endsMs = 0) {
  const now = Math.floor(Date.now() / 1000);
  const exp = endsMs ? Math.min(now + DAYS * 86400, Math.floor(endsMs / 1000)) : now + DAYS * 86400;
  const body = `${exp}.${hash}`;
  const sig = b64url(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${COOKIE}=${body}.${sig}; Path=/; Max-Age=${Math.max(0, exp - now)}; HttpOnly; Secure; SameSite=Lax`;
}

export const clearUnlock = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/** The code fingerprint from a genuine, unexpired cookie, or null. */
export async function readUnlock(request, secret) {
  if (!secret) return null;
  const raw = (request.headers.get('cookie') || '')
    .split(';').map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`));
  const m = raw && raw.slice(COOKIE.length + 1).match(/^(\d{1,12})\.([0-9a-f]{16})\.([A-Za-z0-9_-]{43})$/);
  if (!m) return null;
  if (Number(m[1]) < Date.now() / 1000) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64url(m[3]), enc.encode(`${m[1]}.${m[2]}`));
    return ok ? m[2] : null;
  } catch {
    return null;
  }
}
