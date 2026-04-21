const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const setup = require('../lib/claude-native-setup');

describe('claude-native-setup', () => {
  let tmpRoot;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-native-'));
  });

  afterEach(async () => {
    await fs.remove(tmpRoot);
  });

  test('copyClaudeHooks copies hook files and lib/', async () => {
    const r = await setup.copyClaudeHooks(tmpRoot);
    expect(r.copied).toBeGreaterThan(0);
    expect(await fs.pathExists(path.join(tmpRoot, '.claude', 'hooks'))).toBe(true);
    expect(
      await fs.pathExists(path.join(tmpRoot, '.claude', 'hooks', 'inject-soul.js'))
    ).toBe(true);
  });

  test('copyClaudeSkills copies SKILL.md files', async () => {
    const r = await setup.copyClaudeSkills(tmpRoot);
    expect(r.copied).toBeGreaterThan(5);
    expect(
      await fs.pathExists(
        path.join(tmpRoot, '.claude', 'skills', 'byan-hermes-dispatch', 'SKILL.md')
      )
    ).toBe(true);
  });

  test('copyClaudeSettings copies settings.json', async () => {
    const r = await setup.copyClaudeSettings(tmpRoot);
    expect(r.copied).toBe(true);
    const s = await fs.readJson(path.join(tmpRoot, '.claude', 'settings.json'));
    expect(s.hooks).toBeDefined();
    expect(s.hooks.SessionStart).toBeDefined();
  });

  test('copyMcpServer skips node_modules', async () => {
    const r = await setup.copyMcpServer(tmpRoot);
    expect(r.copied).toBe(true);
    expect(
      await fs.pathExists(
        path.join(tmpRoot, '_byan', 'mcp', 'byan-mcp-server', 'server.js')
      )
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(tmpRoot, '_byan', 'mcp', 'byan-mcp-server', 'node_modules')
      )
    ).toBe(false);
  });

  test('copyMcpServer throws if post-copy server.js missing (regression 2.9.6)', async () => {
    const mockSetup = require('../lib/claude-native-setup');
    const realCopy = fs.copy;
    jest.spyOn(fs, 'copy').mockImplementation(async () => {});
    await expect(mockSetup.copyMcpServer(tmpRoot)).rejects.toThrow(/server\.js/);
    fs.copy = realCopy;
    jest.restoreAllMocks();
  });

  test('generateMcpConfig renders absolute path', async () => {
    const r = await setup.generateMcpConfig(tmpRoot);
    expect(r.path).toContain('.mcp.json');
    const cfg = await fs.readJson(path.join(tmpRoot, '.mcp.json'));
    expect(cfg.mcpServers.byan.args[0]).toBe(
      `${tmpRoot}/_byan/mcp/byan-mcp-server/server.js`
    );
    expect(cfg.mcpServers.byan.args[0]).not.toContain('{{PROJECT_ROOT}}');
  });

  test('generateMcpConfig preserves existing other servers', async () => {
    await fs.writeJson(path.join(tmpRoot, '.mcp.json'), {
      mcpServers: { other: { command: 'python', args: ['x.py'] } },
    });
    await setup.generateMcpConfig(tmpRoot);
    const cfg = await fs.readJson(path.join(tmpRoot, '.mcp.json'));
    expect(cfg.mcpServers.other).toBeDefined();
    expect(cfg.mcpServers.byan).toBeDefined();
  });

  test('setupClaudeNative runs full pipeline (skip deps)', async () => {
    const result = await setup.setupClaudeNative(tmpRoot, {
      quiet: true,
      installDeps: false,
    });
    expect(result.hooks.copied).toBeGreaterThan(0);
    expect(result.skills.copied).toBeGreaterThan(5);
    expect(result.settings.copied).toBe(true);
    expect(result.mcp.copied).toBe(true);
    expect(result.mcpConfig.path).toBeDefined();
    expect(
      await fs.pathExists(path.join(tmpRoot, '.mcp.json'))
    ).toBe(true);
  });
});
