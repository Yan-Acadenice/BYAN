// LocalClaudeBridge tests (N3) — native local claude, no server. A fake child
// process (injected spawn) drives start/send/stop + stream-json parsing, so no
// real claude binary is needed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalClaudeBridge, type SpawnFn } from '../../ipc-handlers/local-chat';
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
  const bridge = new LocalClaudeBridge({
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

describe('LocalClaudeBridge.start', () => {
  it('spawns claude with stream-json in the project cwd and returns a sessionId', async () => {
    const { bridge, spawnFn, broadcasts } = makeBridge();
    const { sessionId } = await bridge.start({ cwd });
    expect(sessionId).toBeTruthy();
    const [cmd, args, opts] = spawnFn.mock.calls[0];
    expect(cmd).toBe('claude');
    expect(args).toEqual(['--print', '--output-format', 'stream-json', '--input-format', 'stream-json']);
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

describe('LocalClaudeBridge.send / stop', () => {
  it('writes a user turn to claude stdin', async () => {
    const { bridge, fake } = makeBridge();
    const { sessionId } = await bridge.start({ cwd });
    await bridge.send(sessionId, 'bonjour');
    expect(JSON.parse(fake.stdin.written[0])).toEqual({ type: 'user', content: 'bonjour' });
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
});

describe('LocalClaudeBridge stream-json parsing', () => {
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
});

describe('LocalClaudeBridge lifecycle', () => {
  it('cleans the session on process exit (send then rejects)', async () => {
    const { bridge, fake } = makeBridge();
    const { sessionId } = await bridge.start({ cwd });
    fake.emit('exit', 0, null);
    await expect(bridge.send(sessionId, 'x')).rejects.toThrow(/session/i);
  });
});

describe('LocalClaudeBridge.list / history', () => {
  it('list reads local sessions from disk (empty registry -> [])', async () => {
    const { bridge } = makeBridge();
    expect(await bridge.list()).toEqual([]);
  });
  it('history is empty for native sessions', async () => {
    const { bridge } = makeBridge();
    expect(await bridge.history('x')).toEqual([]);
  });
});
