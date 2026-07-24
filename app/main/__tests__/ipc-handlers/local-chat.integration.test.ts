// Live integration test (opt-in) — spawns the REAL `claude` binary and proves a
// full local-chat round-trip end to end : start -> send -> a normalized reply
// arrives, and NO stream-json parse error is surfaced.
//
// This is the "prod-like proof" the unit tests cannot give : the unit suite runs
// against a fake process, so a wrong stdin wire shape (missing message/role
// wrapper) or a bad flag combo passes there but fails the moment the real CLI
// reads stdin. This test catches exactly that class of regression.
//
// SKIPPED by default (needs the real claude binary + a logged-in session + the
// network). Run it deliberately :
//   BYAN_E2E_CLAUDE=1 npx vitest run main/__tests__/ipc-handlers/local-chat.integration.test.ts
//
// CI does not set BYAN_E2E_CLAUDE, so this never blocks the release gate.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalChatBridge } from '../../ipc-handlers/local-chat';
import type { LocalChatMessage } from '../../../shared/ipc-contract';

const RUN_LIVE = process.env.BYAN_E2E_CLAUDE === '1';

describe('LocalChatBridge — LIVE round-trip against the real claude binary', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-lc-live-'));
  });
  afterEach(() => {
    try { fs.rmSync(cwd, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  it.skipIf(!RUN_LIVE)(
    'sends a real turn and receives a reply with NO stream-json parse error',
    async () => {
      const broadcasts: LocalChatMessage[] = [];
      const bridge = new LocalChatBridge({ broadcast: (m) => broadcasts.push(m) });

      const { sessionId } = await bridge.start({ cwd });
      expect(sessionId).toBeTruthy();

      // Wait for a terminal frame : 'complete' (success) or 'error'. The reply
      // itself is non-deterministic ; what we assert is the WIRE worked.
      const settled = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout: no reply in 120s')), 120_000);
        const iv = setInterval(() => {
          const done = broadcasts.find((b) => b.type === 'complete');
          const err = broadcasts.find((b) => b.type === 'error') as
            | Extract<LocalChatMessage, { type: 'error' }>
            | undefined;
          if (done || err) {
            clearInterval(iv);
            clearTimeout(timer);
            resolve();
          }
        }, 250);
      });

      await bridge.send(sessionId, 'Réponds juste par le mot: PONG');
      await settled;
      await bridge.stop(sessionId);

      // The core assertion : the CLI accepted our stdin wire shape. A regression
      // to the flat {type,content} shape surfaces here as a parse error.
      const parseError = broadcasts.find(
        (b) =>
          b.type === 'error' &&
          /parsing streaming input|message role|Expected message/i.test(
            (b as Extract<LocalChatMessage, { type: 'error' }>).error
          )
      );
      expect(parseError, 'the CLI rejected the stdin wire shape').toBeUndefined();

      // And a normal reply completed (chunk seen and/or a complete frame).
      const gotReply =
        broadcasts.some((b) => b.type === 'complete') ||
        broadcasts.some((b) => b.type === 'chunk');
      expect(gotReply, 'no reply frame received from claude').toBe(true);
    },
    130_000
  );
});
