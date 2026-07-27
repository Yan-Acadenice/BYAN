// Vitest config for main-process, preload and shared tests (Node environment).
// Renderer tests use renderer/vitest.config.ts (jsdom + React).
//
// The test runner picks up both via vitest workspace (vitest.workspace.ts).

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'main',
    // preload/** and shared/** are part of this project too — without their
    // patterns a test placed there is silently never collected (which is how
    // the preload gap went unnoticed, and would have hidden the shared/
    // engine-options suite the same way).
    include: ['main/**/*.test.ts', 'preload/**/*.test.ts', 'shared/**/*.test.ts'],
    environment: 'node',
    globals: false,
    clearMocks: true
  }
});
