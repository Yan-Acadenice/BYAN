// Vitest config for renderer tests — jsdom environment + React plugin.
// Loaded via vitest.workspace.ts at the app/ root.

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import * as path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@webui': path.resolve(__dirname, '..', 'api', 'webui', 'src')
    }
  },
  test: {
    name: 'renderer',
    include: ['renderer/**/*.test.tsx', 'renderer/**/*.test.ts'],
    environment: 'jsdom',
    globals: true,
    clearMocks: true,
    setupFiles: ['renderer/__tests__/setup.ts']
  }
});
