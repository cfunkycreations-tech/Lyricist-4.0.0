// Verify the phone purchase gate accepts only authentic, unexpired cookies.
import assert from 'node:assert/strict';
import { codeHash, makeUnlock, readUnlock } from '../functions/_shared/unlockCookie.js';

const secret = 'test-only-secret';
const hash = await codeHash('example-purchase');
const cookie = await makeUnlock(hash, secret);
const request = (value) => new Request('https://example.test/', { headers: { cookie: value } });

assert.equal(await readUnlock(request(cookie), secret), hash);
assert.equal(await readUnlock(request(cookie), 'wrong-secret'), null);
assert.equal(await readUnlock(request(cookie.replace(hash, '0000000000000000')), secret), null);
assert.equal(await readUnlock(request(await makeUnlock(hash, secret, Date.now() - 5000)), secret), null);
assert.equal(await readUnlock(request('lp_unlock=not-a-valid-cookie'), secret), null);
assert.equal(await readUnlock(request(cookie), ''), null);
assert.match(cookie, /HttpOnly/);
assert.match(cookie, /Secure/);
assert.match(cookie, /SameSite=Lax/);
console.log('Phone purchase cookie checks passed.');
