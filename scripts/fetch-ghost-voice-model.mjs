// Downloads the Ghost's voice model into public/kokoro so it ships INSIDE the
// installer and never has to be fetched by a user.
//
// Chris asked for the whole thing bundled after testing the voices and finding
// the first load slow. I argued against it (one-time cost, cached afterwards,
// against +92 MB on every download of an installer he had deliberately cut from
// 381 MB to 187 MB) and he said bundle it, so it is bundled.
//
// WHAT HAS TO COME DOWN, and it is two separate things:
//
//   1. The model itself, read by transformers.js. It resolves a local model as
//      <localModelPath>/<model id>/..., so the layout below is not arbitrary and
//      renaming any of it silently sends the app back to the network.
//      dtype 'q8' means onnx/model_quantized.onnx, not model_q8.onnx.
//
//   2. The voice style vectors, which kokoro-js fetches ITSELF from a hardcoded
//      huggingface.co URL, bypassing transformers entirely. Those cannot be
//      redirected by config, so GhostVoice.js pre-seeds the browser cache with
//      the local copies under the exact URLs kokoro will ask for. Only the three
//      voices the picker offers are taken; the repo has 55.
//
// Skips anything already on disk, so it costs one download ever. Not committed:
// public/kokoro is in .gitignore, and this runs on postinstall and before build.
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'fs';
import { get } from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const BASE = `https://huggingface.co/${MODEL_ID}/resolve/main`;
const dest = path.join(root, 'public', 'kokoro');

// The three the picker offers. See VOICES in src/services/GhostVoice.js.
const VOICES = ['am_adam', 'am_michael', 'af_heart'];

const FILES = [
  // read by transformers.js, under <localModelPath>/<model id>/
  // model_quantized.onnx is q8 -- the WASM fallback path.
  // model_q4f16.onnx is the WebGPU path: ONNX Runtime's WebGPU backend cannot
  // execute q8, so the fast route needs its own file. It is ~86 MB, slightly
  // SMALLER than the q8 it sits next to, so bundling both is close to free.
  ...['config.json', 'tokenizer.json', 'tokenizer_config.json',
      'onnx/model_quantized.onnx', 'onnx/model_q4f16.onnx']
    .map((f) => ({ from: f, to: path.join(MODEL_ID, f) })),
  // fetched by kokoro-js itself, mirrored at the same relative path
  ...VOICES.map((v) => ({ from: `voices/${v}.bin`, to: path.join('voices', `${v}.bin`) })),
];

function download(url, out, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(new Error('too many redirects'));
    get(url, { headers: { 'User-Agent': 'Lyricist/4.2.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(new URL(res.headers.location, url).toString(), out, hops + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      mkdirSync(path.dirname(out), { recursive: true });
      // Write to a temp name and rename, so a killed download never leaves a
      // half file that looks finished to the next run.
      const tmp = `${out}.part`;
      const file = createWriteStream(tmp);
      res.pipe(file);
      file.on('finish', () => file.close(() => {
        try { renameSync(tmp, out); } catch (e) { return reject(e); }
        return resolve();
      }));
      file.on('error', reject);
      return undefined;
    }).on('error', reject);
  });
}

const missing = FILES.filter(({ to }) => !existsSync(path.join(dest, to)));
if (!missing.length) {
  const total = FILES.reduce((n, { to }) => n + statSync(path.join(dest, to)).size, 0);
  console.log(`[ghost-voice] already here (${(total / 1e6).toFixed(1)} MB)`);
  process.exit(0);
}

console.log(`[ghost-voice] fetching ${missing.length} file(s), about 94 MB, once`);
let bytes = 0;
for (const { from, to } of missing) {
  const out = path.join(dest, to);
  try {
    await download(`${BASE}/${from}`, out);
    const size = statSync(out).size;
    bytes += size;
    console.log(`  ${from.padEnd(30)} ${(size / 1e6).toFixed(2)} MB`);
  } catch (e) {
    // Loud and fatal on a release build: shipping without this would put the
    // voice back on the network for every user, which is the whole thing he
    // asked to stop.
    console.error(`[ghost-voice] FAILED on ${from}: ${e.message}`);
    process.exit(1);
  }
}
console.log(`[ghost-voice] ${(bytes / 1e6).toFixed(1)} MB into public/kokoro`);
