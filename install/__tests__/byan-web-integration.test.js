const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const {
  updateSettingsLocal,
  updateDotenv,
  ensureMcpConfig,
  setupByanWebIntegration,
  validateByanWebReachability,
} = require('../lib/byan-web-integration');

describe('byan-web-integration', () => {
  let tmpRoot;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-integration-'));
  });

  afterEach(async () => {
    await fs.remove(tmpRoot);
  });

  describe('updateSettingsLocal', () => {
    test('creates .claude/settings.local.json with env', async () => {
      const filePath = await updateSettingsLocal(tmpRoot, {
        BYAN_API_TOKEN: 'abc',
        BYAN_API_URL: 'http://localhost:3737',
      });
      const content = await fs.readJson(filePath);
      expect(content.env.BYAN_API_TOKEN).toBe('abc');
      expect(content.env.BYAN_API_URL).toBe('http://localhost:3737');
    });

    test('preserves existing unrelated settings', async () => {
      const filePath = path.join(tmpRoot, '.claude', 'settings.local.json');
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeJson(filePath, {
        env: { EXISTING: 'keep' },
        permissions: { allow: ['Read'] },
      });

      await updateSettingsLocal(tmpRoot, { BYAN_API_TOKEN: 'new' });

      const content = await fs.readJson(filePath);
      expect(content.env.EXISTING).toBe('keep');
      expect(content.env.BYAN_API_TOKEN).toBe('new');
      expect(content.permissions.allow).toEqual(['Read']);
    });
  });

  describe('updateDotenv', () => {
    test('creates .env with BYAN_API_TOKEN and BYAN_API_URL', async () => {
      const filePath = await updateDotenv(tmpRoot, {
        BYAN_API_TOKEN: 'xyz',
        BYAN_API_URL: 'https://byan.example.com',
      });
      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toMatch(/BYAN_API_TOKEN=xyz/);
      expect(content).toMatch(/BYAN_API_URL=https:\/\/byan\.example\.com/);
    });

    test('replaces existing BYAN_API_TOKEN line instead of duplicating', async () => {
      const filePath = path.join(tmpRoot, '.env');
      await fs.writeFile(filePath, 'OTHER=kept\nBYAN_API_TOKEN=old\n', 'utf8');
      await updateDotenv(tmpRoot, { BYAN_API_TOKEN: 'new' });

      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toMatch(/OTHER=kept/);
      expect(content).toMatch(/BYAN_API_TOKEN=new/);
      expect(content.match(/BYAN_API_TOKEN=/g)).toHaveLength(1);
    });

    test('preserves comments and unrelated keys', async () => {
      const filePath = path.join(tmpRoot, '.env');
      await fs.writeFile(filePath, '# Header comment\nDB_URL=postgres://x\n', 'utf8');
      await updateDotenv(tmpRoot, { BYAN_API_TOKEN: 't' });

      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toMatch(/# Header comment/);
      expect(content).toMatch(/DB_URL=postgres:\/\/x/);
      expect(content).toMatch(/BYAN_API_TOKEN=t/);
    });
  });

  describe('ensureMcpConfig', () => {
    test('creates .mcp.json with byan server config', async () => {
      const filePath = await ensureMcpConfig(tmpRoot, 'http://host.example.com');
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

      await ensureMcpConfig(tmpRoot, 'http://localhost:3737');

      const content = await fs.readJson(filePath);
      expect(content.mcpServers.other.command).toBe('python');
      expect(content.mcpServers.byan).toBeDefined();
    });

    test('overwrites existing byan entry (idempotent upgrade)', async () => {
      await ensureMcpConfig(tmpRoot, 'http://old:3000');
      await ensureMcpConfig(tmpRoot, 'http://new:3737');

      const content = await fs.readJson(path.join(tmpRoot, '.mcp.json'));
      expect(content.mcpServers.byan.env.BYAN_API_URL).toBe('http://new:3737');
    });

    // F1: token injection
    test('writes BYAN_API_TOKEN when token is non-empty', async () => {
      const filePath = await ensureMcpConfig(tmpRoot, 'http://localhost:3737', 'my-secret-token');
      const content = await fs.readJson(filePath);
      expect(content.mcpServers.byan.env.BYAN_API_TOKEN).toBe('my-secret-token');
    });

    test('omits BYAN_API_TOKEN when token is empty string', async () => {
      const filePath = await ensureMcpConfig(tmpRoot, 'http://localhost:3737', '');
      const content = await fs.readJson(filePath);
      expect(content.mcpServers.byan.env.BYAN_API_TOKEN).toBeUndefined();
    });

    test('omits BYAN_API_TOKEN when token is undefined', async () => {
      const filePath = await ensureMcpConfig(tmpRoot, 'http://localhost:3737');
      const content = await fs.readJson(filePath);
      expect(content.mcpServers.byan.env.BYAN_API_TOKEN).toBeUndefined();
    });

    // F1 + B5: URL stripping
    test('strips trailing /api from URL', async () => {
      const filePath = await ensureMcpConfig(tmpRoot, 'http://localhost:3737/api');
      const content = await fs.readJson(filePath);
      expect(content.mcpServers.byan.env.BYAN_API_URL).toBe('http://localhost:3737');
    });

    test('strips trailing /api/ from URL', async () => {
      const filePath = await ensureMcpConfig(tmpRoot, 'http://localhost:3737/api/');
      const content = await fs.readJson(filePath);
      expect(content.mcpServers.byan.env.BYAN_API_URL).toBe('http://localhost:3737');
    });

    // F7: preserve other mcpServers entries on merge
    test('preserves other mcpServers entries on merge', async () => {
      const filePath = path.join(tmpRoot, '.mcp.json');
      await fs.writeJson(filePath, {
        mcpServers: { foo: { command: 'foo-cmd', args: ['foo.js'] } },
      });
      await ensureMcpConfig(tmpRoot, 'http://localhost:3737', 'tok');
      const content = await fs.readJson(filePath);
      expect(content.mcpServers.foo.command).toBe('foo-cmd');
      expect(content.mcpServers.byan).toBeDefined();
    });

    // F7: preserve existing command and args of mcpServers.byan if already set
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
      await ensureMcpConfig(tmpRoot, 'http://new:3737', 'tok');
      const content = await fs.readJson(filePath);
      expect(content.mcpServers.byan.command).toBe('custom-node');
      expect(content.mcpServers.byan.args[0]).toBe('/absolute/path/server.js');
      expect(content.mcpServers.byan.env.BYAN_API_URL).toBe('http://new:3737');
      expect(content.mcpServers.byan.env.BYAN_API_TOKEN).toBe('tok');
    });
  });

  describe('validateByanWebReachability', () => {
    afterEach(() => {
      global.fetch = undefined;
    });

    test('returns reachable:true with status and latency on 200', async () => {
      global.fetch = jest.fn().mockResolvedValue({ status: 200 });
      const result = await validateByanWebReachability({
        apiUrl: 'http://localhost:3737',
        token: 'byan_test-token',
      });
      expect(result.reachable).toBe(true);
      expect(result.status).toBe(200);
      expect(typeof result.latencyMs).toBe('number');
      expect(result.error).toBeUndefined();
    });

    test('returns reachable:true with error message on 4xx', async () => {
      global.fetch = jest.fn().mockResolvedValue({ status: 401 });
      const result = await validateByanWebReachability({
        apiUrl: 'http://localhost:3737',
        token: 'bad-token',
      });
      expect(result.reachable).toBe(true);
      expect(result.status).toBe(401);
      expect(result.error).toMatch(/401/);
    });

    test('returns reachable:false on network error — never throws', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const result = await validateByanWebReachability({
        apiUrl: 'http://localhost:9999',
      });
      expect(result.reachable).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
    });

    test('sets ApiKey scheme for byan_ prefixed token', async () => {
      global.fetch = jest.fn().mockResolvedValue({ status: 200 });
      await validateByanWebReachability({
        apiUrl: 'http://localhost:3737',
        token: 'byan_abc123',
      });
      const headers = global.fetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBe('ApiKey byan_abc123');
    });

    test('sets Bearer scheme for non-byan_ token', async () => {
      global.fetch = jest.fn().mockResolvedValue({ status: 200 });
      await validateByanWebReachability({
        apiUrl: 'http://localhost:3737',
        token: 'eyJhbGciOiJIUzI1NiJ9.foo',
      });
      const headers = global.fetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toMatch(/^Bearer /);
    });
  });

  describe('setupByanWebIntegration', () => {
    test('skipPrompts=true does not prompt and returns configured:false', async () => {
      const result = await setupByanWebIntegration(tmpRoot, {
        skipPrompts: true,
        quiet: true,
      });
      expect(result.configured).toBe(false);
      expect(await fs.pathExists(path.join(tmpRoot, '.mcp.json'))).toBe(false);
      expect(await fs.pathExists(path.join(tmpRoot, '.env'))).toBe(false);
      expect(
        await fs.pathExists(path.join(tmpRoot, '.claude', 'settings.local.json'))
      ).toBe(false);
    });

    test('presetInputs writes all three files', async () => {
      const result = await setupByanWebIntegration(tmpRoot, {
        skipPrompts: true,
        quiet: true,
        presetInputs: {
          configured: true,
          token: 'preset-token',
          apiUrl: 'http://preset:3737',
        },
      });
      expect(result.configured).toBe(true);
      expect(result.settingsPath).toContain('.claude/settings.local.json');
      expect(result.envPath).toContain('.env');
      expect(result.mcpPath).toContain('.mcp.json');

      const env = await fs.readFile(path.join(tmpRoot, '.env'), 'utf8');
      expect(env).toMatch(/BYAN_API_TOKEN=preset-token/);

      const settings = await fs.readJson(
        path.join(tmpRoot, '.claude', 'settings.local.json')
      );
      expect(settings.env.BYAN_API_TOKEN).toBe('preset-token');

      const mcp = await fs.readJson(path.join(tmpRoot, '.mcp.json'));
      expect(mcp.mcpServers.byan.env.BYAN_API_URL).toBe('http://preset:3737');
      expect(mcp.mcpServers.byan.env.BYAN_API_TOKEN).toBe('preset-token');
    });
  });
});
