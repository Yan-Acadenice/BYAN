// Live integration tests (opt-in) — spawn the REAL `claude` binary and prove a
// full local-chat round-trip end to end : start -> send -> a normalized reply
// arrives, and NO stream-json parse error is surfaced. A second case pins the
// USAGE half : what a model-pinned turn reports, and what it does NOT.
//
// This is the "prod-like proof" the unit tests cannot give : the unit suite runs
// against a fake process, so a wrong stdin wire shape (missing message/role
// wrapper), a bad flag combo, or a token counter invented out of thin air passes
// there but fails the moment the real CLI answers. These tests catch exactly
// that class of regression.
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

// Wait until a terminal frame ('complete' or 'error') lands past `from`.
function settleAfter(broadcasts: LocalChatMessage[], from: number, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: no terminal frame in ${timeoutMs}ms`)), timeoutMs);
    const iv = setInterval(() => {
      const slice = broadcasts.slice(from);
      if (slice.some((b) => b.type === 'complete' || b.type === 'error')) {
        clearInterval(iv);
        clearTimeout(timer);
        resolve();
      }
    }, 250);
  });
}

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

  // The usage asymmetry can only be proven here. claude's stream-json `result`
  // carries a price and a duration and NO token breakdown ; the unit suite feeds
  // a handcrafted result line, so it can only prove the mapping of a shape we
  // chose. This run proves the shape the CLI actually ships.
  it.skipIf(!RUN_LIVE)(
    'a model-pinned turn reports costUsd and NO token breakdown at all',
    async () => {
      const broadcasts: LocalChatMessage[] = [];
      const bridge = new LocalChatBridge({ broadcast: (m) => broadcasts.push(m) });

      // 'sonnet' — a cheap alias, and the value the UI offers as a preset.
      const { sessionId } = await bridge.start({ cwd, model: 'sonnet' });
      // effort is codex-only : the echo must say null even though we never sent one.
      expect(broadcasts[0]).toMatchObject({ type: 'started', cli: 'claude', model: 'sonnet', effort: null });

      const mark = broadcasts.length;
      await bridge.send(sessionId, 'Reply with exactly one word: PONG');
      await settleAfter(broadcasts, mark, 120_000);
      await bridge.stop(sessionId);

      const errors = broadcasts.filter((b) => b.type === 'error') as
        Extract<LocalChatMessage, { type: 'error' }>[];
      expect(errors, `turn errored: ${errors.map((e) => e.error).join(' | ')}`).toEqual([]);

      const done = broadcasts.find((b) => b.type === 'complete') as
        | Extract<LocalChatMessage, { type: 'complete' }>
        | undefined;
      expect(done, 'no complete frame received from claude').toBeDefined();
      const usage = done?.usage;
      expect(usage, 'the complete frame carried no usage').toBeDefined();
      expect(usage?.engine).toBe('claude');
      expect(usage?.model).toBe('sonnet');

      // A price, or an explicit null when the CLI quoted none — never undefined:
      // claude OWNS this slot, and undefined means "engine does not report it".
      expect(
        usage?.costUsd === null || typeof usage?.costUsd === 'number',
        `costUsd was ${JSON.stringify(usage?.costUsd)}`
      ).toBe(true);
      expect(
        Object.prototype.hasOwnProperty.call(usage ?? {}, 'durationMs'),
        'claude stopped reporting the duration slot'
      ).toBe(true);

      // The ABSENCE is the assertion. claude publishes no token breakdown, so a
      // future engine that defaults these to 0 (a fabricated measurement the UI
      // would render as a real count instead of a dash) fails right here.
      expect(usage?.inputTokens).toBeUndefined();
      expect(usage?.cachedInputTokens).toBeUndefined();
      expect(usage?.cacheWriteInputTokens).toBeUndefined();
      expect(usage?.outputTokens).toBeUndefined();
      expect(usage?.reasoningOutputTokens).toBeUndefined();
    },
    140_000
  );
});
