// Exercise the public phone unlock endpoint without calling Gumroad.
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/unlock.js';

for (const body of ['null', 'true', '0', '"code"', '[]', '{}', '{bad json']) {
  const response = await onRequestPost({
    request: new Request('https://example.test/api/unlock', { method: 'POST', body }),
    env: {},
  });
  assert.equal(response.status, 400, `bad input ${body} must be rejected`);
  const result = await response.json();
  assert.equal(result.ok, false);
  assert.match(result.why, /purchase code/i);
}

const response = await onRequestPost({
  request: new Request('https://example.test/api/unlock', { method: 'POST', body: JSON.stringify({ code: 'example' }) }),
  env: {},
});
assert.equal(response.status, 503, 'a valid-looking code must reach the configuration check');
console.log('Phone unlock input checks passed.');
