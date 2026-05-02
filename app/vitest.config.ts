// Vitest config for main-process and preload tests (Node environment).
// Renderer tests use renderer/vitest.config.ts (jsdom + React).
//
// The test runner picks up both via vitest workspace (vitest.workspace.ts).

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'main',
    include: ['main/**/*.test.ts'],
    environment: 'node',
    globals: false,
    clearMocks: true
  }
});
