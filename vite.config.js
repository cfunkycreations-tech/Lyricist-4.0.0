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
  },
  resolve: {
    alias: {
      // kokoro-js ships a real browser build and then does not export it: its
      // package exports map offers only the node entry, which drags node APIs
      // into the renderer. Point the bare import at the web build directly.
      // The Ghost's voice is the only thing that imports it (GhostVoice.js).
      'kokoro-js': fileURLToPath(new URL('./node_modules/kokoro-js/dist/kokoro.web.js', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
