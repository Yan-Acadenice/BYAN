// Live integration tests (opt-in) — spawn the REAL `codex` binary and prove a
// full local-chat round-trip end to end on the codex engine : start -> send ->
// a normalized reply arrives -> a SECOND turn goes through `exec resume`. Two
// further cases pin the model/effort/usage wire : the counters a fresh turn
// reports, and a per-turn effort CHANGE surviving the resume.
//
// The unit suite drives a fake process, so a wrong flag combo, a JSONL shape
// drift, a broken resume chain, or a `-c` override the real CLI rejects as an
// unexpected argument passes there and fails the moment the real CLI runs.
// These tests catch exactly that class of regression.
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
import { spawn } from 'child_process';
import { LocalChatBridge, type SpawnFn } from '../../ipc-handlers/local-chat';
import type { LocalChatMessage } from '../../../shared/ipc-contract';

const RUN_LIVE = process.env.BYAN_E2E_CODEX === '1';

// The model id accepted on a real fresh turn during the F1 spike, and the one
// the picker offers as its codex preset.
const CODEX_MODEL = 'gpt-5.6-sol';

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

  it.skipIf(!RUN_LIVE)(
    'a fresh turn with a model AND an effort reports token counters and no price',
    async () => {
      const broadcasts: LocalChatMessage[] = [];
      const bridge = new LocalChatBridge({ broadcast: (m) => broadcasts.push(m) });

      const { sessionId } = await bridge.start({ cwd, cli: 'codex', model: CODEX_MODEL, effort: 'low' });
      expect(broadcasts[0]).toMatchObject({ type: 'started', cli: 'codex', model: CODEX_MODEL, effort: 'low' });

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
      expect(done, 'no complete frame received from codex').toBeDefined();
      const usage = done?.usage;
      expect(usage, 'the complete frame carried no usage').toBeDefined();
      expect(usage?.engine).toBe('codex');
      expect(usage?.model).toBe(CODEX_MODEL);

      // The mirror of the claude case : codex DOES publish a token breakdown.
      expect(typeof usage?.inputTokens, `inputTokens was ${JSON.stringify(usage?.inputTokens)}`).toBe('number');
      expect(typeof usage?.outputTokens, `outputTokens was ${JSON.stringify(usage?.outputTokens)}`).toBe('number');

      // And bills a subscription : no dollar figure exists to report. An
      // estimate here would be an invented measurement.
      expect(usage?.costUsd).toBeNull();
    },
    140_000
  );

  // The fact the whole per-turn effort design rests on : `exec resume` accepts
  // a `-c model_reasoning_effort=` override, so a change applies to the very
  // next message without restarting the session. Measured by hand once ; this
  // makes it reproducible instead of a memory claim. A CLI that rejected the
  // override would exit 2 ("unexpected argument") and surface an error frame.
  it.skipIf(!RUN_LIVE)(
    'a per-turn effort change survives the resume: low then high, both complete',
    async () => {
      const broadcasts: LocalChatMessage[] = [];
      // The argv of every REAL spawn, recorded on the way through. Asserting
      // only that both turns complete cannot tell a resumed turn from a second
      // fresh one — a fresh turn completes just as happily, so deleting the
      // whole resume machinery left the previous version of this test green.
      // Recording the arguments is what makes the resume itself falsifiable,
      // while the process still really runs.
      const spawns: string[][] = [];
      const bridge = new LocalChatBridge({
        broadcast: (m) => broadcasts.push(m),
        spawnFn: ((cmd: string, args: string[], opts: Parameters<typeof spawn>[2]) => {
          spawns.push(args);
          return spawn(cmd, args, opts as never);
        }) as unknown as SpawnFn,
      });

      const { sessionId } = await bridge.start({ cwd, cli: 'codex' });

      let mark = broadcasts.length;
      await bridge.send(sessionId, 'Reply with exactly one word: ONE', { reasoningEffort: 'low' });
      await settleAfter(broadcasts, mark, 120_000);
      const errorsLow = broadcasts.slice(mark).filter((b) => b.type === 'error') as
        Extract<LocalChatMessage, { type: 'error' }>[];
      expect(errorsLow, `turn at effort low errored: ${errorsLow.map((e) => e.error).join(' | ')}`).toEqual([]);
      expect(broadcasts.slice(mark).some((b) => b.type === 'complete')).toBe(true);

      // Turn 1 is a FRESH exec and carries the low override.
      expect(spawns).toHaveLength(1);
      expect(spawns[0][0]).toBe('exec');
      expect(spawns[0]).not.toContain('resume');
      expect(spawns[0]).toContain('model_reasoning_effort=low');

      // A DIFFERENT effort on the resumed turn — the risky half.
      mark = broadcasts.length;
      await bridge.send(sessionId, 'Reply with exactly one word: TWO', { reasoningEffort: 'high' });
      await settleAfter(broadcasts, mark, 180_000);
      const errorsHigh = broadcasts.slice(mark).filter((b) => b.type === 'error') as
        Extract<LocalChatMessage, { type: 'error' }>[];
      expect(errorsHigh, `resumed turn at effort high errored: ${errorsHigh.map((e) => e.error).join(' | ')}`).toEqual([]);
      expect(broadcasts.slice(mark).some((b) => b.type === 'complete')).toBe(true);

      // Turn 2 went through `exec resume <thread_id>` with the NEW effort, and
      // without -m (the model stays session-scoped by product decision). This is
      // the assertion the whole per-turn design rests on.
      expect(spawns).toHaveLength(2);
      expect(spawns[1].slice(0, 2)).toEqual(['exec', 'resume']);
      expect(spawns[1][2]).toMatch(/^[0-9a-f-]{16,}$/i); // a real thread id, not a placeholder
      expect(spawns[1]).toContain('model_reasoning_effort=high');
      expect(spawns[1]).not.toContain('model_reasoning_effort=low');
      expect(spawns[1]).not.toContain('-m');

      await bridge.stop(sessionId);
    },
    330_000
  );
});
