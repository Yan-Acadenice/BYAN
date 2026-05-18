import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  addMcpServer,
  deleteMcpServer,
  McpConfigError,
  readMcpConfig,
  updateMcpServer,
  validateServerInput,
} from '../mcp-config';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-mcp-config-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function write(file: string, contents: string): Promise<void> {
  await fs.writeFile(path.join(tmp, file), contents, 'utf-8');
}

describe('readMcpConfig', () => {
  it('returns [] when .mcp.json is absent', async () => {
    expect(await readMcpConfig(tmp)).toEqual([]);
  });

  it('returns [] when .mcp.json is not valid JSON', async () => {
    await write('.mcp.json', '{not json');
    expect(await readMcpConfig(tmp)).toEqual([]);
  });

  it('returns [] when mcpServers key is missing', async () => {
    await write('.mcp.json', '{}');
    expect(await readMcpConfig(tmp)).toEqual([]);
  });

  it('parses stdio entries with command, args, env', async () => {
    await write('.mcp.json', JSON.stringify({
      mcpServers: {
        byan: {
          command: 'node',
          args: ['_byan/mcp/server.js'],
          env: { BYAN_API_URL: 'https://example.com' },
        },
      },
    }));
    const result = await readMcpConfig(tmp);
    expect(result).toEqual([{
      id: 'byan',
      name: 'byan',
      transport: 'stdio',
      command: 'node',
      args: ['_byan/mcp/server.js'],
      env: { BYAN_API_URL: 'https://example.com' },
      cwd: undefined,
      enabled: true,
    }]);
  });

  it('drops stdio entries with no command', async () => {
    await write('.mcp.json', JSON.stringify({
      mcpServers: { broken: { args: ['only-args'] } },
    }));
    expect(await readMcpConfig(tmp)).toEqual([]);
  });

  it('detects http transport from url field', async () => {
    await write('.mcp.json', JSON.stringify({
      mcpServers: { remote: { url: 'https://example.com/mcp' } },
    }));
    const result = await readMcpConfig(tmp);
    expect(result).toHaveLength(1);
    expect(result[0].transport).toBe('http');
  });

  it('respects explicit enabled:false', async () => {
    await write('.mcp.json', JSON.stringify({
      mcpServers: { byan: { command: 'node', enabled: false } },
    }));
    const result = await readMcpConfig(tmp);
    expect(result[0].enabled).toBe(false);
  });

  it('ignores non-string env values', async () => {
    await write('.mcp.json', JSON.stringify({
      mcpServers: { byan: { command: 'node', env: { GOOD: 'a', BAD: 42 } } },
    }));
    const result = await readMcpConfig(tmp);
    expect(result[0].env).toBeUndefined();
  });
});

describe('validateServerInput', () => {
  it('accepts a minimal valid input', () => {
    expect(validateServerInput({ id: 'foo', command: 'node' })).toBeNull();
  });

  it('rejects id with uppercase', () => {
    expect(validateServerInput({ id: 'Foo', command: 'node' })).toMatch(/id must match/);
  });

  it('rejects id starting with hyphen', () => {
    expect(validateServerInput({ id: '-foo', command: 'node' })).toMatch(/id must match/);
  });

  it('rejects id longer than 63 chars', () => {
    expect(validateServerInput({ id: 'a'.repeat(64), command: 'node' })).toMatch(/id must match/);
  });

  it('rejects empty command', () => {
    expect(validateServerInput({ id: 'foo', command: '   ' })).toMatch(/command is required/);
  });

  it('rejects non-string args', () => {
    expect(validateServerInput({ id: 'foo', command: 'node', args: ['ok', 1 as unknown as string] }))
      .toMatch(/args must be/);
  });

  it('rejects non-string env values', () => {
    expect(validateServerInput({ id: 'foo', command: 'node', env: { OK: 'a', BAD: 1 as unknown as string } }))
      .toMatch(/env must be/);
  });
});

describe('addMcpServer', () => {
  it('creates .mcp.json when none exists', async () => {
    const created = await addMcpServer(tmp, { id: 'foo', command: 'node', args: ['x.js'] });
    expect(created.id).toBe('foo');

    const result = await readMcpConfig(tmp);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'foo', command: 'node', args: ['x.js'] });
  });

  it('preserves existing entries when adding a new one', async () => {
    await write('.mcp.json', JSON.stringify({
      mcpServers: { existing: { command: 'a', args: ['b'] } },
    }));
    await addMcpServer(tmp, { id: 'fresh', command: 'c' });

    const result = await readMcpConfig(tmp);
    const ids = result.map((s) => s.id).sort();
    expect(ids).toEqual(['existing', 'fresh']);
  });

  it('throws CONFLICT when id already exists', async () => {
    await addMcpServer(tmp, { id: 'foo', command: 'node' });
    await expect(addMcpServer(tmp, { id: 'foo', command: 'other' }))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('throws INVALID_ARGUMENT on invalid input', async () => {
    await expect(addMcpServer(tmp, { id: 'BAD', command: 'node' }))
      .rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('throws UNAVAILABLE when existing .mcp.json is malformed', async () => {
    await write('.mcp.json', '{not json');
    await expect(addMcpServer(tmp, { id: 'foo', command: 'node' }))
      .rejects.toBeInstanceOf(McpConfigError);
    await expect(addMcpServer(tmp, { id: 'foo', command: 'node' }))
      .rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('writes a file ending with a trailing newline', async () => {
    await addMcpServer(tmp, { id: 'foo', command: 'node' });
    const raw = await fs.readFile(path.join(tmp, '.mcp.json'), 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
  });

  it('omits args/env when empty', async () => {
    await addMcpServer(tmp, { id: 'foo', command: 'node', args: [], env: {} });
    const raw = await fs.readFile(path.join(tmp, '.mcp.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.mcpServers.foo.args).toBeUndefined();
    expect(parsed.mcpServers.foo.env).toBeUndefined();
  });
});

describe('updateMcpServer', () => {
  it('updates an existing entry in place', async () => {
    await addMcpServer(tmp, { id: 'foo', command: 'node', args: ['a.js'] });
    await updateMcpServer(tmp, { id: 'foo', command: 'deno', args: ['b.ts'] });

    const result = await readMcpConfig(tmp);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'foo', command: 'deno', args: ['b.ts'] });
  });

  it('preserves other entries when updating one', async () => {
    await addMcpServer(tmp, { id: 'foo', command: 'node' });
    await addMcpServer(tmp, { id: 'bar', command: 'python' });
    await updateMcpServer(tmp, { id: 'foo', command: 'deno' });

    const result = await readMcpConfig(tmp);
    const map = new Map(result.map((s) => [s.id, s.command]));
    expect(map.get('foo')).toBe('deno');
    expect(map.get('bar')).toBe('python');
  });

  it('throws NOT_FOUND when updating an unknown id', async () => {
    await expect(updateMcpServer(tmp, { id: 'ghost', command: 'node' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws INVALID_ARGUMENT on bad input', async () => {
    await expect(updateMcpServer(tmp, { id: 'BAD', command: 'node' }))
      .rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('refuses to update when .mcp.json is malformed', async () => {
    await write('.mcp.json', '{not json');
    await expect(updateMcpServer(tmp, { id: 'foo', command: 'node' }))
      .rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});

describe('deleteMcpServer', () => {
  it('removes the entry from .mcp.json', async () => {
    await addMcpServer(tmp, { id: 'foo', command: 'node' });
    await addMcpServer(tmp, { id: 'bar', command: 'python' });
    await deleteMcpServer(tmp, 'foo');

    const result = await readMcpConfig(tmp);
    expect(result.map((s) => s.id)).toEqual(['bar']);
  });

  it('throws NOT_FOUND when id does not exist', async () => {
    await expect(deleteMcpServer(tmp, 'ghost'))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws INVALID_ARGUMENT on empty id', async () => {
    await expect(deleteMcpServer(tmp, ''))
      .rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('refuses to delete when .mcp.json is malformed', async () => {
    await write('.mcp.json', '{not json');
    await expect(deleteMcpServer(tmp, 'foo'))
      .rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});
