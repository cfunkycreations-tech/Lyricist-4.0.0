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

/**
 * Every local module the main process requires must be in build.files.
 *
 * The whitelist there is opt-in: a new root-level module (demucsLocal.js) built
 * and ran fine in dev, then threw "Cannot find module" the instant the app was
 * packaged, because it was never copied into app.asar. Walk the require graph
 * from main.js/preload.js and prove each file is covered by a files entry.
 */
function checkPackagedMainModules() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const patterns = (pkg.build?.files || []).filter((f) => typeof f === 'string' && !f.startsWith('!'));
  // Turn a files glob into a regex that can test a repo-relative path.
  const covers = (rel) => patterns.some((p) => {
    const rx = new RegExp('^' + p
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\/\*/g, '.*')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*') + '$');
    return rx.test(rel);
  });

  const seen = new Set();
  const queue = ['main.js', 'preload.js'];
  let checked = 0;
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    checked++;
    if (rel !== 'main.js' && rel !== 'preload.js' && !covers(rel)) {
      problems.push(
        `main process requires '${rel}' but build.files in package.json does not include it — `
        + `it will be missing from app.asar and the packaged app will crash on launch.`
      );
    }
    const src = fs.readFileSync(abs, 'utf8');
    for (const m of src.matchAll(/require\(\s*['"`](\.[^'"`]+)['"`]\s*\)/g)) {
      let dep = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]));
      if (!/\.[cm]?js$/.test(dep)) {
        if (fs.existsSync(path.join(ROOT, dep + '.js'))) dep += '.js';
        else if (fs.existsSync(path.join(ROOT, dep, 'index.js'))) dep = path.posix.join(dep, 'index.js');
      }
      queue.push(dep);
    }
  }
  return checked;
}

/**
 * Non-JS files the main process loads off disk at runtime.
 *
 * `build.files` is a WHITELIST, so anything not named there is simply absent
 * from the installed app while working perfectly in dev — the failure only ever
 * shows up on a real install, which is the worst place to find it. The splash
 * is loaded with loadFile() rather than imported, so no module scan can see it.
 */
function checkPackagedRuntimeAssets() {
  const assets = ['splash/splash.html', 'splash/splash.mp4'];
  const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const patterns = pkgJson.build?.files || [];
  for (const rel of assets) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      problems.push(`${rel} is loaded at runtime but is missing from the repo.`);
      continue;
    }
    const covered = patterns.some((p) => {
      if (typeof p !== 'string' || p.startsWith('!')) return false;
      if (p === rel) return true;
      const dir = p.replace(/\/\*\*\/\*$/, '').replace(/\/\*$/, '');
      return dir !== p && (rel === dir || rel.startsWith(dir + '/'));
    });
    if (!covered) {
      problems.push(
        `${rel} is loaded at runtime but no build.files pattern covers it — `
        + `it would be missing from the installed app. Add it to build.files.`
      );
    }
  }
  return assets.length;
}

const channels = checkDuplicateIpcHandlers();
const bridged = checkPreloadChannels();
const mainModules = checkPackagedMainModules();
const runtimeAssets = checkPackagedRuntimeAssets();

if (problems.length) {
  console.error('\n  PREFLIGHT FAILED\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\n  Nothing was built.\n');
  process.exit(1);
}

console.log(`preflight ok — ${channels} ipc channels, ${bridged} bridged, ${mainModules} main modules packaged, ${runtimeAssets} runtime assets packaged, no duplicates`);
