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
 *   ort   (21 MB)  the ONNX runtime, for the Stemmer. Demucs on a phone is
 *                  not happening.
 *
 *   models (0.9 MB) basic-pitch STAYS. It runs on TensorFlow.js, not ONNX, and
 *                  a phone converts a hummed memo to MIDI fine. It used to be
 *                  dropped with ort by mistake, which left MIDI Studio's
 *                  Audio -> MIDI button dead on every phone.
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
const DROP = ['ort', 'kokoro'];

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
// Always the customer build. Variables already in the environment beat any
// .env file, so a creator .env on the PC can never put the Ghost Pilot on the
// public phone link.
execSync('npx vite build', { cwd: ROOT, stdio: 'inherit', env: { ...process.env, VITE_FAFO_INTERNAL_BUILD: 'false' } });

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
/**
 * CLOUDFLARE PAGES REFUSES ANY FILE OVER 25 MiB.
 *
 * GeneralUser-GS.sf2 is 32 MB and MIDI Studio cannot play a note without it,
 * so it is cut into parts here and soundfont loading glues them back together
 * (services/loadBuffer.js reads <file>.parts.json when the whole file 404s).
 * Anything else that big makes the build fail loudly instead of the deploy
 * failing halfway through an upload.
 */
const LIMIT = 25 * 1024 * 1024;
const PART = 20 * 1024 * 1024;
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
for (const file of walk(WEB)) {
  const size = fs.statSync(file).size;
  if (size <= LIMIT) continue;
  const rel = path.relative(WEB, file).split(path.sep).join('/');
  if (!rel.startsWith('sf2/')) throw new Error(`${rel} is ${mb(size)}, over the 25 MiB a hosted file can be`);
  const buf = fs.readFileSync(file);
  const parts = [];
  for (let at = 0, n = 1; at < buf.length; at += PART, n++) {
    const name = `${path.basename(file)}.part${n}`;
    fs.writeFileSync(path.join(path.dirname(file), name), buf.subarray(at, at + PART));
    parts.push(name);
  }
  fs.writeFileSync(`${file}.parts.json`, JSON.stringify({ size: buf.length, parts }, null, 2));
  fs.rmSync(file);
  console.log(`  split    ${rel.padEnd(34)} ${mb(size)} into ${parts.length} parts`);
}

/**
 * A real 404 page. Without one, Cloudflare Pages treats the site as a
 * single-page app and answers EVERY missing file with index.html and a 200, so
 * code that checks "is the Ghost's voice bundled?" with fetch().ok would get a
 * web page back and treat it as the voice. With this file present a missing
 * file is a missing file.
 */
fs.writeFileSync(path.join(WEB, '404.html'),
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
  + '<title>Not here</title><body style="background:#04060f;color:#e6e8eb;font:16px system-ui;padding:24px">'
  + 'That page is not here. <a href="./" style="color:#ffb25a">Open Lyricist Pro</a></body>');

const after = sizeOf(WEB);

// A PWA must be served over https from its own origin. Leaving a stray
// index.html at file:// paths would silently break the manifest scope, so make
// the failure loud instead of subtle.
for (const need of ['index.html', 'manifest.webmanifest', 'sw.js', 'pwa/icon-512.png',
                    'sf2/GeneralUser-GS.sf2.parts.json', 'models/basic-pitch/model.json']) {
  if (!fs.existsSync(path.join(WEB, need))) throw new Error(`MISSING from the web build: ${need}`);
}

console.log(`\n  before ${mb(before)}  ->  after ${mb(after)}   (saved ${mb(before - after)})`);
console.log(`\n  dist-web/ is ready to upload.`);
