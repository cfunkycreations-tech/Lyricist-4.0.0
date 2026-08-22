// Copies onnxruntime-web's WebAssembly runtime out of node_modules into
// public/ort so the Ghost's voice works inside the packaged app.
//
// WHY THIS EXISTS. transformers.js fetches its runtime from a CDN by default,
// and the packaged app runs from file://, where a dynamic import of a remote
// module simply fails. Chris hit it the first time he switched the voice on:
//
//   The voice would not load: no available backend found. ERR: [wasm]
//   TypeError: Failed to fetch dynamically imported module:
//   https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/.../
//   ort-wasm-simd-threaded.jsep.mjs
//
// It worked in the dev server and only broke once installed, which is the
// oldest trap in this project: a green build is not a working app.
//
// Only the jsep pair is copied, ~21 MB, because that is the build transformers
// asks for even when the device is plain wasm. GhostVoice.js points
// env.backends.onnx.wasm.wasmPaths at the copy.
//
// Wired into package.json alongside copy:model, so it runs on postinstall and
// before every build.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'node_modules', 'onnxruntime-web', 'dist');
const dest = path.join(root, 'public', 'ort');

const NEEDED = [
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
];

if (!existsSync(src)) {
  console.warn('[copy-ort] onnxruntime-web not installed yet — skipping.');
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
let total = 0;
for (const name of NEEDED) {
  const from = path.join(src, name);
  if (!existsSync(from)) {
    // Loud, not silent: a renamed file here means the voice dies in the
    // installed app while every test on this machine still passes.
    console.warn(`[copy-ort] MISSING ${name} — the Ghost's voice will not work when packaged.`);
    continue;
  }
  copyFileSync(from, path.join(dest, name));
  total += statSync(from).size;
}
console.log(`[copy-ort] onnx runtime → ${path.relative(root, dest)} (${(total / 1e6).toFixed(1)} MB)`);
