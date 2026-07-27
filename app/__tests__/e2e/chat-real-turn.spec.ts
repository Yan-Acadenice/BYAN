// The one test that reproduces what the user actually does: drive the PACKAGED
// app through its real interface, type a slash command with a message after it,
// and require an answer from the real claude binary.
//
// WHY THIS EXISTS. Every other proof in this repo is a unit test on a fake
// process or a live test on the bridge with no interface. Three bugs in a row
// shipped past all of them because each lived in the wiring BETWEEN the
// interface and the bridge:
//   - /byan sent an agent slug the CLI silently ignores
//   - a message typed while a session was opening was erased by that session
//   - "/byan salut mon reuf" applied the agent and DISCARDED the words
// A test that clicks the real window is the only one that would have caught all
// three. This is that test.
//
// SKIPPED by default: it needs the packaged binary, the real `claude`, a
// logged-in CLI and the network, and one turn costs tens of seconds. Run it
// deliberately:
//   BYAN_E2E_CHAT=1 npx playwright test __tests__/e2e/chat-real-turn.spec.ts

import { test, expect } from '@playwright/test';
import { launchApp } from './fixtures';

const RUN = process.env.BYAN_E2E_CHAT === '1';

test.describe('chat: a real turn through the real interface', () => {
  test.skip(!RUN, 'set BYAN_E2E_CHAT=1 to run (needs the real claude + network)');

  // A first turn on an agent is slow: measured at 20s+ of tool calls before the
  // first word, plus app cold start.
  test.setTimeout(300_000);

  test('"/byan <message>" applies the agent, keeps the message, and gets a reply', async () => {
    const launched = await launchApp({
      preconfigureProject: true,
      env: { BYAN_E2E_MOCK_SERVER_PORT: '37345', BYAN_E2E_MOCK_AUTH: '200' },
    });
    const { page, cleanup } = launched;

    try {
      // --- log in local (no cloud, no token)
      await page.getByTestId('tab-local').click();
      await page.getByTestId('local-spawn-btn').click();
      await expect(page.getByTestId('local-server-status')).toContainText('37345', { timeout: 15_000 });
      await page.getByTestId('local-submit').click();

      // --- reach the chat
      await page.getByTestId('nav-chat').click();
      const input = page.getByTestId('local-chat-input');
      await expect(input).toBeVisible({ timeout: 15_000 });

      // --- the exact thing the user typed
      await input.fill('/byan dis juste le mot PONG');
      await input.press('Enter');

      // 1. the agent is applied, and it is the slug the project declares
      await expect(page.getByTestId('local-agent-chip')).toContainText('byan', { timeout: 20_000 });

      // 2. the message is NOT eaten: the user's own words stay on screen
      await expect(page.getByText('dis juste le mot PONG')).toBeVisible({ timeout: 20_000 });

      // 3. the turn is visibly alive rather than a mute spinner
      await expect(page.getByTestId('local-activity')).toBeVisible({ timeout: 30_000 });

      // 4. an actual reply arrives. Asserting a second bubble exists is what
      //    proves the turn completed: the activity line disappears with it.
      await expect(page.getByTestId('local-activity')).toBeHidden({ timeout: 240_000 });
      const bubbles = page.locator('[data-testid="local-chat-view"] .rounded-xl');
      await expect
        .poll(async () => bubbles.count(), { timeout: 30_000 })
        .toBeGreaterThanOrEqual(2);

      // 5. and no error banner anywhere in the run
      await expect(page.getByRole('alert')).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });
});
