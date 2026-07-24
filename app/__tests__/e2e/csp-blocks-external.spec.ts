// CSP blocks external script-src — verify that script-src 'self' rejects
// loading https://evil.example.com/x.js.
//
// We capture two complementary signals:
//   1. A console message containing "Content Security Policy" / "script-src".
//   2. The network request to evil.example.com is either blocked or the
//      response is intercepted before execution (we never see a successful
//      response navigation back into the page context).

import { test, expect } from '@playwright/test';
import { launchApp } from './fixtures';

test('CSP: script-src blocks https://evil.example.com', async () => {
  const launched = await launchApp({ preconfigureProject: true });
  const { page, cleanup } = launched;

  try {
    const cspViolations: string[] = [];
    const externalRequests: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (
        /content security policy/i.test(text) ||
        /script-src/i.test(text) ||
        /Refused to load/i.test(text)
      ) {
        cspViolations.push(text);
      }
    });

    page.on('request', (req) => {
      if (req.url().includes('evil.example.com')) {
        externalRequests.push(req.url());
      }
    });

    // Inject a script tag pointing at the evil origin.
    await page.evaluate(() => {
      const s = document.createElement('script');
      s.src = 'https://evil.example.com/x.js';
      document.body.appendChild(s);
    });

    // Give the renderer a tick to log the CSP violation.
    await page.waitForTimeout(2_000);

    // The script-src 'self' policy must show one of exactly two acceptable
    // outcomes: a logged CSP violation, or NO request to the evil origin at
    // all (CSP short-circuits before the network layer). A request that fired
    // WITHOUT a violation means the CSP did not block it — that must fail.
    // (The old expression also accepted "a request fired, no violation",
    // which made the test pass with the CSP entirely removed.)
    const blocked = cspViolations.length > 0 || externalRequests.length === 0;
    expect(blocked).toBe(true);
  } finally {
    await cleanup();
  }
});
