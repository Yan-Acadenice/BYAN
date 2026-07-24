// keytar write/read/delete cycle through the renderer's window.byanApi.store.
//
// On CI Linux runners libsecret may not be available; secure-store falls back
// to the user-scoped .env file. fixtures.ts overrides XDG_CONFIG_HOME to point
// inside the tmp project root so this test exercises whichever backend the
// runtime resolves to.
//
// The key lives under the `ui.` prefix: the store channel enforces a renderer
// key ALLOWLIST (chat. login. onboarding. ui. user.) so the auth session keys
// cannot be reached from the renderer — an out-of-namespace key is
// PERMISSION_DENIED by design, not a valid probe.

import { test, expect } from '@playwright/test';
import { launchApp } from './fixtures';

test('keytar cycle: set / get / delete', async () => {
  const launched = await launchApp({ preconfigureProject: true });
  const { page, cleanup } = launched;

  try {
    // set
    await page.evaluate(() => window.byanApi.store.set('ui.e2e-test-key', 'value123'));

    // get
    const value = await page.evaluate(() => window.byanApi.store.get<string>('ui.e2e-test-key'));
    expect(value).toBe('value123');

    // overwrite
    await page.evaluate(() => window.byanApi.store.set('ui.e2e-test-key', 'updated'));
    const updated = await page.evaluate(() => window.byanApi.store.get<string>('ui.e2e-test-key'));
    expect(updated).toBe('updated');

    // delete (set null) — the store handler accepts null as a sentinel and the
    // composite store removes the entry on the keytar/fallback backend.
    await page.evaluate(() => window.byanApi.store.set('ui.e2e-test-key', null));
    const after = await page.evaluate(() => window.byanApi.store.get<string>('ui.e2e-test-key'));
    expect(after === null || after === 'null').toBe(true);
  } finally {
    await cleanup();
  }
});
