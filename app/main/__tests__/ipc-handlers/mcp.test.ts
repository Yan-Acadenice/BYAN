import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as mcp from '../../ipc-handlers/mcp';
import { McpProcessRegistry } from '../../mcp-registry';
import { IPC_CHANNELS } from '../../../shared/ipc-contract';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-mcp-handler-'));
  mcp._setProjectRootForTests(tmpRoot);
  mcp._setRegistryForTests(new McpProcessRegistry({ spawn: vi.fn() as never }));
});

afterEach(async () => {
  mcp._setProjectRootForTests(null);
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

async function writeConfig(servers: Record<string, unknown>): Promise<void> {
  await fs.writeFile(
    path.join(tmpRoot, '.mcp.json'),
    JSON.stringify({ mcpServers: servers }, null, 2),
    'utf-8'
  );
}

describe('mcp.list', () => {
  it('returns [] when project root has no .mcp.json', async () => {
    expect(await mcp.list()).toEqual([]);
  });

  it('returns servers parsed from .mcp.json with status stopped by default', async () => {
    await writeConfig({ byan: { command: 'node', args: ['server.js'] } });
    const list = await mcp.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('byan');
    expect(list[0].command).toBe('node');
    expect(list[0].status).toEqual({ state: 'stopped' });
  });
});

describe('mcp.start / stop / status', () => {
  beforeEach(async () => {
    await writeConfig({ byan: { command: 'node', args: ['server.js'] } });
  });

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(mcp.start('does-not-exist')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(mcp.stop('does-not-exist')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(mcp.status('does-not-exist')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws INVALID_ARGUMENT on empty id', async () => {
    await expect(mcp.start('')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(mcp.stop('')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('throws PERMISSION_DENIED for a disabled server', async () => {
    await writeConfig({ off: { command: 'node', enabled: false } });
    await expect(mcp.start('off')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('throws UNAVAILABLE for non-stdio transport', async () => {
    await writeConfig({ remote: { url: 'https://example.com/mcp' } });
    await expect(mcp.start('remote')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('status() returns stopped before any start', async () => {
    expect(await mcp.status('byan')).toEqual({ state: 'stopped' });
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
