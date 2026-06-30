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

  test('makeNodeModulesFilter ignores node_modules in ancestor path (regression 2.9.8)', () => {
    // Global install path : /usr/local/lib/node_modules/create-byan-agent/install/templates/_byan/mcp/byan-mcp-server
    const srcRoot =
      '/usr/local/lib/node_modules/create-byan-agent/install/templates/_byan/mcp/byan-mcp-server';
    const filter = setup.makeNodeModulesFilter(srcRoot);
    // File INSIDE the template must pass, even though its absolute path contains node_modules.
    expect(filter(path.join(srcRoot, 'server.js'))).toBe(true);
    expect(filter(path.join(srcRoot, 'lib', 'dispatch.js'))).toBe(true);
    // A nested node_modules dir inside the template must be skipped.
    expect(
      filter(path.join(srcRoot, 'node_modules', '@modelcontextprotocol', 'sdk'))
    ).toBe(false);
  });

  test('generateMcpConfig renders a RELATIVE byan path (portable, no absolute leak)', async () => {
    const r = await setup.generateMcpConfig(tmpRoot);
    expect(r.path).toContain('.mcp.json');
    const cfg = await fs.readJson(path.join(tmpRoot, '.mcp.json'));
    expect(cfg.mcpServers.byan.args[0]).toBe('_byan/mcp/byan-mcp-server/server.js');
    expect(cfg.mcpServers.byan.args[0]).not.toContain('{{PROJECT_ROOT}}');
    expect(path.isAbsolute(cfg.mcpServers.byan.args[0])).toBe(false);
    expect(cfg.mcpServers.byan.args[0]).not.toContain(tmpRoot);
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

  test('generateMcpConfig writes an inert byan-channel entry with a RELATIVE path', async () => {
    await setup.generateMcpConfig(tmpRoot);
    const cfg = await fs.readJson(path.join(tmpRoot, '.mcp.json'));
    const chan = cfg.mcpServers['byan-channel'];
    expect(chan).toBeDefined();
    // Relative path on purpose — never {{PROJECT_ROOT}}-prefixed, never absolute.
    expect(chan.args[0]).toBe('_byan/mcp/byan-mcp-server/channel-entry.js');
    expect(chan.args[0]).not.toContain('{{PROJECT_ROOT}}');
    expect(path.isAbsolute(chan.args[0])).toBe(false);
    expect(chan.args[0]).not.toMatch(/\/home\//);
    // Inert: empty env, no auto-activation flags.
    expect(chan.env).toEqual({});
    const raw = await fs.readFile(path.join(tmpRoot, '.mcp.json'), 'utf8');
    expect(raw).not.toContain('channelsEnabled');
    expect(raw).not.toContain('allowedChannelPlugins');
    expect(raw).not.toContain('dangerously-load');
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
