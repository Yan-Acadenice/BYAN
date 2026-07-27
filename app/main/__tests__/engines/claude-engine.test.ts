// ClaudeEngine tests — the claude adapter in isolation (no bridge, no real
// binary). A fake child process is injected through EngineDeps.spawnFn, so argv
// construction and stream-json parsing are both observable.
//
// Two facts are pinned here because they are cheap to break and expensive to
// notice: claude accepts --model, and claude has NO reasoning-effort flag in
// --print mode. The second is guarded by assertion, not by good intentions.

import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import { ClaudeEngine } from '../../engines/claude-engine';
import type { EngineStartOpts, SpawnFn } from '../../engines/types';
import type { LocalChatMessage } from '../../../shared/ipc-contract';

// Minimal fake ChildProcess (same shape as the local-chat bridge tests).
class FakeProc extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { writable: true, written: [] as string[], write(s: string) { this.written.push(s); return true; } };
  killed = false;
  kill(_sig?: string) { this.killed = true; return true; }
  emitStdout(obj: unknown) { this.stdout.emit('data', Buffer.from(JSON.stringify(obj) + '\n')); }
}

// The adapter never touches this path on disk — it only hands it to spawn — so a
// built path keeps the test valid on win32 as well.
const CWD = path.join(os.tmpdir(), 'byan-claude-engine');

const BASE_ARGS = ['--print', '--verbose', '--output-format', 'stream-json', '--input-format', 'stream-json'];

function startEngine(opts: Partial<EngineStartOpts> = {}) {
  const emitted: LocalChatMessage[] = [];
  const proc = new FakeProc();
  const spawnFn = vi.fn((() => proc) as unknown as SpawnFn);
  const onClose = vi.fn();
  const engine = new ClaudeEngine({
    spawnFn,
    resolveBin: () => null,
    spawnEnv: () => ({ PATH: '/fake/bin' }),
  });
  const session = engine.start({
    sessionId: 'sess-1',
    cwd: CWD,
    emit: (m) => emitted.push(m),
    onClose,
    ...opts,
  });
  return { session, proc, spawnFn, args: spawnFn.mock.calls[0][1], emitted, onClose };
}

function complete(emitted: LocalChatMessage[]) {
  return emitted.find((m) => m.type === 'complete') as Extract<LocalChatMessage, { type: 'complete' }> | undefined;
}

describe('ClaudeEngine argv — model', () => {
  it('pushes --model with the given value, after --agent', () => {
    const { args } = startEngine({ agent: 'dev', model: 'opus' });
    expect(args).toContain('--model');
    expect(args[args.indexOf('--model') + 1]).toBe('opus');
    expect(args.indexOf('--agent')).toBeLessThan(args.indexOf('--model'));
  });

  it('accepts a full model name as-is (aliases are not a closed set)', () => {
    const { args } = startEngine({ model: 'claude-fable-5' });
    expect(args).toEqual([...BASE_ARGS, '--model', 'claude-fable-5']);
  });

  it('omits --model entirely when no model is set', () => {
    expect(startEngine().args).toEqual(BASE_ARGS);
    expect(startEngine({ model: null }).args).toEqual(BASE_ARGS);
    expect(startEngine({ model: '' }).args).toEqual(BASE_ARGS);
  });
});

describe('ClaudeEngine argv — effort is structurally unreachable', () => {
  // ANTI-FAKE GUARD. claude exposes no reasoning-effort flag in --print mode, so
  // an effort arriving on EngineStartOpts must leave NO trace in argv. If this
  // fails, the adapter grew a setting the CLI does not have.
  it('never turns an effort into an argument, even when one is passed in', () => {
    const { args } = startEngine({ agent: 'dev', model: 'opus', effort: 'high' });
    for (const arg of args) expect(arg).not.toMatch(/reasoning|effort/i);
    expect(args.join(' ')).not.toMatch(/reasoning|effort/i);
    expect(args).not.toContain('high');
    // The rest of the command line is untouched by the effort being present.
    expect(args).toEqual([...BASE_ARGS, '--agent', 'dev', '--model', 'opus']);
  });

  it('does not smuggle the effort into the session env or the spawned command', () => {
    const { spawnFn } = startEngine({ effort: 'max' });
    const [cmd, , spawnOpts] = spawnFn.mock.calls[0];
    expect(cmd).toBe('claude');
    expect(JSON.stringify(spawnOpts.env)).not.toMatch(/reasoning|effort|max/i);
  });
});

describe('ClaudeEngine usage on complete', () => {
  it('carries cost and duration from the result event, tokens ABSENT', () => {
    const { proc, emitted } = startEngine({ model: 'opus' });
    proc.emitStdout({
      type: 'result',
      result: 'ok',
      session_id: 'claude-own-uuid',
      total_cost_usd: 0.08,
      duration_ms: 4210,
    });
    const done = complete(emitted);
    expect(done?.result).toBe('ok');
    expect(done?.usage?.engine).toBe('claude');
    expect(done?.usage?.model).toBe('opus');
    expect(done?.usage?.costUsd).toBe(0.08);
    expect(done?.usage?.durationMs).toBe(4210);
    // claude publishes no token breakdown in this stream: undefined, never 0.
    expect(done?.usage?.inputTokens).toBeUndefined();
    expect(done?.usage?.outputTokens).toBeUndefined();
    expect(done?.usage && 'inputTokens' in done.usage).toBe(false);
  });

  it('reports null (not 0) when the result event omits cost or duration', () => {
    const { proc, emitted } = startEngine();
    proc.emitStdout({ type: 'result', result: 'ok' });
    const done = complete(emitted);
    expect(done?.usage?.costUsd).toBeNull();
    expect(done?.usage?.durationMs).toBeNull();
    // No model chosen -> null, which reads as "the CLI default", not as a lie.
    expect(done?.usage?.model).toBeNull();
  });

  it('ignores non-numeric cost/duration rather than passing them through', () => {
    const { proc, emitted } = startEngine();
    proc.emitStdout({ type: 'result', result: 'ok', total_cost_usd: '0.08', duration_ms: null });
    const done = complete(emitted);
    expect(done?.usage?.costUsd).toBeNull();
    expect(done?.usage?.durationMs).toBeNull();
  });

  it('an is_error result stays an error — no usage-bearing complete', () => {
    const { proc, emitted } = startEngine({ model: 'opus' });
    proc.emitStdout({
      type: 'result',
      is_error: true,
      subtype: 'error_max_turns',
      result: 'boom',
      total_cost_usd: 0.02,
      duration_ms: 999,
    });
    expect(emitted.some((m) => m.type === 'complete')).toBe(false);
    const err = emitted.find((m) => m.type === 'error') as Extract<LocalChatMessage, { type: 'error' }>;
    expect(err?.error).toContain('boom');
  });
});
