// Vitest workspace — runs two projects in a single `vitest run`:
//   - main:     Node environment for main-process tests.
//   - renderer: jsdom + React for renderer component tests.
//
// Usage: vitest run  (picks this file automatically)

import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'vitest.config.ts',
  'vitest.renderer.config.ts'
]);
