'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const resolver = require('../../src/byan-v2/lib/layout-resolver');

// ── fixtures ────────────────────────────────────────────────────────────────

function mkRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `byan-layout-${prefix}-`));
}

function write(root, rel, content = 'x') {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}

function buildGen2(root) {
  // per-module agents (where dev/analyst really live today)
  write(root, '_byan/bmm/agents/dev.md');
  write(root, '_byan/bmm/agents/analyst.md');
  write(root, '_byan/bmb/agents/byan.md');
  // flat agents (byan also exists flat today)
  write(root, '_byan/agents/byan.md');
  write(root, '_byan/agents/hermes.md');
  // soul at root
  write(root, '_byan/soul.md');
  write(root, '_byan/tao.md');
  write(root, '_byan/soul-memory.md');
  // knowledge + memory + config
  write(root, '_byan/knowledge/sources.md');
  write(root, '_byan/_memory/elo-profile.json', '{}');
  write(root, '_byan/config.yaml', 'byan_version: "2.0.0"');
  write(root, '_byan/bmb/config.yaml', 'byan_version: 2.7.3');
}

function buildGen3(root) {
  write(root, '_byan/agent/dev/dev.md');
  write(root, '_byan/agent/analyst/analyst.md');
  write(root, '_byan/agent/byan/byan.md');
  write(root, '_byan/agent/byan/soul.md');
  write(root, '_byan/agent/byan/tao.md');
  write(root, '_byan/agent/byan/soul-memory.md');
  write(root, '_byan/connaissance/sources.md');
  write(root, '_byan/memoire/elo-profile.json', '{}');
  write(root, '_byan/context/config.yaml', 'byan_version: 2.18.0');
}

let gen2;
let gen3;
let mixed;

beforeAll(() => {
  gen2 = mkRoot('gen2');
  gen3 = mkRoot('gen3');
  mixed = mkRoot('mixed');
  buildGen2(gen2);
  buildGen3(gen3);
  // mixed: gen3 dev present, but dev also still in gen2 module; byan only gen2
  buildGen2(mixed);
  write(mixed, '_byan/agent/dev/dev.md');
  write(mixed, '_byan/agent/byan/soul.md');
});

afterAll(() => {
  for (const r of [gen2, gen3, mixed]) fs.rmSync(r, { recursive: true, force: true });
});

// ── resolveAgent ──────────────────────────────────────────────────────────--

describe('resolveAgent', () => {
  test('Gen2: finds per-module agent (dev lives in bmm/agents)', () => {
    const r = resolver.resolveAgent('dev', { projectRoot: gen2 });
    expect(r).not.toBeNull();
    expect(r.layout).toBe('gen2-module');
    expect(r.rel).toBe('_byan/bmm/agents/dev.md');
  });

  test('Gen2: flat agent wins over module when both exist (byan)', () => {
    const r = resolver.resolveAgent('byan', { projectRoot: gen2 });
    expect(r.layout).toBe('gen2-flat');
    expect(r.rel).toBe('_byan/agents/byan.md');
  });

  test('Gen3: finds _byan/agent/<name>/<name>.md', () => {
    const r = resolver.resolveAgent('dev', { projectRoot: gen3 });
    expect(r.layout).toBe('gen3');
    expect(r.rel).toBe('_byan/agent/dev/dev.md');
  });

  test('mixed: Gen3 wins over Gen2 for the same agent', () => {
    const r = resolver.resolveAgent('dev', { projectRoot: mixed });
    expect(r.layout).toBe('gen3');
    expect(r.rel).toBe('_byan/agent/dev/dev.md');
  });

  test('returns null for an unknown agent', () => {
    expect(resolver.resolveAgent('does-not-exist', { projectRoot: gen3 })).toBeNull();
  });

  test('is idempotent and side-effect free (no file created)', () => {
    const before = fs.readdirSync(path.join(gen3, '_byan', 'agent'));
    const a = resolver.resolveAgent('dev', { projectRoot: gen3 });
    const b = resolver.resolveAgent('dev', { projectRoot: gen3 });
    expect(a).toEqual(b);
    const after = fs.readdirSync(path.join(gen3, '_byan', 'agent'));
    expect(after).toEqual(before);
  });
});

// ── resolveSoul / soulPath ───────────────────────────────────────────────────

describe('resolveSoul', () => {
  test('Gen2: root _byan/soul.md', () => {
    const r = resolver.resolveSoul('soul', { projectRoot: gen2 });
    expect(r.layout).toBe('gen2');
    expect(r.rel).toBe('_byan/soul.md');
  });

  test('Gen3: _byan/agent/byan/soul.md', () => {
    const r = resolver.resolveSoul('soul', { projectRoot: gen3 });
    expect(r.layout).toBe('gen3');
    expect(r.rel).toBe('_byan/agent/byan/soul.md');
  });

  test('unknown soul kind returns null', () => {
    expect(resolver.resolveSoul('nope', { projectRoot: gen3 })).toBeNull();
  });

  test('soulPath returns a usable Gen2 path when nothing exists yet', () => {
    const empty = mkRoot('empty-soul');
    try {
      const r = resolver.soulPath('soul-memory', { projectRoot: empty });
      expect(r.layout).toBe('gen2');
      expect(r.rel).toBe('_byan/soul-memory.md');
      expect(r.exists).toBe(false);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  test('soulPath returns null for unknown kind', () => {
    expect(resolver.soulPath('nope', { projectRoot: gen3 })).toBeNull();
  });
});

// ── knowledgePath / memoryPath (locate write-or-read) ─────────────────────────

describe('knowledgePath / memoryPath', () => {
  test('Gen2 existing knowledge resolves to _byan/knowledge', () => {
    const r = resolver.knowledgePath('sources.md', { projectRoot: gen2 });
    expect(r.layout).toBe('gen2');
    expect(r.exists).toBe(true);
  });

  test('Gen3 existing knowledge resolves to _byan/connaissance', () => {
    const r = resolver.knowledgePath('sources.md', { projectRoot: gen3 });
    expect(r.layout).toBe('gen3');
  });

  test('memory write-target: Gen3 dir present, file absent -> gen3', () => {
    const r = resolver.memoryPath('fact-graph.json', { projectRoot: gen3 });
    expect(r.layout).toBe('gen3');
    expect(r.exists).toBe(false);
    expect(r.rel).toBe('_byan/memoire/fact-graph.json');
  });

  test('memory write-target on Gen2 repo defaults to _byan/_memory', () => {
    const r = resolver.memoryPath('fact-graph.json', { projectRoot: gen2 });
    expect(r.layout).toBe('gen2');
    expect(r.rel).toBe('_byan/_memory/fact-graph.json');
  });

  test('bare repo (no _byan) defaults memory to Gen2 path', () => {
    const empty = mkRoot('empty-mem');
    try {
      const r = resolver.memoryPath('x.json', { projectRoot: empty });
      expect(r.layout).toBe('gen2');
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

// ── resolveConfig ─────────────────────────────────────────────────────────--

describe('resolveConfig', () => {
  test('Gen3 prefers context/config.yaml', () => {
    expect(resolver.resolveConfig({ projectRoot: gen3 }).rel).toBe('_byan/context/config.yaml');
  });

  test('Gen2 root config.yaml when no context', () => {
    expect(resolver.resolveConfig({ projectRoot: gen2 }).rel).toBe('_byan/config.yaml');
  });

  test('falls back to module bmb/config.yaml when only it exists', () => {
    const onlyModule = mkRoot('only-bmb');
    try {
      write(onlyModule, '_byan/bmb/config.yaml', 'byan_version: 2.7.3');
      const r = resolver.resolveConfig({ projectRoot: onlyModule });
      expect(r.layout).toBe('gen2-module');
      expect(r.rel).toBe('_byan/bmb/config.yaml');
    } finally {
      fs.rmSync(onlyModule, { recursive: true, force: true });
    }
  });

  test('null when no config anywhere', () => {
    const empty = mkRoot('no-cfg');
    try {
      expect(resolver.resolveConfig({ projectRoot: empty })).toBeNull();
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

// ── listAgents ────────────────────────────────────────────────────────────--

describe('listAgents', () => {
  test('Gen2: discovers module + flat agents, deduped', () => {
    const names = resolver.listAgents({ projectRoot: gen2 }).map((a) => a.name).sort();
    expect(names).toEqual(['analyst', 'byan', 'dev', 'hermes']);
  });

  test('mixed: dev reported as Gen3 (wins over module)', () => {
    const dev = resolver.listAgents({ projectRoot: mixed }).find((a) => a.name === 'dev');
    expect(dev.layout).toBe('gen3');
  });

  test('skips soul/tao siblings', () => {
    const r = mkRoot('siblings');
    try {
      write(r, '_byan/agents/jimmy.md');
      write(r, '_byan/agents/jimmy-soul.md');
      write(r, '_byan/agents/jimmy-tao.md');
      const names = resolver.listAgents({ projectRoot: r }).map((a) => a.name);
      expect(names).toEqual(['jimmy']);
    } finally {
      fs.rmSync(r, { recursive: true, force: true });
    }
  });

  test('empty repo -> []', () => {
    const empty = mkRoot('no-agents');
    try {
      expect(resolver.listAgents({ projectRoot: empty })).toEqual([]);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

// ── isAgentPath (pure predicate) ────────────────────────────────────────────-

describe('isAgentPath', () => {
  test.each([
    ['_byan/agent/dev/dev.md', true],
    ['_byan/agents/byan.md', true],
    ['_byan/bmm/agents/analyst.md', true],
    ['_byan/bmb/agents/byan.md', true],
    ['/abs/prefix/_byan/agent/x/x.md', true],
    ['_byan/workflow/simple/foo.md', false],
    ['_byan/connaissance/sources.md', false],
    ['README.md', false],
  ])('isAgentPath(%s) === %s', (rel, expected) => {
    expect(resolver.isAgentPath(rel)).toBe(expected);
  });
});

// ── detectLayout ────────────────────────────────────────────────────────────

describe('detectLayout', () => {
  test('gen3 when _byan/agent exists', () => {
    expect(resolver.detectLayout({ projectRoot: gen3 })).toBe('gen3');
    expect(resolver.detectLayout({ projectRoot: mixed })).toBe('gen3');
  });
  test('gen2 otherwise', () => {
    expect(resolver.detectLayout({ projectRoot: gen2 })).toBe('gen2');
  });
});

// ── single source of truth: MODULES mirrors migration-map.js ──────────────────

describe('MODULES stays in sync with migration-map.js (write-side authority)', () => {
  test('resolver.MODULES equals migration-map MODULES', () => {
    const mapSrc = fs.readFileSync(
      path.join(__dirname, '../../_byan/mcp/byan-mcp-server/lib/migration-map.js'),
      'utf8'
    );
    const m = mapSrc.match(/const\s+MODULES\s*=\s*\[([^\]]*)\]/);
    expect(m).not.toBeNull();
    const mapModules = m[1]
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    expect(resolver.MODULES).toEqual(mapModules);
  });
});
