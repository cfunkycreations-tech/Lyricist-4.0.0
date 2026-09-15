#!/usr/bin/env node
/**
 * The dev server with the creator-only tools switched on: Ask the Ghost, its
 * hand, and the Ghost Pilot. Same as `npm run dev` otherwise, and extra
 * arguments pass straight through to Vite.
 *
 *   npm run dev:creator
 *   npm run dev:creator -- --port 5175 --strictPort
 *
 * The flag is set here in the process rather than in a .env file, so nothing
 * lying around on disk can leak it into a customer release.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const r = spawnSync('npx', ['vite', ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, VITE_FAFO_INTERNAL_BUILD: 'true' },
});
process.exit(r.status ?? 0);
