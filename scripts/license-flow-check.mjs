// Offline regression checks for purchase verification on phone and desktop.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { onRequestPost } from '../functions/api/unlock.js';
import { readUnlock } from '../functions/_shared/unlockCookie.js';

const require = createRequire(import.meta.url);
const desktop = require('../licenseCheck.js');
const dir = mkdtempSync(join(tmpdir(), 'lyricist-license-test-'));
const handlers = {};
desktop.register({ on: (n, f) => { handlers[n] = f; }, handle: (n, f) => { handlers[n] = f; } }, () => dir);
const secret = 'test-only-secret';
let behavior = 'valid';
let increments = [];
globalThis.fetch = async (_url, opts) => {
  increments.push(opts.body.get('increment_uses_count'));
  if (behavior === 'outage') throw new Error('offline');
  if (behavior === 'unknown') return new Response(JSON.stringify({ success: false }), { status: 404 });
  const trials = {
    'trial-missing-date': { price: 0, offer_code: 'MATTHEW' },
    'trial-active': { price: 0, offer_code: 'MATTHEW', sale_timestamp: new Date().toISOString() },
    'grandfathered': { price: 0, offer_code: 'MATTHEW', sale_timestamp: '2026-01-01T00:00:00Z' },
  };
  const purchase = trials[behavior] || { price: 1999, ...(behavior === 'refunded' ? { refunded: true } : {}) };
  return new Response(JSON.stringify({ success: true, uses: 1, purchase }), { status: 200 });
};
const phone = (body, cookie = '') => onRequestPost({
  request: new Request('https://example.test/api/unlock', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body),
  }), env: { UNLOCK_SECRET: secret },
});

try {
  let r = await phone({ code: 'EXAMPLE' });
  assert.equal((await r.json()).ok, true);
  const cookie = r.headers.get('set-cookie');
  assert.ok(await readUnlock(new Request('https://example.test/', { headers: { cookie } }), secret));
  assert.equal(increments.at(-1), 'true');
  increments = [];
  r = await phone({ code: 'EXAMPLE', recheck: true }, cookie);
  assert.equal((await r.json()).ok, true);
  assert.equal(increments.at(-1), 'false');
  behavior = 'outage';
  r = await phone({ code: 'EXAMPLE', recheck: true }, cookie);
  assert.equal(r.status, 502);
  assert.equal((await r.json()).revoked, undefined);
  behavior = 'trial-active';
  r = await phone({ code: 'EXAMPLE', recheck: true }, cookie);
  assert.ok((await r.json()).trialEnds > Date.now());
  behavior = 'grandfathered';
  r = await phone({ code: 'EXAMPLE', recheck: true }, cookie);
  assert.equal((await r.json()).trialEnds, 0);
  behavior = 'trial-missing-date';
  r = await phone({ code: 'EXAMPLE', recheck: true }, cookie);
  assert.equal(r.status, 502);
  assert.equal((await r.json()).revoked, undefined);
  behavior = 'refunded';
  r = await phone({ code: 'EXAMPLE', recheck: true }, cookie);
  assert.equal((await r.json()).revoked, true);
  assert.match(r.headers.get('set-cookie'), /Max-Age=0/);
  behavior = 'unknown';
  r = await phone({ code: 'UNKNOWN' });
  assert.equal((await r.json()).revoked, true);

  behavior = 'valid';
  assert.equal((await handlers['license-verify']({}, { code: 'EXAMPLE' })).ok, true);
  const licenseFile = join(dir, 'license.json');
  const saved = JSON.parse(readFileSync(licenseFile, 'utf8'));
  saved.checked = 0;
  writeFileSync(licenseFile, JSON.stringify(saved));
  behavior = 'outage';
  assert.equal((await handlers['license-recheck']()).ok, true);
  assert.ok(readFileSync(licenseFile, 'utf8'));
  behavior = 'trial-missing-date';
  assert.equal((await handlers['license-recheck']()).ok, true);
  assert.ok(readFileSync(licenseFile, 'utf8'));
  behavior = 'refunded';
  assert.equal((await handlers['license-recheck']()).revoked, true);
  assert.throws(() => readFileSync(licenseFile, 'utf8'), { code: 'ENOENT' });
  console.log('Phone and desktop license flow checks passed.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
