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
 *            does not count as a new device.
 *   revoked: Gumroad said no for certain (no such code, refunded, charged back).
 *            Only then does an unlocked phone lock again; Gumroad being down
 *            never locks anybody out.
 */

// From Gumroad: the product's page, Content > License key, "product_id".
// GUMROAD_PRODUCT_ID set on the Pages project wins over this.
const PRODUCT_ID = '';

// One code, this many installs. Generous on purpose: on an iPhone, Safari and
// the Home Screen app keep separate storage, so one person can use two.
const MAX_DEVICES = 10;

const VERIFY = 'https://api.gumroad.com/v2/licenses/verify';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export async function onRequestPost({ request, env }) {
  let input = {};
  try { input = await request.json(); } catch { /* answered below */ }
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  const recheck = input.recheck === true;
  if (!code || code.length > 120) {
    return json({ ok: false, why: 'Type or paste the purchase code from your Gumroad receipt.' }, 400);
  }

  const productId = env?.GUMROAD_PRODUCT_ID || PRODUCT_ID;
  if (!productId) {
    return json({ ok: false, why: 'Purchase codes are not switched on yet. Try again soon.' }, 503);
  }

  let res;
  let data = {};
  try {
    res = await fetch(VERIFY, {
      method: 'POST',
      body: new URLSearchParams({
        product_id: productId,
        license_key: code,
        increment_uses_count: recheck ? 'false' : 'true',
      }),
    });
    data = await res.json().catch(() => ({}));
  } catch {
    return json({ ok: false, why: 'Could not reach Gumroad. Check your connection and try again.' }, 502);
  }

  // Gumroad answers a code it does not know with 404 and success: false.
  if (!data.success) {
    if (res.status >= 500) return json({ ok: false, why: 'Gumroad is not answering right now. Try again in a minute.' }, 502);
    return json({ ok: false, revoked: true, why: 'That code does not match a Lyricist Pro purchase. Copy it straight from your receipt.' });
  }

  const p = data.purchase || {};
  if (p.refunded || p.chargebacked || (p.disputed && !p.dispute_won)) {
    return json({ ok: false, revoked: true, why: 'That purchase was refunded, so the code no longer works.' });
  }
  if (!recheck && Number(data.uses) > MAX_DEVICES) {
    return json({ ok: false, why: `That code is already on ${MAX_DEVICES} devices. Email cfunkycreations@gmail.com and we will sort it out.` });
  }
  return json({ ok: true });
}

export function onRequest() {
  return json({ ok: false, why: 'Use POST.' }, 405);
}
