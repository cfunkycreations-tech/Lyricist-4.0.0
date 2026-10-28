/**
 * THE PHONE VERSION'S PURCHASE CODE.
 *
 * Chris, 2026-10-12, on the free public phone link: "Of course, lock it behind
 * a fucking pay code." Every Gumroad sale comes with its own license key in the
 * receipt; the phone app asks for it once (src/web/PurchaseLock.jsx) and this
 * checks it with Gumroad.
 *
 * A Cloudflare Pages Function: `npm run deploy:web` uploads everything in
 * functions/ next to the site, so the phone calls /api/unlock on its own
 * domain and Gumroad is called from Cloudflare, never from the browser. Not
 * part of the Windows app (package.json build.files leaves it out).
 *
 * POST { code, recheck }  ->  { ok: true } or { ok: false, why, revoked }
 *   recheck: a phone that is already unlocked asking again every few days. It
 *            does not count as a new device, so it only counts as a recheck
 *            when the phone holds this code's unlock cookie. Without the
 *            cookie it is a new device like any other.
 *   revoked: Gumroad said no for certain (no such code, refunded, charged back).
 *            Only then does an unlocked phone lock again; Gumroad being down
 *            never locks anybody out.
 * Every yes sets the lp_unlock cookie (functions/_shared/unlockCookie.js),
 * which is what functions/_middleware.js lets in. A certain no clears it.
 *
 * Subscriptions (2026-10-28): keys from every product in PRODUCTS unlock; a
 * membership that ended or failed to renew is a certain no, and a subscriber's
 * cookie lasts 35 days, renewed by the weekly re-check.
 * Trials (Chris, 2026-10-28): a $0 purchase made with a trial code (MATTHEW)
 * is a 30-day trial from the day of the sale; other free codes, and every $0
 * purchase from before trials existed (FUNKPHONE), are full copies. The answer carries trialEnds,
 * the cookie expires with the trial so the site stops letting that phone in,
 * and a trial that has run out is a certain no. Same rule as licenseCheck.js.
 */
import { codeHash, makeUnlock, readUnlock, clearUnlock } from '../_shared/unlockCookie.js';


// One code, this many installs. Generous on purpose: on an iPhone, Safari and
// the Home Screen app keep separate storage, so one person can use two.
const MAX_DEVICES = 10;

const VERIFY = 'https://api.gumroad.com/v2/licenses/verify';
// A subscriber's unlock cookie lasts this long; the phone's weekly re-check renews it.
const SUB_COOKIE_MS = 35 * 24 * 60 * 60 * 1000;

// Every Lyricist Pro product a license key can come from (Chris, 2026-10-28:
// subscriptions). The original $19.99 one-time product first, so every key
// already out there keeps working exactly as before. Same list in
// licenseCheck.js and functions/api/unlock.js.
const PRODUCTS = [
  { id: 'vmQgyfBzmUFRW3O8y2CeMw==', plan: 'onetime' },    // Lyricist Pro, $19.99 one time (gumroad.com/l/pzglwj)
  { id: 'AU-9EFQD4l1SpTirn-tkTQ==', plan: 'lifetime' },   // Founder's Lifetime, $149 one time
  { id: 'ZLUlZ19Y92l7PbBvjmheZw==', plan: 'monthly' },    // Monthly membership, $9.99
  { id: 'FyE2nTV7fNtGpfdN3QYDEg==', plan: 'annual' },     // Annual membership, $99
];
const SUB_ENDED = 'Your Lyricist Pro subscription has ended. Renew it on Gumroad to keep going; your songs are still here.';
const SUB_FAILED = "Your Lyricist Pro subscription payment didn't go through. Update your card on Gumroad to keep going; your songs are still here.";

/** A membership that has run out: ended, or its renewal payment failed. '' while it is active. */
function subscriptionProblem(p) {
  const past = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) && t <= Date.now(); };
  if (past(p.subscription_ended_at)) return SUB_ENDED;
  if (past(p.subscription_failed_at)) return SUB_FAILED;
  return '';
}

/**
 * Ask Gumroad about a code against each product in turn. A code belongs to
 * exactly one product; Gumroad answers the others with 404. Returns
 * { res, data, plan } for the product that knows it, or the last 404.
 * Throws when Gumroad cannot be reached.
 */
async function lookup(code, increment, first) {
  const order = first ? [...PRODUCTS.filter((p) => p.id === first), ...PRODUCTS.filter((p) => p.id !== first)] : PRODUCTS;
  let last = null;
  for (const prod of order) {
    const res = await fetch(VERIFY, {
      method: 'POST',
      body: new URLSearchParams({ product_id: prod.id, license_key: code, increment_uses_count: increment ? 'true' : 'false' }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.success) return { res, data, plan: prod.plan, productId: prod.id };
    if (res.status !== 404 || data.success !== false) throw new Error(`gumroad ${res.status}`);
    last = { res, data, plan: null, productId: null };
  }
  return last;
}
const TRIAL_DAYS = 30;
// The 100%-off codes that give a trial, not a full copy. Any other free code is a full copy.
const TRIAL_CODES = ['MATTHEW'];
// Trials began 2026-10-28; a $0 purchase before then is a full copy.
const TRIALS_FROM = Date.parse('2026-10-28T00:00:00Z');
const TRIAL_OVER = 'Your 30-day trial of Lyricist Pro has ended. Get it on Gumroad to keep going; your songs are still here.';

/**
 * When a trial ends (ms), or 0 for a purchase that is not a trial. A trial is
 * a $0 purchase made with one of TRIAL_CODES (Chris: "Just apply this to the
 * fucking Matthew code. That's it."). Everything else is a full copy, and so is
 * every purchase from before trials existed (TRIALS_FROM), so FUNKPHONE never locks.
 */
function trialEnds(p) {
  if (Number(p.price) !== 0) return 0;
  const sold = Date.parse(p.sale_timestamp || p.created_at || '');
  if (Number.isFinite(sold) && sold < TRIALS_FROM) return 0;
  const oc = p.offer_code;
  const name = String((oc && typeof oc === 'object' ? oc.code || oc.name : oc) || '').trim().toUpperCase();
  if (!TRIAL_CODES.includes(name)) return 0;  // MATTHEW only; no code named, no trial
  return (Number.isFinite(sold) ? sold : Date.now()) + TRIAL_DAYS * 24 * 60 * 60 * 1000;
}

const json = (body, status = 200, cookie = null) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    ...(cookie ? { 'set-cookie': cookie } : {}),
  },
});

export async function onRequestPost({ request, env }) {
  let input = {};
  try { input = await request.json(); } catch { /* answered below */ }
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  if (!code || code.length > 120) {
    return json({ ok: false, why: 'Type or paste the purchase code from your Gumroad receipt.' }, 400);
  }

  const secret = env?.UNLOCK_SECRET;
  if (!secret) {
    return json({ ok: false, why: 'Purchase codes are not switched on yet. Try again soon.' }, 503);
  }
  const hash = await codeHash(code);
  const recheck = input.recheck === true && (await readUnlock(request, secret)) === hash;

  let found;
  try {
    found = await lookup(code, !recheck, typeof input.product === 'string' ? input.product : null);
  } catch {
    return json({ ok: false, why: 'Gumroad is not answering right now. Try again in a minute.' }, 502);
  }
  const { data } = found;

  // Gumroad answers a code it does not know with 404 and success: false, for
  // every product. Anything else (rate limit, outage, a firewall page) is not
  // a no, so it never locks a phone. Same rule as licenseCheck.js.
  if (!data.success) {
    return json({ ok: false, revoked: true, why: 'That code does not match a Lyricist Pro purchase. Copy it straight from your receipt.' }, 200, clearUnlock());
  }

  const p = data.purchase || {};
  if (p.refunded || p.chargebacked || (p.disputed && !p.dispute_won)) {
    return json({ ok: false, revoked: true, why: 'That purchase was refunded, so the code no longer works.' }, 200, clearUnlock());
  }
  const sub = subscriptionProblem(p);
  if (sub) return json({ ok: false, revoked: true, why: sub }, 200, clearUnlock());
  if (!recheck && Number(data.uses) > MAX_DEVICES) {
    return json({ ok: false, why: `That code is already on ${MAX_DEVICES} devices. Email cfunkycreations@gmail.com and we will sort it out.` });
  }
  const ends = trialEnds(p);
  if (ends && Date.now() > ends) {
    return json({ ok: false, revoked: true, why: TRIAL_OVER }, 200, clearUnlock());
  }
  // A subscriber's cookie runs out after a few weeks unless the re-check renews it.
  const isSub = found.plan === 'monthly' || found.plan === 'annual';
  const cookieEnds = isSub ? (ends ? Math.min(ends, Date.now() + SUB_COOKIE_MS) : Date.now() + SUB_COOKIE_MS) : ends;
  return json({ ok: true, trialEnds: ends, plan: found.plan, product: found.productId }, 200, await makeUnlock(hash, secret, cookieEnds));
}

export function onRequest() {
  return json({ ok: false, why: 'Use POST.' }, 405);
}
