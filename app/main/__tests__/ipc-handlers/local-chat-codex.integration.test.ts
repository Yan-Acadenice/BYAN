// Live integration test (opt-in) — spawns the REAL `codex` binary and proves a
// full local-chat round-trip end to end on the codex engine : start -> send ->
// a normalized reply arrives -> a SECOND turn goes through `exec resume`.
//
// The unit suite drives a fake process, so a wrong flag combo, a JSONL shape
// drift, or a broken resume chain passes there and fails the moment the real
// CLI runs. This test catches exactly that class of regression.
//
// SKIPPED by default (needs the real codex binary + a logged-in session + the
// network). Run it deliberately :
//   BYAN_E2E_CODEX=1 npx vitest run main/__tests__/ipc-handlers/local-chat-codex.integration.test.ts
//
// CI does not set BYAN_E2E_CODEX, so this never blocks the release gate.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalChatBridge } from '../../ipc-handlers/local-chat';
import type { LocalChatMessage } from '../../../shared/ipc-contract';

const RUN_LIVE = process.env.BYAN_E2E_CODEX === '1';

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

describe('LocalChatBridge — LIVE round-trip against the real codex binary', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-lcx-live-'));
  });
  afterEach(() => {
    try { fs.rmSync(cwd, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  it.skipIf(!RUN_LIVE)(
    'two turns: exec then exec resume, replies arrive, no premature exit',
    async () => {
      const broadcasts: LocalChatMessage[] = [];
      const bridge = new LocalChatBridge({ broadcast: (m) => broadcasts.push(m) });

      const { sessionId } = await bridge.start({ cwd, cli: 'codex' });
      expect(sessionId).toBeTruthy();
      expect(broadcasts[0]).toMatchObject({ type: 'started', cli: 'codex' });

      // Turn 1 — fresh `codex exec`.
      let mark = broadcasts.length;
      await bridge.send(sessionId, 'Réponds juste par le mot: PONG');
      await settleAfter(broadcasts, mark, 120_000);

      const errors1 = broadcasts.filter((b) => b.type === 'error') as
        Extract<LocalChatMessage, { type: 'error' }>[];
      expect(errors1, `turn 1 errored: ${errors1.map((e) => e.error).join(' | ')}`).toEqual([]);
      expect(broadcasts.some((b) => b.type === 'chunk')).toBe(true);
      expect(broadcasts.some((b) => b.type === 'complete')).toBe(true);

      // Turn 2 — MUST go through `codex exec resume <thread_id>` (the risky
      // half of the per-turn design). A broken resume surfaces as an error
      // frame ('sortie prématurée' or a CLI usage error).
      mark = broadcasts.length;
      await bridge.send(sessionId, 'Réponds juste par le mot: REPONG');
      await settleAfter(broadcasts, mark, 120_000);

      const errors2 = broadcasts.slice(mark).filter((b) => b.type === 'error') as
        Extract<LocalChatMessage, { type: 'error' }>[];
      expect(errors2, `turn 2 (resume) errored: ${errors2.map((e) => e.error).join(' | ')}`).toEqual([]);
      expect(broadcasts.slice(mark).some((b) => b.type === 'complete')).toBe(true);

      await bridge.stop(sessionId);
    },
    260_000
  );
});
