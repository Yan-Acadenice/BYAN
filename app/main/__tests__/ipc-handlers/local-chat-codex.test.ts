// Codex engine through the bridge — per-turn spawn (`codex exec --json`),
// resume chaining, JSONL mapping, MCP -c wiring, stop semantics. A fake child
// process per spawn (injected) so no real codex binary is needed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalChatBridge, type SpawnFn } from '../../ipc-handlers/local-chat';
import type { McpServerConfig } from '../../mcp-config';
import type { LocalChatMessage } from '../../../shared/ipc-contract';

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

let cwd: string;
const origHome = process.env.BYAN_HOME;

function makeCodexBridge(mcp: McpServerConfig[] = []) {
  const broadcasts: LocalChatMessage[] = [];
  const procs: FakeProc[] = [];
  const spawnFn = vi.fn(((..._args: unknown[]) => {
    const p = new FakeProc();
    procs.push(p);
    return p;
  }) as unknown as SpawnFn);
  const bridge = new LocalChatBridge({
    spawnFn,
    broadcast: (m) => broadcasts.push(m),
    defaultCwd: () => cwd,
    resolveBin: () => null,
    spawnEnv: () => ({ PATH: '/fake/bin' }),
    readMcp: async () => mcp,
  });
  return { bridge, spawnFn, broadcasts, procs };
}

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-lcx-'));
  process.env.BYAN_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-lcx-home-'));
});
afterEach(() => {
  if (origHome === undefined) delete process.env.BYAN_HOME;
  else process.env.BYAN_HOME = origHome;
  try { fs.rmSync(cwd, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('codex engine — start/send', () => {
  it('start broadcasts started cli=codex WITHOUT spawning (codex is per-turn)', async () => {
    const { bridge, spawnFn, broadcasts } = makeCodexBridge();
    const { sessionId } = await bridge.start({ cwd, cli: 'codex' });
    expect(sessionId).toBeTruthy();
    expect(spawnFn).not.toHaveBeenCalled();
    expect(broadcasts[0]).toMatchObject({ type: 'started', cli: 'codex' });
  });

  it('send spawns codex exec --json in the project cwd, prompt over STDIN', async () => {
    const { bridge, spawnFn, procs } = makeCodexBridge();
    const { sessionId } = await bridge.start({ cwd, cli: 'codex' });
    await bridge.send(sessionId, 'bonjour codex');
    const [cmd, args, opts] = spawnFn.mock.calls[0];
    expect(cmd).toBe('codex');
    expect(args.slice(0, 7)).toEqual(['exec', '--json', '--skip-git-repo-check', '--sandbox', 'workspace-write', '--color', 'never']);
    expect(args[args.length - 1]).toBe('-'); // prompt via stdin, never argv
    expect(opts.cwd).toBe(cwd);
    expect(opts.stdio).toEqual(['pipe', 'pipe', 'pipe']);
    expect(procs[0].stdin.written.join('')).toBe('bonjour codex');
    expect(procs[0].stdin.ended).toBe(true);
  });

  it('agent option does NOT cross over to codex argv', async () => {
    const { bridge, spawnFn } = makeCodexBridge();
    const { sessionId } = await bridge.start({ cwd, cli: 'codex', agent: 'dev' });
    await bridge.send(sessionId, 'x');
    const args = spawnFn.mock.calls[0][1];
    expect(args).not.toContain('--agent');
    expect(args).not.toContain('dev');
  });

  it('maps .mcp.json stdio servers onto -c overrides (the claude .mcp.json equivalent)', async () => {
    const { bridge, spawnFn } = makeCodexBridge([
      { id: 'byan', name: 'byan', transport: 'stdio', command: 'node', args: ['/srv/byan/server.js'], env: { BYAN_API_URL: 'http://localhost:3737' }, enabled: true },
      { id: 'off', name: 'off', transport: 'stdio', command: 'node', enabled: false },
      { id: 'web', name: 'web', transport: 'http', enabled: true },
    ]);
    const { sessionId } = await bridge.start({ cwd, cli: 'codex' });
    await bridge.send(sessionId, 'x');
    const args = spawnFn.mock.calls[0][1] as string[];
    expect(args).toContain('mcp_servers.byan.command="node"');
    expect(args).toContain('mcp_servers.byan.args=["/srv/byan/server.js"]');
    expect(args).toContain('mcp_servers.byan.env={BYAN_API_URL = "http://localhost:3737"}');
    // disabled + http entries do not translate
    expect(args.join(' ')).not.toContain('mcp_servers.off');
    expect(args.join(' ')).not.toContain('mcp_servers.web');
  });

  it('a second send while a turn is in flight rejects', async () => {
    const { bridge } = makeCodexBridge();
    const { sessionId } = await bridge.start({ cwd, cli: 'codex' });
    await bridge.send(sessionId, 'premier');
    await expect(bridge.send(sessionId, 'deuxieme')).rejects.toThrow(/déjà en cours/i);
  });
});

describe('codex engine — JSONL mapping', () => {
  it('agent_message -> chunk, turn.completed -> complete (with last text as result)', async () => {
    const { bridge, procs, broadcasts } = makeCodexBridge();
    const { sessionId } = await bridge.start({ cwd, cli: 'codex' });
    await bridge.send(sessionId, 'salut');
    broadcasts.length = 0;
    const p = procs[0];
    p.emitLine({ type: 'thread.started', thread_id: '019f-uuid' });
    p.emitLine({ type: 'turn.started' });
    p.emitLine({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'ok!' } });
    p.emitLine({ type: 'turn.completed', usage: { input_tokens: 1 } });
    const chunk = broadcasts.find((b) => b.type === 'chunk') as Extract<LocalChatMessage, { type: 'chunk' }>;
    expect(chunk?.delta).toBe('ok!');
    expect(chunk?.sessionId).toBe(sessionId);
    const done = broadcasts.find((b) => b.type === 'complete') as Extract<LocalChatMessage, { type: 'complete' }>;
    expect(done?.result).toBe('ok!');
  });

  it('chains the second turn with exec resume <thread_id>', async () => {
    const { bridge, spawnFn, procs } = makeCodexBridge();
    const { sessionId } = await bridge.start({ cwd, cli: 'codex' });
    await bridge.send(sessionId, 'tour 1');
    procs[0].emitLine({ type: 'thread.started', thread_id: 'thread-42' });
    procs[0].emitLine({ type: 'turn.completed' });
    procs[0].emit('exit', 0, null);
    await bridge.send(sessionId, 'tour 2');
    const args2 = spawnFn.mock.calls[1][1] as string[];
    expect(args2.slice(0, 3)).toEqual(['exec', 'resume', 'thread-42']);
    expect(args2[args2.length - 1]).toBe('-');
    expect(procs[1].stdin.written.join('')).toBe('tour 2');
  });

  it('turn.failed -> error, not a silent complete', async () => {
    const { bridge, procs, broadcasts } = makeCodexBridge();
    const { sessionId } = await bridge.start({ cwd, cli: 'codex' });
    await bridge.send(sessionId, 'x');
    broadcasts.length = 0;
    procs[0].emitLine({ type: 'turn.failed', error: { message: 'quota atteint' } });
    expect(broadcasts.some((b) => b.type === 'complete')).toBe(false);
    const err = broadcasts.find((b) => b.type === 'error') as Extract<LocalChatMessage, { type: 'error' }>;
    expect(err?.error).toContain('quota atteint');
  });

  it('a turn that dies without terminal event surfaces stderr tail', async () => {
    const { bridge, procs, broadcasts } = makeCodexBridge();
    const { sessionId } = await bridge.start({ cwd, cli: 'codex' });
    await bridge.send(sessionId, 'x');
    broadcasts.length = 0;
    procs[0].stderr.emit('data', Buffer.from('ERROR: not logged in\n'));
    procs[0].emit('exit', 1, null);
    const err = broadcasts.find((b) => b.type === 'error') as Extract<LocalChatMessage, { type: 'error' }>;
    expect(err?.error).toContain('sortie prématurée');
    expect(err?.error).toContain('not logged in');
  });

  it('a flushed tail line with no newline is still parsed at exit', async () => {
    const { bridge, procs, broadcasts } = makeCodexBridge();
    const { sessionId } = await bridge.start({ cwd, cli: 'codex' });
    await bridge.send(sessionId, 'x');
    broadcasts.length = 0;
    procs[0].stdout.emit('data', Buffer.from(JSON.stringify({ type: 'turn.completed' }))); // no \n
    procs[0].emit('exit', 0, null);
    expect(broadcasts.some((b) => b.type === 'complete')).toBe(true);
    expect(broadcasts.some((b) => b.type === 'error')).toBe(false);
  });
});

describe('codex engine — stop semantics', () => {
  it('stop kills the in-flight turn without a spurious premature-exit error', async () => {
    const { bridge, procs, broadcasts } = makeCodexBridge();
    const { sessionId } = await bridge.start({ cwd, cli: 'codex' });
    await bridge.send(sessionId, 'x');
    await bridge.stop(sessionId);
    expect(procs[0].killed).toBe(true);
    broadcasts.length = 0;
    procs[0].emit('exit', null, 'SIGTERM'); // the killed proc finally exits
    expect(broadcasts.some((b) => b.type === 'error')).toBe(false);
  });

  it('stop removes the session (send then rejects), idle or not', async () => {
    const { bridge } = makeCodexBridge();
    const { sessionId } = await bridge.start({ cwd, cli: 'codex' });
    await bridge.stop(sessionId); // idle: no proc yet
    await expect(bridge.send(sessionId, 'x')).rejects.toThrow(/session/i);
  });

  it('stopAll during an in-flight codex turn kills it (quit sweep)', async () => {
    const { bridge, procs } = makeCodexBridge();
    const { sessionId } = await bridge.start({ cwd, cli: 'codex' });
    await bridge.send(sessionId, 'x');
    bridge.stopAll();
    expect(procs[0].killed).toBe(true);
    await expect(bridge.start({ cwd, cli: 'codex' })).rejects.toThrow(/fermeture/i);
  });
});
