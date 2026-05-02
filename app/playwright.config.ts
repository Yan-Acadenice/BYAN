// Playwright config for Electron E2E tests — F18.
//
// Tests run against the **packaged binary** produced by `npm run build:dir`
// (or the full `npm run build:linux` / `build:win`) — never against the dev
// server. This catches packaging regressions (asar paths, native bindings,
// CSP injection on file://) that a dev-mode test suite cannot.
//
// One worker only: Electron is mono-instance per user data dir, and our tests
// spawn dedicated tmp project roots that the main process reads at boot. Two
// concurrent app launches would race on keytar service "byan" and on the
// shared local-server child fork.
//
// Linux runners need xvfb (no display); see .github/workflows/electron-build.yml.

import { defineConfig } from '@playwright/test';
import * as path from 'node:path';

export default defineConfig({
  testDir: path.resolve(__dirname, '__tests__/e2e'),
  testMatch: /.*\.spec\.ts$/,

  // 30s per test — Electron cold-start on CI can take 5-10s before any assertion.
  timeout: 30_000,
  expect: { timeout: 10_000 },

  // Electron is mono-instance — parallelism would race on keytar + tmp dirs.
  fullyParallel: false,
  workers: 1,

  // CI only: 2 retries to absorb the rare slow boot. Local dev = no retries
  // so flake surfaces immediately.
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],

  // Single project — the OS detection happens inside fixtures.ts (launchApp).
  // We don't split into Linux/Windows projects because the same spec runs
  // against the OS-native binary regardless of runner.
  projects: [
    {
      name: 'electron',
      use: {
        // Trace on first retry — keeps CI artifact size bounded.
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure'
      }
    }
  ]
});
