import { describe, expect, it, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { McpProcessRegistry, type ChildLike, type SpawnLike } from '../mcp-registry';
import type { McpServerConfig } from '../mcp-config';

class FakeChild extends EventEmitter implements ChildLike {
  pid = 1234;
  killed = false;
  stderr = new EventEmitter() as unknown as ChildLike['stderr'];
  kill(signal?: NodeJS.Signals | number): boolean {
    this.killed = true;
    setImmediate(() => {
      const sig = (typeof signal === 'string' ? signal : 'SIGTERM') as NodeJS.Signals;
      this.emit('exit', null, sig);
    });
    return true;
  }
}

function makeSpawn(child: FakeChild): SpawnLike {
  return vi.fn(() => child) as unknown as SpawnLike;
}

const STDIO_SERVER: McpServerConfig = {
  id: 'byan',
  name: 'byan',
  transport: 'stdio',
  command: 'node',
  args: ['mcp-server.js'],
  enabled: true,
};

const HTTP_SERVER: McpServerConfig = {
  id: 'remote',
  name: 'remote',
  transport: 'http',
  enabled: true,
};

describe('McpProcessRegistry', () => {
  let child: FakeChild;
  let registry: McpProcessRegistry;

  beforeEach(() => {
    child = new FakeChild();
    registry = new McpProcessRegistry({ spawn: makeSpawn(child) });
  });

  it('returns stopped when no process has been started', () => {
    expect(registry.getStatus('unknown')).toEqual({ state: 'stopped' });
  });

  it('spawns a child and transitions to running on start', async () => {
    const status = await registry.start(STDIO_SERVER);
    expect(status.state).toBe('running');
    if (status.state === 'running') {
      expect(status.pid).toBe(1234);
    }
  });

  it('emits status changes on transitions', async () => {
    const seen: { id: string; state: string }[] = [];
    registry.onStatusChange((id, s) => seen.push({ id, state: s.state }));
    await registry.start(STDIO_SERVER);
    await registry.stop('byan');
    await new Promise((r) => setImmediate(r));
    const states = seen.map((s) => s.state);
    expect(states[0]).toBe('starting');
    expect(states[1]).toBe('running');
    expect(states.at(-1)).toBe('stopped');
  });

  it('flips to stopped after stop()', async () => {
    await registry.start(STDIO_SERVER);
    await registry.stop('byan');
    await new Promise((r) => setImmediate(r));
    expect(registry.getStatus('byan')).toEqual({ state: 'stopped' });
  });

  it('flips to error when child exits with non-zero code and no signal', async () => {
    await registry.start(STDIO_SERVER);
    child.emit('exit', 1, null);
    const s = registry.getStatus('byan');
    expect(s.state).toBe('error');
    if (s.state === 'error') {
      expect(s.message).toContain('code 1');
    }
  });

  it('captures stderr tail in the error message on crash', async () => {
    await registry.start(STDIO_SERVER);
    (child.stderr as unknown as EventEmitter).emit('data', Buffer.from('boom from server'));
    child.emit('exit', 2, null);
    const s = registry.getStatus('byan');
    if (s.state === 'error') {
      expect(s.message).toContain('boom from server');
    } else {
      throw new Error(`expected error state, got ${s.state}`);
    }
  });

  it('refuses to start an http server', async () => {
    await expect(registry.start(HTTP_SERVER)).rejects.toThrow(/cannot be started/);
  });

  it('is idempotent: start() on a running server returns the existing status', async () => {
    const first = await registry.start(STDIO_SERVER);
    const second = await registry.start(STDIO_SERVER);
    expect(second).toEqual(first);
  });

  it('returns running:false-equivalent when stop() is called on unknown id', async () => {
    await expect(registry.stop('nope')).resolves.toBeUndefined();
  });

  it('handles spawn() throwing synchronously by recording an error status', async () => {
    const reg = new McpProcessRegistry({
      spawn: (() => {
        throw new Error('ENOENT');
      }) as unknown as SpawnLike,
    });
    const status = await reg.start(STDIO_SERVER);
    expect(status.state).toBe('error');
    if (status.state === 'error') {
      expect(status.message).toContain('ENOENT');
    }
  });

  it('snapshot() reflects current entries', async () => {
    await registry.start(STDIO_SERVER);
    const snap = registry.snapshot();
    expect(snap.get('byan')?.state).toBe('running');
  });
});
