// Visual capture of the packaged app, for looking at the result rather than
// asserting on it. Not a gate: it writes PNGs and passes.
//
// Why it exists: the token layer remaps 820 colour occurrences at once through
// two ramp aliases. That either lands everywhere or nowhere, and the only way to
// know which is to look at the real window.
//
//   BYAN_E2E_SHOT=1 npx playwright test __tests__/e2e/ui-shot.spec.ts

import { test } from '@playwright/test';
import { launchApp } from './fixtures';
import * as path from 'node:path';

const RUN = process.env.BYAN_E2E_SHOT === '1';
const OUT = process.env.BYAN_SHOT_DIR ?? '/tmp';

test.describe('ui capture', () => {
  test.skip(!RUN, 'set BYAN_E2E_SHOT=1 to capture');
  test.setTimeout(120_000);

  test('login, then chat', async () => {
    const launched = await launchApp({
      preconfigureProject: true,
      env: { BYAN_E2E_MOCK_SERVER_PORT: '37345', BYAN_E2E_MOCK_AUTH: '200' },
    });
    const { page, cleanup } = launched;
    try {
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, 'ui-1-login.png') });

      await page.getByTestId('tab-local').click();
      await page.getByTestId('local-spawn-btn').click();
      await page.getByTestId('local-server-status').waitFor({ timeout: 15_000 });
      await page.getByTestId('local-submit').click();

      await page.getByTestId('nav-chat').click();
      await page.getByTestId('local-chat-input').waitFor({ timeout: 15_000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, 'ui-2-chat.png') });

      await page.getByTestId('nav-projects').click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, 'ui-3-projects.png') });
    } finally {
      await cleanup();
    }
  });
});
