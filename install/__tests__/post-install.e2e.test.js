/**
 * E2E regression test for the MCP-native-recognition fix (FD 20260428).
 *
 * Asserts the four invariants that were broken before this fix :
 *  (1) .mcp.json post-install does NOT contain BYAN_API_TOKEN: ""
 *  (2) .claude/settings.local.json contains enabledMcpjsonServers: ['byan']
 *  (3) When user accepts a third-party MCP extension, it is whitelisted too.
 *  (4) When user skips a third-party extension, it is NOT whitelisted.
 *
 * Runs setupClaudeNative + setupMcpExtensions in tmpdirs.
 * gdrive.setup is monkey-patched in the "accepted" scenario to bypass the
 * interactive OAuth flow.
 */

const path = require('path');
const fs = require('fs-extra');
const os = require('os');

const claudeNative = require('../lib/claude-native-setup');
const mcpExtensions = require('../lib/mcp-extensions');
const gdrive = require('../lib/mcp-extensions/gdrive');

describe('post-install state (FD 20260428)', () => {
  let tmpRoot;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-e2e-'));
  });

  afterEach(async () => {
    await fs.remove(tmpRoot);
    jest.restoreAllMocks();
  });

  test('invariant 1: no empty BYAN_API_TOKEN in .mcp.json after Claude native setup', async () => {
    await claudeNative.setupClaudeNative(tmpRoot, { quiet: true, installDeps: false });
    const cfg = await fs.readJson(path.join(tmpRoot, '.mcp.json'));
    expect(cfg.mcpServers.byan).toBeDefined();
    expect('BYAN_API_TOKEN' in (cfg.mcpServers.byan.env || {})).toBe(false);
  });

  test('invariant 2: byan whitelisted in settings.local.json enabledMcpjsonServers', async () => {
    await claudeNative.setupClaudeNative(tmpRoot, { quiet: true, installDeps: false });
    const sl = await fs.readJson(path.join(tmpRoot, '.claude', 'settings.local.json'));
    expect(Array.isArray(sl.enabledMcpjsonServers)).toBe(true);
    expect(sl.enabledMcpjsonServers).toContain('byan');
  });

  test('invariant 3: when user accepts gdrive, it is whitelisted alongside byan', async () => {
    await claudeNative.setupClaudeNative(tmpRoot, { quiet: true, installDeps: false });

    jest.spyOn(gdrive, 'setup').mockResolvedValue({ configured: true, message: 'mocked' });
    jest.spyOn(gdrive, 'buildMcpEntry').mockResolvedValue({
      command: 'npx',
      args: ['-y', 'google-workspace-mcp', 'serve'],
    });

    await mcpExtensions.setupMcpExtensions(tmpRoot, {
      skipPrompts: true,
      presetSelections: { gdrive: true },
      quiet: true,
    });

    const cfg = await fs.readJson(path.join(tmpRoot, '.mcp.json'));
    expect(cfg.mcpServers.gdrive).toBeDefined();

    const sl = await fs.readJson(path.join(tmpRoot, '.claude', 'settings.local.json'));
    expect(sl.enabledMcpjsonServers).toEqual(expect.arrayContaining(['byan', 'gdrive']));
  });

  test('invariant 4: when user skips gdrive, it is NOT whitelisted', async () => {
    await claudeNative.setupClaudeNative(tmpRoot, { quiet: true, installDeps: false });

    await mcpExtensions.setupMcpExtensions(tmpRoot, {
      skipPrompts: true,
      presetSelections: { gdrive: false },
      quiet: true,
    });

    const cfg = await fs.readJson(path.join(tmpRoot, '.mcp.json'));
    expect(cfg.mcpServers.gdrive).toBeUndefined();

    const sl = await fs.readJson(path.join(tmpRoot, '.claude', 'settings.local.json'));
    expect(sl.enabledMcpjsonServers).toContain('byan');
    expect(sl.enabledMcpjsonServers).not.toContain('gdrive');
  });

  test('apiUrl from byan_web is propagated into .mcp.json', async () => {
    await claudeNative.setupClaudeNative(tmpRoot, {
      quiet: true,
      installDeps: false,
      apiUrl: 'https://byan.example.com',
    });
    const cfg = await fs.readJson(path.join(tmpRoot, '.mcp.json'));
    expect(cfg.mcpServers.byan.env.BYAN_API_URL).toBe('https://byan.example.com');
  });

  test('idempotent: running setupClaudeNative twice does not duplicate whitelist entries', async () => {
    await claudeNative.setupClaudeNative(tmpRoot, { quiet: true, installDeps: false });
    await claudeNative.setupClaudeNative(tmpRoot, { quiet: true, installDeps: false });
    const sl = await fs.readJson(path.join(tmpRoot, '.claude', 'settings.local.json'));
    const byanCount = sl.enabledMcpjsonServers.filter((id) => id === 'byan').length;
    expect(byanCount).toBe(1);
  });
});
