// LocalChatBridge tests (N3) — native local claude, no server. A fake child
// process (injected spawn) drives start/send/stop + stream-json parsing, so no
// real claude binary is needed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalChatBridge, type SpawnFn } from '../../ipc-handlers/local-chat';
import type { LocalChatMessage } from '../../../shared/ipc-contract';

// Minimal fake ChildProcess.
class FakeProc extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { writable: true, written: [] as string[], write(s: string) { this.written.push(s); return true; } };
  killed = false;
  kill(_sig?: string) { this.killed = true; return true; }
  emitStdout(obj: unknown) { this.stdout.emit('data', Buffer.from(JSON.stringify(obj) + '\n')); }
}

let cwd: string;
const origHome = process.env.BYAN_HOME;

function makeBridge(opts: { resolveBin?: (n: string) => string | null } = {}) {
  const broadcasts: LocalChatMessage[] = [];
  const fake = new FakeProc();
  const spawnFn = vi.fn((() => fake) as unknown as SpawnFn);
  const bridge = new LocalChatBridge({
    spawnFn,
    broadcast: (m) => broadcasts.push(m),
    defaultCwd: () => cwd,
    // Deterministic: default to bare 'claude' (resolver finds nothing) + a fixed env.
    resolveBin: opts.resolveBin ?? (() => null),
    spawnEnv: () => ({ PATH: '/fake/bin' }),
  });
  return { bridge, fake, spawnFn, broadcasts };
}

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-lc-'));
  // Empty registry so list() is deterministic.
  process.env.BYAN_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-lc-home-'));
});
afterEach(() => {
  if (origHome === undefined) delete process.env.BYAN_HOME;
  else process.env.BYAN_HOME = origHome;
  try { fs.rmSync(cwd, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('LocalChatBridge.start', () => {
  it('spawns claude with stream-json in the project cwd and returns a sessionId', async () => {
    const { bridge, spawnFn, broadcasts } = makeBridge();
    const { sessionId } = await bridge.start({ cwd });
    expect(sessionId).toBeTruthy();
    const [cmd, args, opts] = spawnFn.mock.calls[0];
    expect(cmd).toBe('claude');
    // --verbose is MANDATORY with --print + --output-format stream-json, else the
    // CLI refuses: "When using --print, --output-format=stream-json requires --verbose".
    expect(args).toEqual(['--print', '--verbose', '--output-format', 'stream-json', '--input-format', 'stream-json']);
    expect(opts.cwd).toBe(cwd);
    expect(broadcasts[0]).toMatchObject({ type: 'started', cli: 'claude' });
  });

  it('spawns the RESOLVED absolute claude path with the augmented PATH env (ENOENT fix)', async () => {
    const { bridge, spawnFn } = makeBridge({ resolveBin: () => '/home/yan/.local/bin/claude' });
    await bridge.start({ cwd });
    const [binCmd, , opts] = spawnFn.mock.calls[0];
    expect(binCmd).toBe('/home/yan/.local/bin/claude'); // absolute, not the bare name
    expect(opts.env).toEqual({ PATH: '/fake/bin' });    // real PATH handed to claude
  });

  it('adds --agent but NEVER --resume (a record id is not claude uuid)', async () => {
    const { bridge, spawnFn } = makeBridge();
    await bridge.start({ cwd, agent: 'dev', resumeSessionId: 'chat-rec-id' });
    const args = spawnFn.mock.calls[0][1];
    expect(args).toContain('--agent');
    expect(args).toContain('dev');
    expect(args).not.toContain('--resume');
    expect(args).not.toContain('chat-rec-id');
  });

  it('caps concurrent sessions (rejects past the max)', async () => {
    const { bridge } = makeBridge();
    // makeBridge reuses ONE fake proc, but the map keys on distinct sessionIds.
    for (let i = 0; i < 8; i++) await bridge.start({ cwd });
    await expect(bridge.start({ cwd })).rejects.toThrow(/trop de sessions/i);
  });

  it('rejects when no valid project dir is available', async () => {
    const { bridge } = makeBridge();
    cwd = ''; // defaultCwd now empty
    await expect(bridge.start()).rejects.toThrow(/dossier de projet/i);
  });

  it('rejects a non-absolute cwd', async () => {
    const { bridge } = makeBridge();
    await expect(bridge.start({ cwd: 'relatif' })).rejects.toThrow(/dossier de projet/i);
  });
});

describe('LocalChatBridge.send / stop', () => {
  it('writes a user turn to claude stdin in the stream-json message shape', async () => {
    const { bridge, fake } = makeBridge();
    const { sessionId } = await bridge.start({ cwd });
    await bridge.send(sessionId, 'bonjour');
    // MUST carry the message/role wrapper — a flat {type,content} makes the CLI
    // throw "Expected message role 'user', got 'undefined'".
    expect(JSON.parse(fake.stdin.written[0])).toEqual({
      type: 'user',
      message: { role: 'user', content: 'bonjour' },
    });
  });

  it('send rejects for an unknown session', async () => {
    const { bridge } = makeBridge();
    await expect(bridge.send('nope', 'x')).rejects.toThrow(/session/i);
  });

  it('stop kills the process and broadcasts stopped', async () => {
    const { bridge, fake, broadcasts } = makeBridge();
    const { sessionId } = await bridge.start({ cwd });
    await bridge.stop(sessionId);
    expect(fake.killed).toBe(true);
    expect(broadcasts.some((b) => b.type === 'stopped')).toBe(true);
  });

  it('stop is a no-op for an unknown session', async () => {
    const { bridge } = makeBridge();
    await expect(bridge.stop('nope')).resolves.toBeUndefined();
  });

  it('stopAll kills every live session and drains the map (app quit)', async () => {
    const { bridge, fake } = makeBridge();
    const { sessionId: a } = await bridge.start({ cwd });
    const { sessionId: b } = await bridge.start({ cwd });
    bridge.stopAll();
    expect(fake.killed).toBe(true);
    // Both sessions are gone — sending to either now rejects (no orphan kept).
    await expect(bridge.send(a, 'x')).rejects.toThrow(/session/i);
    await expect(bridge.send(b, 'x')).rejects.toThrow(/session/i);
  });

  it.skipIf(process.platform === 'win32')(
    'stopAll signals the process GROUP so claude AND its MCP child are reaped (POSIX)',
    async () => {
      const { bridge, fake } = makeBridge();
      (fake as unknown as { pid: number }).pid = 4242;
      const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true as unknown as boolean);
      try {
        await bridge.start({ cwd });
        bridge.stopAll();
        // Negative pid -> the whole group (claude + the node MCP child it forked).
        expect(killSpy).toHaveBeenCalledWith(-4242, 'SIGTERM');
        expect(killSpy).toHaveBeenCalledWith(-4242, 'SIGKILL');
      } finally {
        killSpy.mockRestore();
      }
    }
  );

  it('start rejects once stopAll has flagged the app as quitting', async () => {
    const { bridge } = makeBridge();
    bridge.stopAll();
    await expect(bridge.start({ cwd })).rejects.toThrow(/fermeture/i);
  });
});

describe('LocalChatBridge stream-json parsing', () => {
  it('maps assistant text, result and error events to LocalChatMessage', async () => {
    const { bridge, fake, broadcasts } = makeBridge();
    const { sessionId } = await bridge.start({ cwd });
    broadcasts.length = 0;

    fake.emitStdout({ type: 'assistant', message: { content: [{ type: 'text', text: 'Salut' }] } });
    fake.emitStdout({ type: 'result', result: 'ok' });

    const chunk = broadcasts.find((b) => b.type === 'chunk') as Extract<LocalChatMessage, { type: 'chunk' }>;
    expect(chunk?.delta).toBe('Salut');
    expect(chunk?.sessionId).toBe(sessionId);
    expect(broadcasts.some((b) => b.type === 'complete')).toBe(true);

    fake.emitStdout({ type: 'error', error: 'boom' });
    expect(broadcasts.some((b) => b.type === 'error')).toBe(true);
  });

  it('maps content_block_delta text_delta to a chunk', async () => {
    const { bridge, fake, broadcasts } = makeBridge();
    await bridge.start({ cwd });
    broadcasts.length = 0;
    fake.emitStdout({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'delta!' } });
    const chunk = broadcasts.find((b) => b.type === 'chunk') as Extract<LocalChatMessage, { type: 'chunk' }>;
    expect(chunk?.delta).toBe('delta!');
  });

  it('treats a non-JSON stdout line as a raw assistant chunk', async () => {
    const { bridge, fake, broadcasts } = makeBridge();
    await bridge.start({ cwd });
    broadcasts.length = 0;
    fake.stdout.emit('data', Buffer.from('texte brut\n'));
    const chunk = broadcasts.find((b) => b.type === 'chunk') as Extract<LocalChatMessage, { type: 'chunk' }>;
    expect(chunk?.delta).toBe('texte brut');
  });

  it('surfaces a result with is_error:true as an error, not a silent complete', async () => {
    const { bridge, fake, broadcasts } = makeBridge();
    await bridge.start({ cwd });
    broadcasts.length = 0;
    fake.emitStdout({ type: 'result', is_error: true, subtype: 'error_max_turns', result: 'boom' });
    expect(broadcasts.some((b) => b.type === 'complete')).toBe(false);
    const err = broadcasts.find((b) => b.type === 'error') as Extract<LocalChatMessage, { type: 'error' }>;
    expect(err?.error).toContain('boom');
  });

  it('does NOT swallow a real stderr error that follows a benign line in one chunk', async () => {
    const { bridge, fake, broadcasts } = makeBridge();
    await bridge.start({ cwd });
    broadcasts.length = 0;
    // benign first line + real error second line, same chunk : the old /m single
    // test returned early and swallowed the error.
    fake.stderr.emit('data', Buffer.from('Loading model\nError: quota dépassé\n'));
    const err = broadcasts.find((b) => b.type === 'error') as Extract<LocalChatMessage, { type: 'error' }>;
    expect(err).toBeDefined();
    expect(err.error).toContain('quota dépassé');
    expect(err.error).not.toContain('Loading');
  });

  it('flushes a trailing stdout line with no newline on stream end', async () => {
    const { bridge, fake, broadcasts } = makeBridge();
    await bridge.start({ cwd });
    broadcasts.length = 0;
    // final event arrives without a closing \n, then the stream ends.
    fake.stdout.emit('data', Buffer.from('{"type":"result","result":"tail"}'));
    expect(broadcasts.some((b) => b.type === 'complete')).toBe(false); // buffered, not parsed yet
    fake.stdout.emit('end');
    const done = broadcasts.find((b) => b.type === 'complete') as Extract<LocalChatMessage, { type: 'complete' }>;
    expect(done?.result).toBe('tail');
  });

  it('decodes a multi-byte UTF-8 char split across two data chunks', async () => {
    const { bridge, fake, broadcasts } = makeBridge();
    await bridge.start({ cwd });
    broadcasts.length = 0;
    const full = Buffer.from(
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'café' }] } }) + '\n',
      'utf8'
    );
    // Split the buffer INSIDE the 2-byte 'é' (bytes 0xc3 0xa9) to force a boundary.
    const cut = full.indexOf(0xc3) + 1;
    fake.stdout.emit('data', full.subarray(0, cut));
    fake.stdout.emit('data', full.subarray(cut));
    const chunk = broadcasts.find((b) => b.type === 'chunk') as Extract<LocalChatMessage, { type: 'chunk' }>;
    expect(chunk?.delta).toBe('café'); // not "cafÃ©"
  });
});

describe('LocalChatBridge — model/effort trust boundary (F6)', () => {
  // The engines push model/effort straight into argv without re-checking, so
  // every rejection below is what keeps an unvalidated token out of a spawn.

  it('rejects an unknown effort value before spawning anything', async () => {
    const { bridge, spawnFn } = makeBridge();
    await expect(bridge.start({ cwd, cli: 'codex', effort: 'ultra' as never }))
      .rejects.toThrow(/effort invalide/i);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('rejects a model that does not belong to the engine', async () => {
    const { bridge, spawnFn } = makeBridge();
    await expect(bridge.start({ cwd, cli: 'claude', model: 'gpt-4' }))
      .rejects.toThrow(/modele invalide/i);
    // And the reverse direction.
    await expect(bridge.start({ cwd, cli: 'codex', model: 'opus' }))
      .rejects.toThrow(/modele invalide/i);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('rejects a model carrying shell/TOML-meaningful characters', async () => {
    const { bridge, spawnFn } = makeBridge();
    await expect(bridge.start({ cwd, cli: 'codex', model: 'gpt-5; rm -rf /' }))
      .rejects.toThrow(/modele invalide/i);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('APPLIES an effort sent for claude and echoes it on started', async () => {
    // This used to assert the effort was DROPPED for claude, on the belief that
    // claude had no such flag. It has one (`--effort`, measured on 2.1.220), so
    // dropping it would discard a setting the user chose.
    const { bridge, broadcasts } = makeBridge();
    await bridge.start({ cwd, cli: 'claude', effort: 'high', model: 'opus' });
    const started = broadcasts.find((b) => b.type === 'started') as Extract<LocalChatMessage, { type: 'started' }>;
    expect(started.effort).toBe('high');
    expect(started.model).toBe('opus');
  });

  it('refuses a value claude does not accept, naming the ones it does', async () => {
    // 'none' is valid for codex and NOT for claude. Letting it through would be
    // worse than an error: claude warns, ignores it, and runs on its default — so
    // the user gets a setting that reports success and changes nothing.
    const { bridge, spawnFn } = makeBridge();
    await expect(bridge.start({ cwd, cli: 'claude', effort: 'none' as never }))
      .rejects.toThrow(/effort invalide pour claude/i);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('still accepts that same value for codex', async () => {
    const { bridge, broadcasts } = makeBridge();
    await bridge.start({ cwd, cli: 'codex', effort: 'none' });
    const started = broadcasts.find((b) => b.type === 'started') as Extract<LocalChatMessage, { type: 'started' }>;
    expect(started.effort).toBe('none');
  });

  it('does not forward a per-turn effort to claude — its flag lives on the process', async () => {
    // claude reads --effort at spawn. Sending one mid-session would be a control
    // that reports a change the running process cannot make.
    const sent: Array<{ turnOpts?: unknown }> = [];
    const { bridge } = makeBridge();
    const { sessionId } = await bridge.start({ cwd, cli: 'claude' });
    const entry = (bridge as unknown as { sessions: Map<string, { session: { send: (m: string, t?: unknown) => Promise<void> } }> }).sessions.get(sessionId);
    if (entry) entry.session.send = async (_m, t) => { sent.push({ turnOpts: t }); };
    await bridge.send(sessionId, 'salut', { reasoningEffort: 'high' });
    expect(sent[0]?.turnOpts).toBeUndefined();
  });

  it('turns a tool_use frame into a readable activity instead of a raw payload', async () => {
    // The frame below is a verbatim capture from claude 2.1.220. Without the
    // normalized `activity` the renderer would have to parse claude's own shape,
    // which is why it dropped these frames and showed a bare spinner.
    const { bridge, fake, broadcasts } = makeBridge();
    await bridge.start({ cwd, cli: 'claude' });
    const before = Date.now();
    fake.emitStdout({
      type: 'assistant',
      message: { content: [{
        type: 'tool_use',
        id: 'toolu_018WtHBQRwsdZ9C3ffwtzkxk',
        name: 'Bash',
        input: { command: 'ls', description: 'Liste les fichiers du dossier courant' },
      }] },
    });
    const tool = broadcasts.find((b) => b.type === 'tool') as Extract<LocalChatMessage, { type: 'tool' }>;
    expect(tool).toBeTruthy();
    // An activity now also has to be PAIRABLE and PLACEABLE IN TIME, so `id` and
    // `at` joined the shape (shared/tool-activity.ts). `id` is what lets the
    // later tool_result close THIS call rather than some other one, so it is
    // pinned verbatim — it is the whole point of the field.
    //
    // Deliberately still toEqual, not toMatchObject: exhaustiveness is what
    // stops a stray field appearing unnoticed. Only the clock-derived value is
    // matched loosely, and it is bounded just below — `expect.any(Number)` alone
    // would accept a fabricated 0, which is exactly the lie this field must not
    // tell. This frame carries no timestamp of its own, so `at` is our clock.
    const activity = tool.activity;
    expect(activity).toEqual({
      name: 'Bash',
      detail: 'ls',
      phase: 'start',
      id: 'toolu_018WtHBQRwsdZ9C3ffwtzkxk',
      at: expect.any(Number),
    });
    expect(activity?.at ?? 0).toBeGreaterThanOrEqual(before);
    expect(activity?.at ?? 0).toBeLessThanOrEqual(Date.now());
  });

  it('surfaces the reasoning counter that arrives while no text is produced', async () => {
    // Verbatim capture. These frames land exactly during the long silent stretch,
    // so dropping them threw away the only available proof of life.
    const { bridge, fake, broadcasts } = makeBridge();
    await bridge.start({ cwd, cli: 'claude' });
    fake.emitStdout({ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 50, estimated_tokens_delta: 50 });
    const think = broadcasts.find((b) => b.type === 'thinking') as Extract<LocalChatMessage, { type: 'thinking' }>;
    expect(think).toBeTruthy();
    expect(think.tokens).toBe(50);
  });

  it('does not mistake another system frame for a reasoning report', async () => {
    const { bridge, fake, broadcasts } = makeBridge();
    await bridge.start({ cwd, cli: 'claude' });
    fake.emitStdout({ type: 'system', subtype: 'init', session_id: 'x' });
    expect(broadcasts.some((b) => b.type === 'thinking')).toBe(false);
  });

  it('RETURNS the resolved cwd, including the one the caller never sent', async () => {
    // The renderer is allowed to start without a cwd and let the bridge fall back
    // to the registry / onboarding root. Before this, the answer carried only the
    // session id, so the view had no way to learn where the session actually ran
    // and its folder chip kept inviting the user to pick one.
    const { bridge } = makeBridge();
    const withoutCwd = await bridge.start({ cli: 'claude' });
    expect(withoutCwd.cwd).toBe(cwd);

    const explicit = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-lc-explicit-'));
    const withCwd = await bridge.start({ cli: 'claude', cwd: explicit });
    expect(withCwd.cwd).toBe(explicit);
  });

  it('echoes the applied model+effort on the started frame for codex', async () => {
    const { bridge, broadcasts } = makeBridge();
    await bridge.start({ cwd, cli: 'codex', model: 'gpt-5.6-sol', effort: 'xhigh' });
    const started = broadcasts.find((b) => b.type === 'started') as Extract<LocalChatMessage, { type: 'started' }>;
    expect(started).toMatchObject({ cli: 'codex', model: 'gpt-5.6-sol', effort: 'xhigh' });
  });

  it('forwards a per-turn effort to a codex session', async () => {
    const sent: Array<{ message: string; turnOpts?: unknown }> = [];
    const bridge = new LocalChatBridge({
      spawnFn: vi.fn((() => new FakeProc()) as unknown as SpawnFn),
      broadcast: () => {},
      defaultCwd: () => cwd,
      resolveBin: () => null,
      spawnEnv: () => ({ PATH: '/fake/bin' }),
      readMcp: async () => [],
    });
    const { sessionId } = await bridge.start({ cwd, cli: 'codex' });
    // Swap in a recording session double: this asserts the BRIDGE's forwarding,
    // independently of how the codex engine builds its argv.
    const entry = (bridge as unknown as { sessions: Map<string, { engine: string; session: { send: (m: string, t?: unknown) => void } }> }).sessions.get(sessionId)!;
    entry.session = { send: (message, turnOpts) => { sent.push({ message, turnOpts }); } } as never;

    await bridge.send(sessionId, 'salut', { reasoningEffort: 'low' });
    expect(sent[0]).toEqual({ message: 'salut', turnOpts: { reasoningEffort: 'low' } });
  });

  it('rejects a per-turn effort that is not a known value', async () => {
    const { bridge } = makeBridge();
    const { sessionId } = await bridge.start({ cwd, cli: 'codex' });
    await expect(bridge.send(sessionId, 'x', { reasoningEffort: 'nope' as never }))
      .rejects.toThrow(/effort invalide/i);
  });

  it('does NOT forward a per-turn effort to a claude session', async () => {
    const sent: Array<{ message: string; turnOpts?: unknown }> = [];
    const { bridge } = makeBridge();
    const { sessionId } = await bridge.start({ cwd, cli: 'claude' });
    const entry = (bridge as unknown as { sessions: Map<string, { engine: string; session: { send: (m: string, t?: unknown) => void } }> }).sessions.get(sessionId)!;
    entry.session = { send: (message, turnOpts) => { sent.push({ message, turnOpts }); } } as never;

    await bridge.send(sessionId, 'salut', { reasoningEffort: 'high' });
    expect(sent[0]).toEqual({ message: 'salut', turnOpts: undefined });
  });
});

describe('LocalChatBridge lifecycle', () => {
  it('cleans the session on process exit (send then rejects)', async () => {
    const { bridge, fake } = makeBridge();
    const { sessionId } = await bridge.start({ cwd });
    fake.emit('exit', 0, null);
    await expect(bridge.send(sessionId, 'x')).rejects.toThrow(/session/i);
  });

  it('rejects a start whose cwd resolution straddles stopAll (quit race)', async () => {
    // stopAll() fires WHILE start() awaits its async defaultCwd: the quit flag
    // must be re-checked after that gap, else the spawn escapes the sweep and
    // the claude child orphans.
    let resolveCwd!: (v: string) => void;
    const pending = new Promise<string>((r) => { resolveCwd = r; });
    const spawnFn = vi.fn((() => new FakeProc()) as unknown as SpawnFn);
    const bridge = new LocalChatBridge({
      spawnFn,
      broadcast: () => {},
      defaultCwd: () => pending,
      resolveBin: () => null,
      spawnEnv: () => ({ PATH: '/fake/bin' }),
    });
    const starting = bridge.start();
    bridge.stopAll();
    resolveCwd(cwd);
    await expect(starting).rejects.toThrow(/fermeture/i);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('rejects an unknown engine name (never a spawn-any-binary surface)', async () => {
    const { bridge } = makeBridge();
    await expect(bridge.start({ cwd, cli: 'bash' as never })).rejects.toThrow(/moteur inconnu/i);
  });
});

describe('LocalChatBridge.list / history', () => {
  it('list reads local sessions from disk (empty registry -> [])', async () => {
    const { bridge } = makeBridge();
    expect(await bridge.list()).toEqual([]);
  });
  it('history is empty for native sessions', async () => {
    const { bridge } = makeBridge();
    expect(await bridge.history('x')).toEqual([]);
  });
});
