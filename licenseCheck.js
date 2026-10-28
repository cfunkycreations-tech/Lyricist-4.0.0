/**
 * THE WINDOWS APP'S PURCHASE CODE.
 *
 * The installer was a public download with nothing behind it: anyone could get
 * Lyricist Pro without paying the $19.99. Same fix as the phone: the license
 * key in the buyer's Gumroad receipt, asked for once (src/web/PurchaseLock.jsx),
 * checked with Gumroad from here, the main process, so the renderer never talks
 * to Gumroad and never holds the saved code.
 *
 * The rules match functions/api/unlock.js (the phone's Cloudflare check). Keep
 * PRODUCT_ID, MAX_DEVICES and the refund rules the same in both.
 *
 * The creator build and `npm run dev` never ask (PurchaseLock decides that), so
 * Chris is never locked out of his own app.
 *
 * Unlocked stays unlocked: userData\license.json. Once a week, when online, it
 * is checked again quietly; only a definite no from Gumroad (refunded, charged
 * back, not a real code) locks it again. No internet or Gumroad down never does.
 * The code is never logged and never leaves this file except to Gumroad.
 *
 * TRIALS. Chris, 2026-10-28: a 100%-off code (MATTHEW) should be "a 30 day
 * trial", automatically. A $0 purchase made with one of TRIAL_CODES runs
 * TRIAL_DAYS from the day of the sale, then locks with TRIAL_OVER. Any other
 * free code is a full copy, and so is every $0 purchase from before trials
 * existed: Chris's own FUNKPHONE code runs his and Michelle's apps. The end is
 * saved with the code and checked at every launch, so staying offline does
 * not stretch it. Same rule as functions/api/unlock.js.
 */
const fs = require('fs');
const path = require('path');

// Lyricist Pro (gumroad.com/l/pzglwj). Same as functions/api/unlock.js.
const PRODUCT_ID = 'vmQgyfBzmUFRW3O8y2CeMw==';
// One code, this many installs, phones and PCs together.
const MAX_DEVICES = 10;
const RECHECK_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFY = 'https://api.gumroad.com/v2/licenses/verify';
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
const trialOver = (v) => !!(v && v.trialEnds && Date.now() > v.trialEnds);

function file(userData) { return path.join(userData(), 'license.json'); }

function read(userData) {
  try {
    const v = JSON.parse(fs.readFileSync(file(userData), 'utf8'));
    return v && typeof v.code === 'string' && v.code ? v : null;
  } catch { return null; }
}
function write(userData, v) {
  try { fs.writeFileSync(file(userData), JSON.stringify(v), 'utf8'); } catch { /* asks again next launch */ }
}
function forget(userData) {
  try { fs.unlinkSync(file(userData)); } catch { /* nothing to forget */ }
}

/** { ok, trialEnds } on yes; { ok: false, why, revoked } on no; throws when Gumroad can't be reached. */
async function ask(code, recheck) {
  const res = await fetch(VERIFY, {
    method: 'POST',
    body: new URLSearchParams({
      product_id: PRODUCT_ID,
      license_key: code,
      increment_uses_count: recheck ? 'false' : 'true',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    // Gumroad's real "no such code" is a 404 with success: false. Anything else
    // (rate limit, a firewall page, an outage) is not a no, so it never locks.
    if (res.status !== 404 || data.success !== false) throw new Error(`gumroad ${res.status}`);
    return { ok: false, revoked: true, why: 'That code does not match a Lyricist Pro purchase. Copy it straight from your receipt.' };
  }
  const p = data.purchase || {};
  if (p.refunded || p.chargebacked || (p.disputed && !p.dispute_won)) {
    return { ok: false, revoked: true, why: 'That purchase was refunded, so the code no longer works.' };
  }
  if (!recheck && Number(data.uses) > MAX_DEVICES) {
    return { ok: false, why: `That code is already on ${MAX_DEVICES} devices. Email cfunkycreations@gmail.com and we will sort it out.` };
  }
  const ends = trialEnds(p);
  if (ends && Date.now() > ends) return { ok: false, revoked: true, why: TRIAL_OVER };
  return { ok: true, trialEnds: ends };
}

/** Wire the IPC handles. Called once from main.js; userData is () => app.getPath('userData'). */
function register(ipcMain, userData) {
  ipcMain.on('license-unlocked', (event) => { const v = read(userData); event.returnValue = !!v && !trialOver(v); });
  // Why the lock screen is up, when it is a trial that ran out.
  ipcMain.on('license-why', (event) => { event.returnValue = trialOver(read(userData)) ? TRIAL_OVER : ''; });

  ipcMain.handle('license-verify', async (_event, { code } = {}) => {
    const c = typeof code === 'string' ? code.trim() : '';
    if (!c || c.length > 120) return { ok: false, why: 'Type or paste the purchase code from your Gumroad receipt.' };
    try {
      const r = await ask(c, false);
      if (r.ok) write(userData, { code: c, at: Date.now(), checked: Date.now(), trialEnds: r.trialEnds || 0 });
      return { ok: r.ok, why: r.why || '' };
    } catch {
      return { ok: false, why: 'Could not reach Gumroad. Unlocking needs the internet once; after that it works offline.' };
    }
  });

  // The weekly quiet re-check. Only a definite no locks the app again.
  ipcMain.handle('license-recheck', async () => {
    const saved = read(userData);
    if (!saved) return { ok: false, revoked: true, why: '' };
    if (trialOver(saved)) return { ok: false, revoked: true, why: TRIAL_OVER };
    if (Date.now() - (saved.checked || 0) < RECHECK_MS) return { ok: true };
    try {
      const r = await ask(saved.code, true);
      if (r.ok) { write(userData, { ...saved, checked: Date.now(), trialEnds: r.trialEnds || 0 }); return { ok: true }; }
      if (r.revoked) { forget(userData); return { ok: false, revoked: true, why: r.why }; }
      return { ok: true };
    } catch {
      return { ok: true };   // offline or Gumroad down: stay unlocked
    }
  });
}

module.exports = { register };
