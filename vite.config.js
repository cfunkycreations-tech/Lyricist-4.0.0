import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

/* Which build this is, shown at the bottom of the phone's home screen, so "is
   my phone on the new version?" has an answer you can read. */
let commit = '';
try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* no git */ }
const BUILD_STAMP = `${new Date().toISOString().slice(0, 10)}${commit ? ` · ${commit}` : ''}`;

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_STAMP__: JSON.stringify(BUILD_STAMP) },
  base: './',
  // Honor an injected PORT so a second dev server can run alongside one
  // already holding 5173. Falls back to the normal Vite default.
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  resolve: {
    alias: {
      // POINT AT dist/kokoro.js, NOT dist/kokoro.web.js.
      //
      // The "web" build is 2.1 MB because it has its own copy of
      // @huggingface/transformers bundled inside it, complete with a hardcoded
      // jsdelivr URL for the WebAssembly runtime. Nothing outside that bundle
      // can reach its `env`, so setting wasmPaths had no effect and the packaged
      // app still went to the CDN and died on file://. The plain entry is 12 KB
      // and imports transformers as a normal dependency, which means the copy
      // GhostVoice.js configures is the same copy Kokoro uses.
      //
      // The exports map calls it the node entry, which is why it was avoided at
      // first, but it imports nothing from node: transformers.js is isomorphic
      // and Vite resolves its browser condition.
      'kokoro-js': fileURLToPath(new URL('./node_modules/kokoro-js/dist/kokoro.js', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
