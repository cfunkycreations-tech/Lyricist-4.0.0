/**
 * BUILD THE WEB / PWA VERSION.
 *
 * The desktop build is ~231 MB and that is fine: it ships inside an installer
 * on a Windows machine with a hard disk. Handing the same 231 MB to a phone
 * over mobile data is not fine, and Chris uploads the site BY HAND through his
 * host's file manager, so every megabyte is also a megabyte he has to push
 * through a browser upload box.
 *
 * So this makes a second, trimmed copy in dist-web/ and leaves dist/ completely
 * alone. The Electron release is never affected by anything in here.
 *
 * WHAT COMES OUT, AND WHY:
 *   sf2/CFunky-Quantum.sf2 (38.5 MB)  Chris's own texture bank. soundfontEngine
 *                  already treats this one as optional and warns to the console
 *                  if it is absent - "a decorative bank must never be able to
 *                  take the piano roll down". So dropping it costs his custom
 *                  textures and nothing else.
 *
 *                  GeneralUser-GS.sf2 (32 MB) STAYS. It is the General MIDI
 *                  bank and loadBank() THROWS without it, and a failed note is
 *                  deliberately silent - so a web build without it would give
 *                  you a piano roll that plays nothing and never says why.
 *                  It is not precached; it downloads only if someone actually
 *                  opens MIDI Studio.
 *   ort   (21 MB)  the ONNX runtime, for Stemmer and basic-pitch. Both are
 *                  desktop-only on mobile: Demucs on a phone is not happening.
 *   models         basic-pitch weights, same reason.
 *   kokoro (90 MB) the Ghost's voice. GhostVoice.js already handles this being
 *                  absent - it falls back to fetching from the CDN instead of
 *                  dying (see the `not bundled` branch in that file). 90 MB of
 *                  someone's data plan for a voice is not a trade worth making
 *                  by default.
 *
 * WHAT STAYS: the whole UI, every tab background, the fonts, and wizard-audio,
 * because that is Chris's own recorded narration and it is the first thing a
 * new person hears.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const WEB = path.join(ROOT, 'dist-web');

/** Whole directories dropped from the web build. See the comment above. */
const DROP = ['ort', 'models', 'kokoro'];

/** Individual files dropped. The rest of their directory stays. */
const DROP_FILES = ['sf2/CFunky-Quantum.sf2', 'sf2/CFunky-Quantum.manifest.json'];

const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
function sizeOf(p) {
  let total = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const f = path.join(p, e.name);
    total += e.isDirectory() ? sizeOf(f) : fs.statSync(f).size;
  }
  return total;
}

console.log('Building the renderer...');
execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });

if (!fs.existsSync(DIST)) throw new Error('vite build produced no dist/');

console.log('\nCopying to dist-web/...');
fs.rmSync(WEB, { recursive: true, force: true });
fs.cpSync(DIST, WEB, { recursive: true });

const before = sizeOf(WEB);
for (const d of DROP) {
  const p = path.join(WEB, d);
  if (fs.existsSync(p)) {
    console.log(`  dropping ${d.padEnd(8)} ${mb(sizeOf(p))}`);
    fs.rmSync(p, { recursive: true, force: true });
  }
}
for (const f of DROP_FILES) {
  const p = path.join(WEB, f);
  if (fs.existsSync(p)) {
    console.log(`  dropping ${f.padEnd(34)} ${mb(fs.statSync(p).size)}`);
    fs.rmSync(p, { force: true });
  }
}
const after = sizeOf(WEB);

// A PWA must be served over https from its own origin. Leaving a stray
// index.html at file:// paths would silently break the manifest scope, so make
// the failure loud instead of subtle.
for (const need of ['index.html', 'manifest.webmanifest', 'sw.js', 'pwa/icon-512.png',
                    'sf2/GeneralUser-GS.sf2']) {
  if (!fs.existsSync(path.join(WEB, need))) throw new Error(`MISSING from the web build: ${need}`);
}

console.log(`\n  before ${mb(before)}  ->  after ${mb(after)}   (saved ${mb(before - after)})`);
console.log(`\n  dist-web/ is ready to upload.`);
