import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // Honor an injected PORT so a second dev server can run alongside one
  // already holding 5173. Falls back to the normal Vite default.
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
