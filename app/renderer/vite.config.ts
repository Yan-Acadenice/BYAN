import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';

// Renderer Vite config.
// - root = renderer/ so Vite resolves index.html from here
// - @webui alias points to the existing api/webui/src/ tree (F3 will mount it)
// - base './' so file:// loading works in packaged builds
// - build outputs to app/dist/renderer/ for the main process to load via loadFile()

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@webui': path.resolve(__dirname, '..', '..', 'api', 'webui', 'src')
    }
  },
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
