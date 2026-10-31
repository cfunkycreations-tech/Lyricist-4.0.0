import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { safeFolderName } = require('../safeFolderName.js');
for (const input of ['', '.', '..', ' ... ']) {
  assert.equal(safeFolderName(input, 'Stems'), 'Stems');
}
assert.equal(safeFolderName('My Song', 'Stems'), 'My Song');
assert.equal(safeFolderName('../My Song', 'Stems'), '..-My Song');
for (const input of ['..', '.', '../My Song', 'normal']) {
  const name = safeFolderName(input, 'Stems');
  assert.equal(path.dirname(path.resolve('/exports', name)), path.resolve('/exports'));
  assert.equal(path.win32.dirname(path.win32.resolve('C:\\exports', name)), 'C:\\exports');
}
console.log('Export folder checks passed.');
