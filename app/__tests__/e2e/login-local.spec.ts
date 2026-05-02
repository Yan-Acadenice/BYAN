// Local login: spawn the embedded server, then connect.
//
// We skip the real fork() of install/src/webui/server.js by setting
// BYAN_E2E_MOCK_SERVER_PORT=37345 — the local-server module replies
// synchronously with { running: true, port: 37345, pid: 1 }.

import { test, expect } from '@playwright/test';
import { launchApp } from './fixtures';

test('local login: server starts and connects', async () => {
  const launched = await launchApp({
    preconfigureProject: true,
    env: {
      BYAN_E2E_MOCK_SERVER_PORT: '37345',
      BYAN_E2E_MOCK_AUTH: '200'
    }
  });
  const { page, cleanup } = launched;

  try {
    await page.getByTestId('tab-local').click();
    await expect(page.getByTestId('panel-local')).toBeVisible();

    await page.getByTestId('local-spawn-btn').click();

    // Server status banner appears once the (mocked) server reports ready.
    await expect(page.getByTestId('local-server-status')).toContainText('http://localhost:37345', {
      timeout: 10_000
    });

    await page.getByTestId('local-submit').click();

    // Connection succeeded — no error banner.
    await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await cleanup();
  }
});
