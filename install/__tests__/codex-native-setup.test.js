const path = require('path');
const fs = require('fs-extra');
const os = require('os');

const setup = require('../lib/codex-native-setup');

describe('codex-native-setup', () => {
  let tmpHome;
  let tmpProject;
  let originalHomedir;

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-codex-home-'));
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-codex-proj-'));
    originalHomedir = os.homedir;
    os.homedir = () => tmpHome;
  });

  afterEach(async () => {
    os.homedir = originalHomedir;
    await fs.remove(tmpHome);
    await fs.remove(tmpProject);
  });

  test('stripServerSections preserves unrelated servers', () => {
    const before = [
      "[mcp_servers.foo]",
      "command = 'foo'",
      '',
      '[mcp_servers.byan]',
      "command = 'old'",
      '',
      '[mcp_servers.byan.env]',
      "X = 'y'",
      '',
      '[mcp_servers.bar]',
      "command = 'bar'",
      '',
    ].join('\n');
    const out = setup.stripServerSections(before, 'byan');
    expect(out).toContain("command = 'foo'");
    expect(out).toContain("command = 'bar'");
    expect(out).not.toContain('byan');
  });

  test('buildByanBlock emits valid TOML literal strings', () => {
    const block = setup.buildByanBlock({
      serverPath: '/abs/server.js',
      apiUrl: 'http://localhost:3737',
      apiToken: 'byan_xxx',
    });
    expect(block).toContain('[mcp_servers.byan]');
    expect(block).toContain("command = 'node'");
    expect(block).toContain("args = ['/abs/server.js']");
    expect(block).toContain('[mcp_servers.byan.env]');
    expect(block).toContain("BYAN_API_URL = 'http://localhost:3737'");
    expect(block).toContain("BYAN_API_TOKEN = 'byan_xxx'");
    expect(block).toContain('startup_timeout_sec = 15');
  });

  test('patchCodexConfig is idempotent (write twice keeps single block)', async () => {
    await setup.patchCodexConfig(tmpProject, { apiUrl: 'http://x', apiToken: 'a' });
    await setup.patchCodexConfig(tmpProject, { apiUrl: 'http://y', apiToken: 'b' });
    const final = await fs.readFile(path.join(tmpHome, '.codex', 'config.toml'), 'utf8');
    const headerCount = (final.match(/\[mcp_servers\.byan\]/g) || []).length;
    expect(headerCount).toBe(1);
    expect(final).toContain('http://y');
    expect(final).toContain("BYAN_API_TOKEN = 'b'");
    expect(final).not.toContain('http://x');
  });

  test('patchCodexConfig coexists with other MCP servers', async () => {
    const cfgPath = path.join(tmpHome, '.codex', 'config.toml');
    await fs.ensureDir(path.dirname(cfgPath));
    await fs.writeFile(
      cfgPath,
      "[mcp_servers.foo]\ncommand = 'foo'\n\n[mcp_servers.foo.env]\nA = 'b'\n"
    );
    await setup.patchCodexConfig(tmpProject, { apiUrl: 'http://z', apiToken: 'tok' });
    const out = await fs.readFile(cfgPath, 'utf8');
    expect(out).toContain('[mcp_servers.foo]');
    expect(out).toContain("A = 'b'");
    expect(out).toContain('[mcp_servers.byan]');
    expect(out).toContain("BYAN_API_TOKEN = 'tok'");
  });

  test('setupCodexNative skips when ~/.codex absent and force=false', async () => {
    const result = await setup.setupCodexNative(tmpProject, { quiet: true });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('codex-not-detected');
  });

  test('setupCodexNative force creates ~/.codex config and skills for selected Codex installs', async () => {
    const templateDir = path.join(tmpProject, 'template');
    await fs.outputFile(
      path.join(templateDir, '.codex', 'skills', 'byan', 'SKILL.md'),
      '---\nname: byan\ndescription: test\n---\n'
    );
    await fs.outputFile(
      path.join(templateDir, '.claude', 'skills', 'byan-codex', 'SKILL.md'),
      '---\nname: byan-codex\ndescription: test\n---\n'
    );

    const result = await setup.setupCodexNative(tmpProject, {
      quiet: true,
      force: true,
      templateDir,
      apiUrl: 'http://forced',
    });

    expect(result.skipped).toBeUndefined();
    expect(result.skills.installed).toBe(2);
    await expect(
      fs.pathExists(path.join(tmpHome, '.codex', 'config.toml'))
    ).resolves.toBe(true);
    await expect(
      fs.pathExists(path.join(tmpHome, '.codex', 'skills', 'byan', 'SKILL.md'))
    ).resolves.toBe(true);
    await expect(
      fs.pathExists(path.join(tmpHome, '.codex', 'skills', 'byan-codex', 'SKILL.md'))
    ).resolves.toBe(true);
  });

  test('setupCodexNative writes when ~/.codex exists', async () => {
    await fs.ensureDir(path.join(tmpHome, '.codex'));
    const skillSource = path.join(tmpProject, '.claude', 'skills', 'byan-codex');
    await fs.ensureDir(skillSource);
    await fs.writeFile(
      path.join(skillSource, 'SKILL.md'),
      '---\nname: byan-codex\ndescription: test\n---\n'
    );
    const result = await setup.setupCodexNative(tmpProject, {
      quiet: true,
      apiUrl: 'http://h',
      apiToken: 'byan_h',
    });
    expect(result.skipped).toBeUndefined();
    expect(result.path).toBe(path.join(tmpHome, '.codex', 'config.toml'));
    expect(result.tokenSet).toBe(true);
    expect(result.skills.installed).toBe(1);
    await expect(
      fs.pathExists(path.join(tmpHome, '.codex', 'skills', 'byan-codex', 'SKILL.md'))
    ).resolves.toBe(true);
  });

  test('findSkillDirs reads only directories containing SKILL.md and dedupes by name', async () => {
    const first = path.join(tmpProject, 'first');
    const second = path.join(tmpProject, 'second');
    await fs.outputFile(path.join(first, 'byan-codex', 'SKILL.md'), 'one');
    await fs.outputFile(path.join(first, 'not-a-skill', 'README.md'), 'nope');
    await fs.outputFile(path.join(second, 'byan-codex', 'SKILL.md'), 'duplicate');
    await fs.outputFile(path.join(second, 'byan-byan', 'SKILL.md'), 'two');

    const skills = await setup.findSkillDirs([first, second]);
    expect(skills.map((s) => s.name)).toEqual(['byan-codex', 'byan-byan']);
  });

  test('installCodexNativeSkills copies template skills into ~/.codex/skills', async () => {
    const templateDir = path.join(tmpProject, 'template');
    await fs.outputFile(
      path.join(templateDir, '.claude', 'skills', 'byan-byan', 'SKILL.md'),
      '---\nname: byan-byan\ndescription: test\n---\n'
    );

    const result = await setup.installCodexNativeSkills(tmpProject, { templateDir });

    expect(result.installed).toBe(1);
    expect(result.destDir).toBe(path.join(tmpHome, '.codex', 'skills'));
    await expect(
      fs.readFile(path.join(tmpHome, '.codex', 'skills', 'byan-byan', 'SKILL.md'), 'utf8')
    ).resolves.toContain('name: byan-byan');
  });

  test('installCodexNativeSkills can skip existing skills without overwriting', async () => {
    const sourceDir = path.join(tmpProject, 'source');
    const destDir = path.join(tmpHome, '.codex', 'skills');
    await fs.outputFile(path.join(sourceDir, 'byan-byan', 'SKILL.md'), 'new');
    await fs.outputFile(path.join(destDir, 'byan-byan', 'SKILL.md'), 'old');

    const result = await setup.installCodexNativeSkills(tmpProject, {
      sourceDirs: [sourceDir],
      overwrite: false,
    });

    expect(result.installed).toBe(0);
    expect(result.skipped).toBe(1);
    await expect(
      fs.readFile(path.join(destDir, 'byan-byan', 'SKILL.md'), 'utf8')
    ).resolves.toBe('old');
  });

  test('tomlLiteral refuses values with single quote', () => {
    expect(() =>
      setup.buildByanBlock({
        serverPath: "/has/'/quote.js",
        apiUrl: 'http://x',
        apiToken: 'a',
      })
    ).toThrow(/single quote/);
  });
});
