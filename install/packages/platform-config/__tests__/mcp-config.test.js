const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const {
  ensureMcpConfig,
  readMcpConfig,
  mergeByanEntry,
} = require('../lib/mcp-config');

describe('mcp-config', () => {
  let tmpRoot;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-platform-mcp-'));
  });

  afterEach(async () => {
    await fs.remove(tmpRoot);
  });

  describe('ensureMcpConfig', () => {
    test('creates .mcp.json with byan server config', async () => {
      const { path: filePath } = await ensureMcpConfig(tmpRoot, {
        apiUrl: 'http://host.example.com',
      });
      const content = await fs.readJson(filePath);
      expect(content.mcpServers.byan.command).toBe('node');
      expect(content.mcpServers.byan.args[0]).toBe(
        '_byan/mcp/byan-mcp-server/server.js'
      );
      expect(content.mcpServers.byan.env.BYAN_API_URL).toBe('http://host.example.com');
    });

    test('preserves other MCP servers in existing config', async () => {
      const filePath = path.join(tmpRoot, '.mcp.json');
      await fs.writeJson(filePath, {
        mcpServers: { other: { command: 'python', args: ['other.py'] } },
      });

      await ensureMcpConfig(tmpRoot, { apiUrl: 'http://localhost:3737' });

      const content = await fs.readJson(filePath);
      expect(content.mcpServers.other.command).toBe('python');
      expect(content.mcpServers.byan).toBeDefined();
    });

    test('overwrites existing byan entry (idempotent upgrade)', async () => {
      await ensureMcpConfig(tmpRoot, { apiUrl: 'http://old:3000' });
      await ensureMcpConfig(tmpRoot, { apiUrl: 'http://new:3737' });

      const content = await fs.readJson(path.join(tmpRoot, '.mcp.json'));
      expect(content.mcpServers.byan.env.BYAN_API_URL).toBe('http://new:3737');
    });

    test('writes BYAN_API_TOKEN when token is non-empty', async () => {
      const { path: filePath } = await ensureMcpConfig(tmpRoot, {
        apiUrl: 'http://localhost:3737',
        token: 'my-secret-token',
      });
      const content = await fs.readJson(filePath);
      expect(content.mcpServers.byan.env.BYAN_API_TOKEN).toBe('my-secret-token');
    });

    test('omits BYAN_API_TOKEN when token is empty string', async () => {
      const { path: filePath } = await ensureMcpConfig(tmpRoot, {
        apiUrl: 'http://localhost:3737',
        token: '',
      });
      const content = await fs.readJson(filePath);
      expect(content.mcpServers.byan.env.BYAN_API_TOKEN).toBeUndefined();
    });

    test('omits BYAN_API_TOKEN when token is undefined', async () => {
      const { path: filePath } = await ensureMcpConfig(tmpRoot, {
        apiUrl: 'http://localhost:3737',
      });
      const content = await fs.readJson(filePath);
      expect(content.mcpServers.byan.env.BYAN_API_TOKEN).toBeUndefined();
    });

    test('strips trailing /api from URL', async () => {
      const { path: filePath } = await ensureMcpConfig(tmpRoot, {
        apiUrl: 'http://localhost:3737/api',
      });
      const content = await fs.readJson(filePath);
      expect(content.mcpServers.byan.env.BYAN_API_URL).toBe('http://localhost:3737');
    });

    test('strips trailing /api/ from URL', async () => {
      const { path: filePath } = await ensureMcpConfig(tmpRoot, {
        apiUrl: 'http://localhost:3737/api/',
      });
      const content = await fs.readJson(filePath);
      expect(content.mcpServers.byan.env.BYAN_API_URL).toBe('http://localhost:3737');
    });

    test('preserves other mcpServers entries on merge', async () => {
      const filePath = path.join(tmpRoot, '.mcp.json');
      await fs.writeJson(filePath, {
        mcpServers: { foo: { command: 'foo-cmd', args: ['foo.js'] } },
      });
      await ensureMcpConfig(tmpRoot, { apiUrl: 'http://localhost:3737', token: 'tok' });
      const content = await fs.readJson(filePath);
      expect(content.mcpServers.foo.command).toBe('foo-cmd');
      expect(content.mcpServers.byan).toBeDefined();
    });

    test('preserves existing command and args of mcpServers.byan when already set', async () => {
      const filePath = path.join(tmpRoot, '.mcp.json');
      await fs.writeJson(filePath, {
        mcpServers: {
          byan: {
            command: 'custom-node',
            args: ['/absolute/path/server.js'],
            env: { BYAN_API_URL: 'http://old:3737' },
          },
        },
      });
      await ensureMcpConfig(tmpRoot, { apiUrl: 'http://new:3737', token: 'tok' });
      const content = await fs.readJson(filePath);
      expect(content.mcpServers.byan.command).toBe('custom-node');
      expect(content.mcpServers.byan.args[0]).toBe('/absolute/path/server.js');
      expect(content.mcpServers.byan.env.BYAN_API_URL).toBe('http://new:3737');
      expect(content.mcpServers.byan.env.BYAN_API_TOKEN).toBe('tok');
    });

    test('returns an object with path property', async () => {
      const result = await ensureMcpConfig(tmpRoot, { apiUrl: 'http://x:1' });
      expect(typeof result).toBe('object');
      expect(result.path).toBe(path.join(tmpRoot, '.mcp.json'));
    });
  });

  describe('readMcpConfig', () => {
    test('returns null when .mcp.json is missing', async () => {
      expect(await readMcpConfig(tmpRoot)).toBeNull();
    });

    test('returns parsed config when .mcp.json exists', async () => {
      await fs.writeJson(path.join(tmpRoot, '.mcp.json'), {
        mcpServers: { byan: { command: 'node' } },
      });
      const cfg = await readMcpConfig(tmpRoot);
      expect(cfg.mcpServers.byan.command).toBe('node');
    });

    test('returns null when .mcp.json is malformed', async () => {
      await fs.writeFile(path.join(tmpRoot, '.mcp.json'), '{not json', 'utf8');
      expect(await readMcpConfig(tmpRoot)).toBeNull();
    });
  });

  describe('mergeByanEntry (pure)', () => {
    test('returns a new object, does not mutate input', () => {
      const input = { mcpServers: { other: { command: 'x' } } };
      const frozen = JSON.parse(JSON.stringify(input));
      const result = mergeByanEntry(input, { apiUrl: 'http://x:1' });
      expect(result).not.toBe(input);
      expect(input).toEqual(frozen);
      expect(result.mcpServers.other.command).toBe('x');
      expect(result.mcpServers.byan).toBeDefined();
    });

    test('strips /api suffix in apiUrl', () => {
      const result = mergeByanEntry({}, { apiUrl: 'http://localhost:3737/api' });
      expect(result.mcpServers.byan.env.BYAN_API_URL).toBe('http://localhost:3737');
    });

    test('injects token when truthy', () => {
      const result = mergeByanEntry({}, { apiUrl: 'http://x:1', token: 'byan_abc' });
      expect(result.mcpServers.byan.env.BYAN_API_TOKEN).toBe('byan_abc');
    });

    test('omits token when empty/undefined', () => {
      const r1 = mergeByanEntry({}, { apiUrl: 'http://x:1', token: '' });
      const r2 = mergeByanEntry({}, { apiUrl: 'http://x:1' });
      expect(r1.mcpServers.byan.env.BYAN_API_TOKEN).toBeUndefined();
      expect(r2.mcpServers.byan.env.BYAN_API_TOKEN).toBeUndefined();
    });

    test('handles empty input config', () => {
      const result = mergeByanEntry({}, { apiUrl: 'http://x:1' });
      expect(result.mcpServers.byan.command).toBe('node');
      expect(result.mcpServers.byan.args).toEqual(['_byan/mcp/byan-mcp-server/server.js']);
    });

    test('handles null/undefined input config gracefully', () => {
      const r1 = mergeByanEntry(null, { apiUrl: 'http://x:1' });
      const r2 = mergeByanEntry(undefined, { apiUrl: 'http://x:1' });
      expect(r1.mcpServers.byan).toBeDefined();
      expect(r2.mcpServers.byan).toBeDefined();
    });

    test('preserves existing command/args on merge', () => {
      const input = {
        mcpServers: {
          byan: { command: 'custom', args: ['/abs/server.js'], env: {} },
        },
      };
      const result = mergeByanEntry(input, { apiUrl: 'http://x:1', token: 't' });
      expect(result.mcpServers.byan.command).toBe('custom');
      expect(result.mcpServers.byan.args).toEqual(['/abs/server.js']);
    });
  });
});
