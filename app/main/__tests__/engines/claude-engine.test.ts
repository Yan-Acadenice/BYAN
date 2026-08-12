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
import { buildActivityTimeline, type LocalChatActivity } from '../../../shared/tool-activity';

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

// The activity lines the interface would receive, in order.
function activities(emitted: LocalChatMessage[]): LocalChatActivity[] {
  return emitted
    .filter((m): m is Extract<LocalChatMessage, { type: 'tool' }> => m.type === 'tool')
    .map((m) => m.activity)
    .filter((a): a is LocalChatActivity => Boolean(a));
}

// Verbatim from the 2026-07-31 probe against claude 2.1.220: the assistant frame
// opens the call, the user frame that FOLLOWS closes it with the same id. Both
// carry a top-level ISO timestamp.
const CALL_ID = 'toolu_014EfRMVkQAPt7UPB79ggMXh';
const T_START = '2026-07-31T09:41:16.116Z';
const T_END = '2026-07-31T09:41:23.120Z';

function toolUseFrame(id = CALL_ID, timestamp = T_START) {
  return {
    type: 'assistant',
    timestamp,
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: 'ls' } }] },
  };
}

function toolResultFrame(id = CALL_ID, timestamp = T_END, is_error?: boolean) {
  const block: Record<string, unknown> = { type: 'tool_result', tool_use_id: id, content: 'total 4' };
  if (is_error !== undefined) block.is_error = is_error;
  return { type: 'user', timestamp, message: { role: 'user', content: [block] } };
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

describe('ClaudeEngine argv — the effort flag', () => {
  // This describe used to be called "effort is structurally unreachable" and
  // asserted the OPPOSITE: that an effort arriving on EngineStartOpts must leave
  // no trace in argv, because claude had no such flag. That premise was a wrong
  // measurement, not a design choice.
  //
  // Measured on claude 2.1.220: `--effort <level>`, "Effort level for the current
  // session", valid values low / medium / high / xhigh / max. The guard therefore
  // flips: the flag must REACH argv, or the setting the user chose does nothing.
  it('passes the effort through as --effort', () => {
    const { args } = startEngine({ agent: 'dev', model: 'opus', effort: 'high' });
    expect(args).toEqual([...BASE_ARGS, '--agent', 'dev', '--model', 'opus', '--effort', 'high']);
  });

  it('omits the flag entirely when no effort was chosen', () => {
    // Absent, not a literal default: passing a value we invented would override
    // whatever the CLI or the user's own config decides.
    const { args } = startEngine({ model: 'opus' });
    expect(args.join(' ')).not.toContain('--effort');
  });

  it('carries it on argv, not through the environment', () => {
    // A setting smuggled through env is invisible to anyone reading the command
    // line, which is the first thing looked at when a turn behaves oddly.
    const { spawnFn, args } = startEngine({ effort: 'max' });
    const [cmd, , spawnOpts] = spawnFn.mock.calls[0];
    expect(cmd).toBe('claude');
    expect(args).toContain('--effort');
    expect(JSON.stringify(spawnOpts.env)).not.toMatch(/reasoning|effort/i);
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

// Until now the engine only ever announced that a tool STARTED, so no step had a
// second bound and no duration could be shown. claude does publish the end — in
// the `user` frame that follows the call — and the engine fell through to
// `default` and dropped it. These tests pin the pairing.
describe('ClaudeEngine — bounding a tool call in time', () => {
  it('closes the call opened by the assistant frame, on the id claude itself gave', () => {
    const { proc, emitted } = startEngine();
    proc.emitStdout(toolUseFrame());
    proc.emitStdout(toolResultFrame(CALL_ID, T_END, false));

    const [begun, ended] = activities(emitted);
    expect(begun).toEqual({ name: 'Bash', detail: 'ls', phase: 'start', id: CALL_ID, at: Date.parse(T_START) });
    expect(ended).toEqual({ name: 'Bash', detail: 'ls', phase: 'end', id: CALL_ID, at: Date.parse(T_END), ok: true });
  });

  it('yields ONE step with a measured duration once both halves are in', () => {
    const { proc, emitted } = startEngine();
    proc.emitStdout(toolUseFrame());
    proc.emitStdout(toolResultFrame());

    const timeline = buildActivityTimeline(activities(emitted));
    expect(timeline.steps).toHaveLength(1);
    // 09:41:23.120 - 09:41:16.116, straight from claude's own clock.
    expect(timeline.steps[0]).toMatchObject({ name: 'Bash', open: false, durationMs: 7004 });
    expect(timeline.openCount).toBe(0);
  });

  it('dates the step from claude\'s stamp, not from the moment we read the pipe', () => {
    // The pipe delivers whenever it delivers; the frame says when the work
    // actually happened. A step drawn on read-time would drift under buffering.
    const { proc, emitted } = startEngine();
    proc.emitStdout(toolUseFrame());
    expect(activities(emitted)[0].at).toBe(Date.parse(T_START));
    expect(Math.abs(activities(emitted)[0].at - Date.now())).toBeGreaterThan(1000);
  });

  it('falls back to our own clock only when the frame carries no stamp', () => {
    const before = Date.now();
    const { proc, emitted } = startEngine();
    proc.emitStdout({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_z', name: 'Read', input: {} }] } });
    const at = activities(emitted)[0].at;
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it('leaves a call with no result OPEN — no invented end at the end of the turn', () => {
    const { proc, emitted } = startEngine();
    proc.emitStdout(toolUseFrame());
    proc.emitStdout({ type: 'result', result: 'ok', total_cost_usd: 0.01, duration_ms: 9000 });

    expect(activities(emitted)).toHaveLength(1);
    const timeline = buildActivityTimeline(activities(emitted));
    expect(timeline.openCount).toBe(1);
    expect(timeline.steps[0].endedAt).toBeUndefined();
    // The turn reports 9000 ms; that is the TURN, not this step. Borrowing it
    // would be inventing a measurement.
    expect(timeline.steps[0].durationMs).toBeUndefined();
  });

  it('reports a failed tool as a step that did not go through', () => {
    const { proc, emitted } = startEngine();
    proc.emitStdout(toolUseFrame());
    proc.emitStdout(toolResultFrame(CALL_ID, T_END, true));
    expect(activities(emitted)[1].ok).toBe(false);
  });

  it('leaves the verdict unknown when claude reports none', () => {
    // Measured: a Read result carries no is_error field at all.
    const { proc, emitted } = startEngine();
    proc.emitStdout(toolUseFrame());
    proc.emitStdout(toolResultFrame(CALL_ID, T_END));
    expect(activities(emitted)[1].ok).toBeUndefined();
  });

  it('pairs two interleaved calls by id rather than by arrival order', () => {
    const { proc, emitted } = startEngine();
    proc.emitStdout(toolUseFrame('toolu_a', '2026-07-31T09:41:00.000Z'));
    proc.emitStdout(toolUseFrame('toolu_b', '2026-07-31T09:41:01.000Z'));
    proc.emitStdout(toolResultFrame('toolu_b', '2026-07-31T09:41:02.000Z'));
    proc.emitStdout(toolResultFrame('toolu_a', '2026-07-31T09:41:05.000Z'));

    const timeline = buildActivityTimeline(activities(emitted));
    expect(timeline.steps.map((s) => s.durationMs)).toEqual([5000, 1000]);
    // b ran entirely inside a: the interface can show two lanes, not a queue.
    expect(timeline.concurrent).toBe(true);
  });

  it('forgets what is still open once the turn is over', () => {
    // The map of live calls must not grow for the whole life of a session. The
    // price is visible and accepted: a result arriving after the turn's own
    // terminal frame can no longer be given the name of its start.
    const { proc, emitted } = startEngine();
    proc.emitStdout(toolUseFrame());
    proc.emitStdout({ type: 'result', result: 'ok' });
    proc.emitStdout(toolResultFrame());
    expect(activities(emitted)[1]).toMatchObject({ name: 'outil', phase: 'end', id: CALL_ID });
  });

  it('ignores a user frame that is only our own turn echoed back', () => {
    const { proc, emitted } = startEngine();
    proc.emitStdout({ type: 'user', timestamp: T_START, message: { role: 'user', content: 'salut' } });
    expect(activities(emitted)).toHaveLength(0);
  });

  it('ignores a tool_result that names no call — it would close nothing', () => {
    const { proc, emitted } = startEngine();
    proc.emitStdout({ type: 'user', timestamp: T_END, message: { content: [{ type: 'tool_result', content: 'x' }] } });
    expect(activities(emitted)).toHaveLength(0);
  });
});
