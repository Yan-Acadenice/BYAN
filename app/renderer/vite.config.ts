import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';

// Renderer Vite config.
// - root = renderer/ so Vite resolves index.html from here
// - base './' so file:// loading works in packaged builds
// - build outputs to app/dist/renderer/ for the main process to load via loadFile()

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: path.resolve(__dirname, '..', 'dist', 'renderer'),
    emptyOutDir: true,
    sourcemap: true
  }
});
