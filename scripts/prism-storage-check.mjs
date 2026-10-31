import assert from 'node:assert/strict';
import { getPrism, setPrism, startPrism, PRISM_HOME } from '../src/services/prismTheme.js';

const values = new Map();
let blocked = false;
globalThis.localStorage = {
  getItem(key) { if (blocked) throw new Error('storage blocked'); return values.get(key) ?? null; },
  setItem(key, value) { if (blocked) throw new Error('storage blocked'); values.set(key, value); },
};
const listeners = new Map();
globalThis.window = {
  addEventListener(name, fn) { listeners.set(name, fn); },
  dispatchEvent(event) { listeners.get(event.type)?.(event); },
};
const css = new Map();
globalThis.document = { documentElement: { style: { setProperty: (k, v) => css.set(k, v) } } };

blocked = true;
startPrism();
assert.equal(getPrism(), PRISM_HOME);
setPrism(0.75);
assert.equal(getPrism(), 0.75);
assert.ok(css.has('--accent-rgb'));
blocked = false;
setPrism(0.25);
assert.equal(getPrism(), 0.25);
assert.equal(values.get('lyricistPrism'), '0.25');
console.log('Prism storage checks passed.');
