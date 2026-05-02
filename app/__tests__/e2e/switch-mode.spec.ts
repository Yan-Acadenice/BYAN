// Mode switch (cloud → local) without app relaunch.
//
// Sequence:
//   1. Launch with a pre-configured project + valid cloud auth.
//   2. Log in as cloud.
//   3. Open Settings and click "Switch login mode".
//   4. Assert we're back on the Login screen.
//   5. Click Local tab and assert the Local panel is reachable.

import { test, expect } from '@playwright/test';
import { launchApp } from './fixtures';

test('switch mode: cloud → local without relaunch', async () => {
  const launched = await launchApp({
    preconfigureProject: true,
    env: {
      BYAN_E2E_MOCK_AUTH: '200',
      BYAN_E2E_MOCK_SERVER_PORT: '37346'
    }
  });
  const { page, cleanup } = launched;

  try {
    // 1. Log in as cloud
    await page.getByTestId('cloud-token-input').fill('test-token');
    await page.getByTestId('cloud-submit').click();
    await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 10_000 });

    // 2. Navigate to Settings — F7+ wires the route; until then we drive the
    //    auth.logout call via the IPC bridge directly to simulate the same
    //    user action without depending on the (not-yet-shipped) Settings nav.
    await page.evaluate(() => window.byanApi.auth.logout());

    // 3. After logout the Login screen renders again — assert one of its tabs
    //    is back in the DOM.
    await expect(page.getByTestId('tab-cloud')).toBeVisible({ timeout: 10_000 });

    // 4. Switch to Local tab and confirm it is interactive.
    await page.getByTestId('tab-local').click();
    await expect(page.getByTestId('panel-local')).toBeVisible();
    await expect(page.getByTestId('local-spawn-btn')).toBeEnabled();
  } finally {
    await cleanup();
  }
});
