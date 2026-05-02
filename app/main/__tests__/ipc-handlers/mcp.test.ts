import { describe, expect, it, vi } from 'vitest';
import * as mcp from '../../ipc-handlers/mcp';
import { IPC_CHANNELS } from '../../../shared/ipc-contract';

describe('mcp.list', () => {
  it('returns an array of McpServer with required fields', async () => {
    const list = await mcp.list();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    for (const s of list) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.name).toBe('string');
      expect(['stdio', 'http']).toContain(s.transport);
      expect(typeof s.enabled).toBe('boolean');
      expect(s.status).toBeDefined();
      expect(typeof s.status.state).toBe('string');
    }
  });
});

describe('mcp.start / stop', () => {
  it('resolves silently for a known id', async () => {
    const [first] = await mcp.list();
    await expect(mcp.start(first.id)).resolves.toBeUndefined();
    await expect(mcp.stop(first.id)).resolves.toBeUndefined();
  });

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(mcp.start('does-not-exist')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(mcp.stop('does-not-exist')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws INVALID_ARGUMENT on empty id', async () => {
    await expect(mcp.start('')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
});

describe('mcp.status', () => {
  it('returns a discriminated McpStatus', async () => {
    const [first] = await mcp.list();
    const s = await mcp.status(first.id);
    expect(['stopped', 'starting', 'running', 'error']).toContain(s.state);
  });
});

describe('mcp.register', () => {
  it('registers all four channels on ipcMain', () => {
    const handle = vi.fn();
    mcp.register({ handle } as never);
    const channels = handle.mock.calls.map((c) => c[0]);
    expect(channels).toContain(IPC_CHANNELS.mcp.list);
    expect(channels).toContain(IPC_CHANNELS.mcp.start);
    expect(channels).toContain(IPC_CHANNELS.mcp.stop);
    expect(channels).toContain(IPC_CHANNELS.mcp.status);
  });
});
