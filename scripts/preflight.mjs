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
import { openerProblems } from './opener-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

/**
 * The main process is main.js plus every local module it requires
 * (licenseCheck.js, desktopUpdate.js...), which register handlers of their own.
 */
function requireGraph(starts) {
  const seen = new Set();
  const files = [];
  const queue = [...starts];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    files.push(rel);
    if (!/\.[cm]?js$/.test(rel)) continue;
    const src = fs.readFileSync(abs, 'utf8');
    for (const m of src.matchAll(/require\(\s*['"`](\.[^'"`]+)['"`]\s*\)/g)) {
      let dep = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]));
      if (!/\.[cm]?js$|\.json$/.test(dep)) {
        if (fs.existsSync(path.join(ROOT, dep + '.js'))) dep += '.js';
        else if (fs.existsSync(path.join(ROOT, dep, 'index.js'))) dep = path.posix.join(dep, 'index.js');
      }
      queue.push(dep);
    }
  }
  return files;
}

const MAIN_FILES = requireGraph(['main.js']).filter((f) => /\.[cm]?js$/.test(f));

/** Every ipcMain channel must be registered exactly once, across all of them. */
function checkDuplicateIpcHandlers() {
  const seen = new Map();
  const re = /ipcMain\.handle\(\s*['"`]([^'"`]+)['"`]/g;
  for (const file of MAIN_FILES) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    let m;
    while ((m = re.exec(src))) {
      const where = `${file}:${src.slice(0, m.index).split('\n').length}`;
      if (seen.has(m[1])) {
        problems.push(
          `ipcMain.handle('${m[1]}') registered twice `
          + `(${seen.get(m[1])} and ${where}). Electron throws on the second one.`
        );
      } else {
        seen.set(m[1], where);
      }
    }
  }
  return seen.size;
}

/** Anything the preload bridge invokes must have a handler behind it. */
function checkPreloadChannels() {
  const preload = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');
  const handled = new Set(MAIN_FILES.flatMap((f) => [...fs.readFileSync(path.join(ROOT, f), 'utf8')
    .matchAll(/ipcMain\.handle\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1])));
  const invoked = new Set(
    [...preload.matchAll(/ipcRenderer\.invoke\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1])
  );
  for (const ch of invoked) {
    if (!handled.has(ch)) {
      problems.push(`preload.js invokes '${ch}' but the main process has no handler for it.`);
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

  let checked = 0;
  for (const rel of requireGraph(['main.js', 'preload.js'])) {
    checked++;
    // electron-builder always packs package.json, whatever build.files says.
    if (rel === 'main.js' || rel === 'preload.js' || rel === 'package.json') continue;
    if (!covers(rel)) {
      problems.push(
        `main process requires '${rel}' but build.files in package.json does not include it — `
        + `it will be missing from app.asar and the packaged app will crash on launch.`
      );
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
  // Only what main.js still actually loads. The splash window was removed from
  // main.js in 66e20f2 along with its files, and checking for them anyway
  // blocked every release after it.
  const mainSrc = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const assets = ['splash/splash.html', 'splash/splash.mp4']
    .filter((rel) => mainSrc.includes(path.posix.basename(rel)));
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

/**
 * THE SOURCE index.html MUST STILL BE THE SOURCE ONE.
 *
 * A BUILT index.html in the repo root looks almost identical and is fatal: it
 * points at `./assets/index-<hash>.js` from a previous build instead of
 * `/src/main.jsx`, so Vite fails to resolve and the release dies half way, or
 * worse, ships a bundle nobody rebuilt. It got there by an `asar extract-file`
 * run in the wrong directory and it was one `git add -A` away from being
 * permanent. One line to check, so check it.
 */
function checkSourceIndexHtml() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (!html.includes('/src/main.jsx')) {
    problems.push('index.html in the repo root is a BUILT one, not the source. '
      + 'It must load /src/main.jsx. Restore it with: git checkout -- index.html');
  }
  return 1;
}

const channels = checkDuplicateIpcHandlers();
const bridged = checkPreloadChannels();
const mainModules = checkPackagedMainModules();
const runtimeAssets = checkPackagedRuntimeAssets();
checkSourceIndexHtml();
problems.push(...openerProblems(ROOT));

if (problems.length) {
  console.error('\n  PREFLIGHT FAILED\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\n  Nothing was built.\n');
  process.exit(1);
}

console.log(`preflight ok — ${channels} ipc channels, ${bridged} bridged, ${mainModules} main modules packaged, ${runtimeAssets} runtime assets packaged, no duplicates`);
