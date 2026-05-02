// First-launch onboarding flow — empty tmp project root, walk Welcome → Done.
//
// Acceptance: app shows Welcome, detects all 3 platforms (mocked via
// BYAN_E2E_MOCK_CLI), previews FileWritePlan[], applies, writes
// tmp/_byan/config.yaml, lands on Done step.

import { test, expect } from '@playwright/test';
import { launchApp } from './fixtures';
import * as fs from 'node:fs';
import * as path from 'node:path';

test('first launch: onboarding writes _byan/config.yaml', async () => {
  const launched = await launchApp({
    env: {
      // Mock all 3 CLIs so the detection step is deterministic across runners.
      BYAN_E2E_MOCK_CLI: 'claude:/usr/bin/claude,codex:/usr/bin/codex,copilot:/usr/bin/gh'
    }
  });
  const { page, tmpProjectRoot, cleanup } = launched;

  try {
    // Step 0: Welcome
    await expect(page.getByTestId('step-welcome')).toBeVisible();

    // Type the project root path manually (no native dialog in E2E).
    await page.getByTestId('project-root-input').fill(tmpProjectRoot);
    await page.getByTestId('step0-next-btn').click();

    // Step 1: Detection — wait for the 3 platform rows.
    await expect(page.getByTestId('step-detection')).toBeVisible();
    await expect(page.getByTestId('platform-row-claude')).toBeVisible();
    await expect(page.getByTestId('platform-row-codex')).toBeVisible();
    await expect(page.getByTestId('platform-row-copilot')).toBeVisible();

    // The mock returns paths for all 3 — checkboxes auto-toggle in handleStep0Next.
    await page.getByTestId('step1-next-btn').click();

    // Step 2: Preview — at least one file plan rendered per selected platform.
    await expect(page.getByTestId('step-preview')).toBeVisible();

    // Apply
    await page.getByTestId('step2-apply-btn').click();

    // Step 4: Done (we may pass through step 3 'applying' too quickly to assert).
    await expect(page.getByTestId('step-done')).toBeVisible({ timeout: 15_000 });

    // Verify the config.yaml landed on disk.
    const cfgPath = path.join(tmpProjectRoot, '_byan', 'config.yaml');
    expect(fs.existsSync(cfgPath)).toBe(true);
  } finally {
    await cleanup();
  }
});
