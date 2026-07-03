// Copies the bundled basic-pitch TF.js model out of node_modules into
// public/models/basic-pitch so the audio→MIDI converter works fully offline
// in dev, in `vite build`, and inside the packaged Electron app.
// Wired into package.json: runs on postinstall and before build.
import { cpSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'node_modules', '@spotify', 'basic-pitch', 'model');
const dest = path.join(root, 'public', 'models', 'basic-pitch');

if (!existsSync(src)) {
  console.warn('[copy-model] @spotify/basic-pitch not installed yet — skipping.');
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[copy-model] basic-pitch model → ${path.relative(root, dest)}`);
