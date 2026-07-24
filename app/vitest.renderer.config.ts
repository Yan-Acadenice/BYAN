// Vitest config for renderer tests — jsdom environment + React plugin.
// Loaded via vitest.workspace.ts at the app/ root.

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'renderer',
    include: ['renderer/**/*.test.tsx', 'renderer/**/*.test.ts'],
    environment: 'jsdom',
    globals: true,
    clearMocks: true,
    setupFiles: ['renderer/__tests__/setup.ts']
  }
});
