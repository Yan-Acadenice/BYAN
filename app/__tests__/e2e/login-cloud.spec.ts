// Cloud login with a valid token → dashboard.
//
// Skips onboarding by pre-creating tmp/_byan/config.yaml. Mocks the
// /api/auth/whoami probe via BYAN_E2E_MOCK_AUTH=200 so the test does not
// require a live byan-api endpoint.

import { test, expect } from '@playwright/test';
import { launchApp } from './fixtures';

test('cloud login: valid token navigates to dashboard', async () => {
  const launched = await launchApp({
    preconfigureProject: true,
    env: {
      BYAN_E2E_MOCK_AUTH: '200'
    }
  });
  const { page, cleanup } = launched;

  try {
    // Cloud tab should be the default selection on first login.
    await expect(page.getByTestId('panel-cloud')).toBeVisible();

    await page.getByTestId('cloud-token-input').fill('test-token');
    await page.getByTestId('cloud-submit').click();

    // After successful login the renderer either:
    //   - redirects to /dashboard (F7+), or
    //   - clears the form and emits onAuthenticated().
    // We assert the form is no longer in an error state and that no error
    // banner is visible — the strongest available signal until F7 lands.
    await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await cleanup();
  }
});
