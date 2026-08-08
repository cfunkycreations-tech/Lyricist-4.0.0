#!/usr/bin/env node
/**
 * Pre-build sanity checks for things that ship fine and then kill the app on
 * launch — the failures a compiler and `node --check` both wave through.
 *
 * Added 2026-08-07 after build 046 shipped with `list-displays` registered
 * twice. Electron throws "Attempted to register a second handler for X" from
 * the top of main.js, so the app died before a window ever opened. Valid
 * syntax, clean Vite build, broken product.
 *
 * Run by `npm run release` before anything is packaged. Exits non-zero on a
 * problem so the release stops.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

/** Every ipcMain channel must be registered exactly once. */
function checkDuplicateIpcHandlers() {
  const file = path.join(ROOT, 'main.js');
  const src = fs.readFileSync(file, 'utf8');
  const seen = new Map();
  const re = /ipcMain\.handle\(\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = re.exec(src))) {
    const line = src.slice(0, m.index).split('\n').length;
    if (seen.has(m[1])) {
      problems.push(
        `main.js: ipcMain.handle('${m[1]}') registered twice `
        + `(lines ${seen.get(m[1])} and ${line}). Electron throws on the second one.`
      );
    } else {
      seen.set(m[1], line);
    }
  }
  return seen.size;
}

/** Anything the preload bridge invokes must have a handler behind it. */
function checkPreloadChannels() {
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');
  const handled = new Set(
    [...main.matchAll(/ipcMain\.handle\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1])
  );
  const invoked = new Set(
    [...preload.matchAll(/ipcRenderer\.invoke\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1])
  );
  for (const ch of invoked) {
    if (!handled.has(ch)) {
      problems.push(`preload.js invokes '${ch}' but main.js has no handler for it.`);
    }
  }
  return invoked.size;
}

const channels = checkDuplicateIpcHandlers();
const bridged = checkPreloadChannels();

if (problems.length) {
  console.error('\n  PREFLIGHT FAILED\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\n  Nothing was built.\n');
  process.exit(1);
}

console.log(`preflight ok — ${channels} ipc channels, ${bridged} bridged, no duplicates`);
