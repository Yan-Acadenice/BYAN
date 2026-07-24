// codex-config — .mcp.json -> `codex exec -c` overrides (pure functions).

import { describe, expect, it } from 'vitest';
import { codexMcpArgs, expandEnvValue, tomlKey, tomlString } from '../../engines/codex-config';
import type { McpServerConfig } from '../../mcp-config';

describe('tomlString', () => {
  it('quotes a plain string', () => {
    expect(tomlString('node')).toBe('"node"');
  });
  it('escapes backslashes (Windows paths) and double quotes', () => {
    expect(tomlString('C:\\Users\\yan\\server.js')).toBe('"C:\\\\Users\\\\yan\\\\server.js"');
    expect(tomlString('a "b" c')).toBe('"a \\"b\\" c"');
  });
});

describe('tomlKey', () => {
  it('keeps bare-safe keys as-is (letters, digits, _ , -)', () => {
    expect(tomlKey('byan-web_2')).toBe('byan-web_2');
  });
  it('quotes anything else', () => {
    expect(tomlKey('weird key')).toBe('"weird key"');
  });
});

describe('expandEnvValue', () => {
  it('expands ${VAR} from the provided env', () => {
    expect(expandEnvValue('${API_URL}/api', { API_URL: 'http://x' })).toBe('http://x/api');
  });
  it('an unset variable becomes the empty string', () => {
    expect(expandEnvValue('${MISSING_VAR_XYZ}', {})).toBe('');
  });
  it('leaves plain values untouched', () => {
    expect(expandEnvValue('literal', {})).toBe('literal');
  });
});

describe('codexMcpArgs', () => {
  const byan: McpServerConfig = {
    id: 'byan',
    name: 'byan',
    transport: 'stdio',
    command: 'node',
    args: ['/srv/byan/server.js'],
    env: { BYAN_API_URL: '${TEST_URL_VAR}', BYAN_API_TOKEN: 'tok' },
    enabled: true,
  };

  it('translates an enabled stdio server into -c overrides with env expansion', () => {
    const args = codexMcpArgs([byan], { TEST_URL_VAR: 'http://localhost:3737' });
    expect(args).toEqual([
      '-c', 'mcp_servers.byan.command="node"',
      '-c', 'mcp_servers.byan.args=["/srv/byan/server.js"]',
      '-c', 'mcp_servers.byan.env={BYAN_API_URL = "http://localhost:3737", BYAN_API_TOKEN = "tok"}',
    ]);
  });

  it('skips disabled and http servers', () => {
    const off: McpServerConfig = { ...byan, id: 'off', enabled: false };
    const web: McpServerConfig = { id: 'web', name: 'web', transport: 'http', enabled: true };
    expect(codexMcpArgs([off, web], {})).toEqual([]);
  });

  it('omits args/env overrides when the entry has none', () => {
    const bare: McpServerConfig = { id: 's', name: 's', transport: 'stdio', command: 'srv', enabled: true };
    expect(codexMcpArgs([bare], {})).toEqual(['-c', 'mcp_servers.s.command="srv"']);
  });
});
