import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { readMcpConfig } from '../mcp-config';

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
