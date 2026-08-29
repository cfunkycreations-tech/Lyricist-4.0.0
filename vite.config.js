import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  base: './',
  // Honor an injected PORT so a second dev server can run alongside one
  // already holding 5173. Falls back to the normal Vite default.
  server: {
    port: Number(process.env.PORT) || 5173,
    watch: {
      ignored: ["**/src-tauri/**"]
    }
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
