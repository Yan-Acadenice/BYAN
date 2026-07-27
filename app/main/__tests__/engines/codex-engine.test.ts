// CodexEngine tests — the codex adapter in isolation (no bridge, no real
// binary). The bridge-level behaviours (per-turn spawn, resume chaining, JSONL
// mapping, stop semantics) are already covered by
// __tests__/ipc-handlers/local-chat-codex.test.ts and are NOT repeated here.
//
// What this file pins is the model/effort/usage seam, which the bridge cannot
// reach yet (it does not forward model/effort/turnOpts — that is F6):
//   - `-m` on a FRESH turn only, deliberately absent from resume;
//   - `-c model_reasoning_effort=` on BOTH fresh and resume, overridable per turn;
//   - codex's snake_case usage payload folded onto the camelCase IPC contract,
//     with costUsd null because codex reports no price at all.

import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import { CodexEngine } from '../../engines/codex-engine';
import type { EngineStartOpts, SpawnFn } from '../../engines/types';
import type { LocalChatMessage } from '../../../shared/ipc-contract';

// Minimal fake ChildProcess (same shape as the bridge-level codex tests).
class FakeProc extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = {
    writable: true,
    written: [] as string[],
    ended: false,
    write(s: string) { this.written.push(s); return true; },
    end() { this.ended = true; },
  };
  killed = false;
  kill(_sig?: string) { this.killed = true; return true; }
  emitLine(obj: unknown) { this.stdout.emit('data', Buffer.from(JSON.stringify(obj) + '\n')); }
}

// The adapter only hands this path to spawn (the bridge owns cwd validation), so
// a built path keeps the test valid on win32 too.
const CWD = path.join(os.tmpdir(), 'byan-codex-engine');

function startEngine(opts: Partial<EngineStartOpts> = {}) {
  const emitted: LocalChatMessage[] = [];
  const procs: FakeProc[] = [];
  const spawnFn = vi.fn((() => {
    const p = new FakeProc();
    procs.push(p);
    return p;
  }) as unknown as SpawnFn);
  const engine = new CodexEngine(
    { spawnFn, resolveBin: () => null, spawnEnv: () => ({ PATH: '/fake/bin' }) },
    async () => [] // no .mcp.json noise in these argv assertions
  );
  const session = engine.start({
    sessionId: 'sess-1',
    cwd: CWD,
    emit: (m) => emitted.push(m),
    onClose: vi.fn(),
    ...opts,
  });
  const argsOf = (call: number): string[] => spawnFn.mock.calls[call][1] as string[];
  return { session, procs, spawnFn, emitted, argsOf };
}

// Value that follows a flag, e.g. valueAfter(args, '-m').
function valueAfter(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

// Drive the first turn to its terminal frame so the next send() resumes.
async function firstTurnDone(procs: FakeProc[], threadId = 'thread-42'): Promise<void> {
  procs[0].emitLine({ type: 'thread.started', thread_id: threadId });
  procs[0].emitLine({ type: 'turn.completed' });
  procs[0].emit('exit', 0, null);
}

describe('CodexEngine argv — model and effort on a FRESH turn', () => {
  it('passes -m <model> and the effort -c pair', async () => {
    const { session, argsOf } = startEngine({ model: 'gpt-5.6-sol', effort: 'high' });
    await session.send('salut');
    const args = argsOf(0);
    expect(args).toContain('-m');
    expect(valueAfter(args, '-m')).toBe('gpt-5.6-sol');
    const i = args.indexOf('model_reasoning_effort=high');
    expect(i).toBeGreaterThan(0);
    expect(args[i - 1]).toBe('-c'); // the value must travel WITH its flag
    expect(args[args.length - 1]).toBe('-'); // prompt still over stdin
  });

  it('passes neither when the session names no model and no effort', async () => {
    const { session, argsOf } = startEngine();
    await session.send('salut');
    const args = argsOf(0);
    expect(args).not.toContain('-m');
    expect(args.join(' ')).not.toContain('model_reasoning_effort');
  });
});

describe('CodexEngine argv — RESUME turn', () => {
  it('keeps the effort override but carries NO -m (model is session-scoped)', async () => {
    const { session, procs, argsOf } = startEngine({ model: 'gpt-5.6-sol', effort: 'high' });
    await session.send('tour 1');
    await firstTurnDone(procs);
    await session.send('tour 2');
    const args2 = argsOf(1);
    expect(args2.slice(0, 3)).toEqual(['exec', 'resume', 'thread-42']);
    expect(args2).toContain('model_reasoning_effort=high');
    // -m IS accepted on resume (measured); its absence is the product decision
    // that a model change opens a new session.
    expect(args2).not.toContain('-m');
    expect(args2).not.toContain('gpt-5.6-sol');
  });

  it('a per-turn reasoningEffort overrides the session default on that turn', async () => {
    const { session, procs, argsOf } = startEngine({ model: 'gpt-5.6-sol', effort: 'high' });
    await session.send('tour 1');
    await firstTurnDone(procs);
    await session.send('tour 2', { reasoningEffort: 'low' });
    const args2 = argsOf(1);
    expect(args2).toContain('model_reasoning_effort=low');
    expect(args2).not.toContain('model_reasoning_effort=high');
  });

  it('an override-free turn falls back to the session effort', async () => {
    const { session, procs, argsOf } = startEngine({ effort: 'high' });
    await session.send('tour 1');
    await firstTurnDone(procs);
    await session.send('tour 2', {});
    expect(argsOf(1)).toContain('model_reasoning_effort=high');
  });
});

describe('CodexEngine usage — turn.completed', () => {
  it('folds the five counters onto the contract and reports NO dollar cost', async () => {
    const { session, procs, emitted } = startEngine({ model: 'gpt-5.6-sol' });
    await session.send('salut');
    emitted.length = 0;
    // Verbatim payload from a real codex turn (live-verified 2026-07-27).
    procs[0].emitLine({
      type: 'turn.completed',
      usage: { input_tokens: 37581, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 11, reasoning_output_tokens: 0 },
    });
    const done = emitted.find((m) => m.type === 'complete') as Extract<LocalChatMessage, { type: 'complete' }>;
    expect(done?.usage).toEqual({
      engine: 'codex',
      model: 'gpt-5.6-sol',
      inputTokens: 37581,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 11,
      reasoningOutputTokens: 0,
      // codex bills a subscription: no price is reported, and none is invented.
      costUsd: null,
    });
  });

  it('omits a counter the payload does not carry (no fabricated zero)', async () => {
    const { session, procs, emitted } = startEngine();
    await session.send('salut');
    emitted.length = 0;
    procs[0].emitLine({ type: 'turn.completed', usage: { input_tokens: 12, output_tokens: 'nope' } });
    const done = emitted.find((m) => m.type === 'complete') as Extract<LocalChatMessage, { type: 'complete' }>;
    expect(done?.usage).toEqual({ engine: 'codex', model: null, inputTokens: 12, costUsd: null });
    expect(done?.usage && 'outputTokens' in done.usage).toBe(false);
  });

  it('a turn.completed with no usage block still reports the engine and a null cost', async () => {
    const { session, procs, emitted } = startEngine();
    await session.send('salut');
    emitted.length = 0;
    procs[0].emitLine({ type: 'turn.completed' });
    const done = emitted.find((m) => m.type === 'complete') as Extract<LocalChatMessage, { type: 'complete' }>;
    expect(done?.usage).toEqual({ engine: 'codex', model: null, costUsd: null });
  });
});
