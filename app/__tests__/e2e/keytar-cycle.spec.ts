// keytar write/read/delete cycle through the renderer's window.byanApi.store.
//
// On CI Linux runners libsecret may not be available; secure-store falls back
// to the user-scoped .env file. fixtures.ts overrides XDG_CONFIG_HOME to point
// inside the tmp project root so this test exercises whichever backend the
// runtime resolves to.

import { test, expect } from '@playwright/test';
import { launchApp } from './fixtures';

test('keytar cycle: set / get / delete', async () => {
  const launched = await launchApp({ preconfigureProject: true });
  const { page, cleanup } = launched;

  try {
    // set
    await page.evaluate(() => window.byanApi.store.set('e2e.test.key', 'value123'));

    // get
    const value = await page.evaluate(() => window.byanApi.store.get<string>('e2e.test.key'));
    expect(value).toBe('value123');

    // overwrite
    await page.evaluate(() => window.byanApi.store.set('e2e.test.key', 'updated'));
    const updated = await page.evaluate(() => window.byanApi.store.get<string>('e2e.test.key'));
    expect(updated).toBe('updated');

    // delete (set null) — the store handler accepts null as a sentinel and the
    // composite store removes the entry on the keytar/fallback backend.
    await page.evaluate(() => window.byanApi.store.set('e2e.test.key', null));
    const after = await page.evaluate(() => window.byanApi.store.get<string>('e2e.test.key'));
    expect(after === null || after === 'null').toBe(true);
  } finally {
    await cleanup();
  }
});
