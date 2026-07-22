// Mode switch (cloud → local) live, from the status bar, WITHOUT a relaunch and
// WITHOUT a re-login. This is the F1 deliverable: the ModeSwitcher chip in the
// StatusStrip flips the whole app between Cloud (byan_web) and Local (this PC).
//
// Sequence:
//   1. Launch with a pre-configured project + mocked cloud auth + mocked local server.
//   2. Log in as cloud → app shell.
//   3. Open the mode switcher in the status bar and pick Local.
//   4. Assert the chip now reads "Local" — the app stayed on the shell (no return
//      to the Login screen), proving the switch was live.

import { test, expect } from '@playwright/test';
import { launchApp } from './fixtures';

test('switch mode: cloud → local live from the status bar', async () => {
  // Full launch + login + live switch exceeds the default 30s budget on the
  // Windows CI runner (slow Electron first boot + Defender scan of a fresh
  // binary) — 3 straight timeouts on the desktop-v1.0.0 run. slow() triples the
  // budget; the assertions are unchanged.
  test.slow();
  const launched = await launchApp({
    preconfigureProject: true,
    env: {
      BYAN_E2E_MOCK_AUTH: '200',
      BYAN_E2E_MOCK_SERVER_PORT: '37346'
    }
  });
  const { page, cleanup } = launched;

  try {
    // 1. Log in as cloud → lands on the app shell.
    await page.getByTestId('cloud-token-input').fill('test-token');
    await page.getByTestId('cloud-submit').click();
    await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 10_000 });

    // 2. The status-bar switcher shows the live mode (Cloud) and is reachable.
    const trigger = page.getByTestId('mode-switcher-trigger');
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await expect(trigger).toContainText('Cloud');

    // 3. Open the menu and switch to Local — no relaunch, no logout.
    await trigger.click();
    await page.getByTestId('mode-option-local').click();

    // 4. The chip flips to Local live; we are still on the app shell (the Login
    //    tabs never came back).
    await expect(trigger).toContainText('Local', { timeout: 10_000 });
    await expect(page.getByTestId('tab-cloud')).toHaveCount(0);
  } finally {
    await cleanup();
  }
});
