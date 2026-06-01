/**
 * Regression guard for the by-type (Gen3) install template.
 *
 * The installer (install/bin/create-byan-agent-v2.js) copies the snapshot in
 * install/templates/_byan/ into a fresh project. Both the snapshot AND the
 * installer's copy whitelist must stay on the Gen3 by-type layout, otherwise
 * new installs are born on the legacy module layout while the platform is Gen3.
 *
 * These tests assert three things:
 *  1. the template snapshot is structurally Gen3 (agents under agent/<name>/,
 *     soul with the byan agent, no leftover flat/module agent .md files) ;
 *  2. the installer's byanDirs whitelist references the Gen3 dirs, not Gen2 ;
 *  3. replaying the installer's copy logic against the template yields an
 *     install whose byan agent and soul resolve Gen3-first via layout-resolver.
 */

const path = require('path');
const os = require('os');
const fs = require('fs-extra');

const layoutResolver = require('../../src/byan-v2/lib/layout-resolver');

const TEMPLATE_BYAN = path.join(__dirname, '..', 'templates', '_byan');
const INSTALLER_SRC = path.join(__dirname, '..', 'bin', 'create-byan-agent-v2.js');

// The Gen3 copy whitelist the installer must use. Kept in sync with
// create-byan-agent-v2.js ; the source-assertion test below catches drift.
const GEN3_BYAN_DIRS = ['agent', 'workflow', 'connaissance', 'command', 'worker', 'memoire',
  'core', 'bmb', 'bmm', 'tea', 'cis', '_config', 'data'];

const ACTIVE_SOUL = [
  ['byan-soul.md', 'soul.md'],
  ['byan-tao.md', 'tao.md'],
  ['byan-soul-memory.md', 'soul-memory.md'],
  ['creator-soul.md', 'creator-soul.md'],
];

describe('install template is on the by-type (Gen3) layout', () => {
  test('the byan agent lives at agent/byan/byan.md', () => {
    expect(fs.existsSync(path.join(TEMPLATE_BYAN, 'agent', 'byan', 'byan.md'))).toBe(true);
  });

  test('the active soul files live with the byan agent', () => {
    for (const f of ['byan-soul.md', 'byan-tao.md', 'byan-soul-memory.md', 'creator-soul.md']) {
      expect(fs.existsSync(path.join(TEMPLATE_BYAN, 'agent', 'byan', f))).toBe(true);
    }
  });

  test('the *-reference / *-template inspiration files stay at the _byan root', () => {
    for (const f of ['byan-soul-reference.md', 'soul-template.md', 'creator-soul-template.md']) {
      expect(fs.existsSync(path.join(TEMPLATE_BYAN, f))).toBe(true);
    }
  });

  test('no leftover flat agents/ directory with agent .md files', () => {
    const flat = path.join(TEMPLATE_BYAN, 'agents');
    const hasMd = fs.existsSync(flat)
      && fs.readdirSync(flat).some((f) => f.endsWith('.md'));
    expect(hasMd).toBe(false);
  });

  test('no leftover <module>/agents/*.md (agents moved to agent/)', () => {
    for (const mod of ['bmb', 'bmm', 'cis', 'core', 'tea']) {
      const dir = path.join(TEMPLATE_BYAN, mod, 'agents');
      const hasMd = fs.existsSync(dir)
        && fs.readdirSync(dir).some((f) => f.endsWith('.md'));
      expect(hasMd).toBe(false);
    }
  });

  test('the Gen3 by-type dirs exist and carry content', () => {
    for (const d of ['agent', 'workflow', 'connaissance', 'command', 'worker', 'memoire']) {
      const dir = path.join(TEMPLATE_BYAN, d);
      expect(fs.existsSync(dir)).toBe(true);
    }
  });

  test('the bundled MCP server is still present', () => {
    expect(fs.existsSync(path.join(TEMPLATE_BYAN, 'mcp', 'byan-mcp-server'))).toBe(true);
  });

  test('every dir in the installer whitelist exists in the template', () => {
    for (const d of GEN3_BYAN_DIRS) {
      expect(fs.existsSync(path.join(TEMPLATE_BYAN, d))).toBe(true);
    }
  });
});

describe('installer copy whitelist is Gen3, not Gen2', () => {
  const src = fs.readFileSync(INSTALLER_SRC, 'utf8');

  test('byanDirs references the Gen3 by-type dirs', () => {
    expect(src).toMatch(/byanDirs\s*=\s*\[[^\]]*'agent'/);
    expect(src).toMatch(/'workflow'/);
    expect(src).toMatch(/'connaissance'/);
    expect(src).toMatch(/'command'/);
    expect(src).toMatch(/'worker'/);
    expect(src).toMatch(/'memoire'/);
  });

  test('byanDirs no longer copies the Gen2 agents/workflows dirs', () => {
    // The exact Gen2 array literal must be gone.
    expect(src).not.toContain("['agents', 'core', 'bmb', 'bmm', 'tea', 'cis', '_config', '_memory', 'data', 'workflows']");
  });

  test('active soul is routed to _byan/agent/byan via soulActiveDir', () => {
    expect(src).toMatch(/soulActiveDir\s*=\s*path\.join\(byanDir,\s*'agent',\s*'byan'\)/);
  });
});

describe('replaying the install copy logic yields a Gen3-resolvable install', () => {
  let projectRoot;

  beforeAll(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-tpl-gen3-'));
    const byanDir = path.join(projectRoot, '_byan');
    await fs.ensureDir(byanDir);

    // Mirror create-byan-agent-v2.js : copy the whitelisted dirs.
    for (const d of GEN3_BYAN_DIRS) {
      const s = path.join(TEMPLATE_BYAN, d);
      if (await fs.pathExists(s)) await fs.copy(s, path.join(byanDir, d), { overwrite: true });
    }
    // Copy root-level files.
    for (const f of await fs.readdir(TEMPLATE_BYAN)) {
      const fp = path.join(TEMPLATE_BYAN, f);
      if ((await fs.stat(fp)).isFile()) await fs.copy(fp, path.join(byanDir, f), { overwrite: true });
    }
    // Creator-mode soul : active files land with the byan agent.
    const soulActiveDir = path.join(byanDir, 'agent', 'byan');
    await fs.ensureDir(soulActiveDir);
    const tplAgent = path.join(TEMPLATE_BYAN, 'agent', 'byan');
    for (const [from, to] of ACTIVE_SOUL) {
      const s = path.join(tplAgent, from);
      if (await fs.pathExists(s)) await fs.copy(s, path.join(soulActiveDir, to));
    }
  });

  afterAll(async () => {
    if (projectRoot) await fs.remove(projectRoot);
  });

  test('resolveAgent("byan") resolves to agent/byan/byan.md (Gen3)', () => {
    const hit = layoutResolver.resolveAgent('byan', { projectRoot });
    expect(hit).toBeTruthy();
    expect(hit.path.replace(/\\/g, '/')).toMatch(/_byan\/agent\/byan\/byan\.md$/);
  });

  test('resolveAgent("dev") resolves a module agent under agent/', () => {
    const hit = layoutResolver.resolveAgent('dev', { projectRoot });
    expect(hit).toBeTruthy();
    expect(hit.path.replace(/\\/g, '/')).toMatch(/_byan\/agent\/dev\/dev\.md$/);
  });

  test('soul.md and tao.md resolve Gen3-first under agent/byan/', () => {
    const soul = layoutResolver.resolveSoul('soul', { projectRoot });
    const tao = layoutResolver.resolveSoul('tao', { projectRoot });
    expect(soul.path.replace(/\\/g, '/')).toMatch(/_byan\/agent\/byan\/soul\.md$/);
    expect(tao.path.replace(/\\/g, '/')).toMatch(/_byan\/agent\/byan\/tao\.md$/);
  });

  test('the installed active soul files exist at agent/byan/', () => {
    const aDir = path.join(projectRoot, '_byan', 'agent', 'byan');
    for (const f of ['soul.md', 'tao.md', 'soul-memory.md', 'creator-soul.md']) {
      expect(fs.existsSync(path.join(aDir, f))).toBe(true);
    }
  });

  test('no flat _byan/agents/ directory in the install', () => {
    expect(fs.existsSync(path.join(projectRoot, '_byan', 'agents'))).toBe(false);
  });
});
