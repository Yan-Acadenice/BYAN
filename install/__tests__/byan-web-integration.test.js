const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const {
  updateSettingsLocal,
  ensureMcpConfig,
  setupByanWebIntegration,
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

  describe('ensureMcpConfig', () => {
    test('creates .mcp.json with byan server config', async () => {
      const filePath = await ensureMcpConfig(tmpRoot, 'http://api.example.com');
      const content = await fs.readJson(filePath);
      expect(content.mcpServers.byan.command).toBe('node');
      expect(content.mcpServers.byan.args[0]).toBe(
        '_byan/mcp/byan-mcp-server/server.js'
      );
      expect(content.mcpServers.byan.env.BYAN_API_URL).toBe('http://api.example.com');
    });

    test('preserves other MCP servers in existing config', async () => {
      const filePath = path.join(tmpRoot, '.mcp.json');
      await fs.writeJson(filePath, {
        mcpServers: {
          other: { command: 'python', args: ['other.py'] },
        },
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
  });

  describe('setupByanWebIntegration', () => {
    test('skipPrompts=true does not prompt and returns configured:false', async () => {
      const result = await setupByanWebIntegration(tmpRoot, {
        skipPrompts: true,
        quiet: true,
      });
      expect(result.configured).toBe(false);
      expect(await fs.pathExists(path.join(tmpRoot, '.mcp.json'))).toBe(false);
      expect(
        await fs.pathExists(path.join(tmpRoot, '.claude', 'settings.local.json'))
      ).toBe(false);
    });
  });
});
