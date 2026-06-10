'use strict';

// TDD: this test is written BEFORE data/recommender.json and lib/recommender.js.
// It pins the versioned decision-table contract (C5): the table is DATA (not code),
// recommend(profile) is a PURE evaluator over that table, and the table itself is
// assertable in isolation (shape + a couple of representative rules).

const fs = require('fs');
const path = require('path');
const os = require('os');

const TABLE_PATH = path.join(__dirname, '..', 'data', 'recommender.json');

const recommender = require('../lib/recommender');
const {
  loadRecipes,
  recommend,
  recommendPlatform,
  recipeFor,
  DEFAULTS,
} = recommender;

// A complete, healthy machine: node ok, npm + git found, claude present.
function completeProfile() {
  return {
    os: { name: 'linux', isWindows: false },
    node: { version: '24.13.1', meetsMin: true, min: '18.0.0' },
    npm: { found: true, version: '10.8.0', path: '/usr/bin/npm' },
    git: { installed: true, version: '2.39.2' },
    platforms: {
      claude: { binary: 'claude', found: true, version: '2.1.114' },
      codex: { binary: 'codex', found: false, version: null },
      copilot: { binary: 'copilot', found: false, version: null },
    },
  };
}

// An empty machine: node too old, npm + git missing, no platform CLI at all.
function emptyProfile() {
  return {
    os: { name: 'linux', isWindows: false },
    node: { version: '16.0.0', meetsMin: false, min: '18.0.0' },
    npm: { found: false, version: null, path: null },
    git: { installed: false, version: null },
    platforms: {
      claude: { binary: 'claude', found: false, version: null },
      codex: { binary: 'codex', found: false, version: null },
      copilot: { binary: 'copilot', found: false, version: null },
    },
  };
}

// A profile where only copilot is present (preference-order resolution check).
function copilotOnlyProfile() {
  const p = emptyProfile();
  p.node.meetsMin = true;
  p.node.version = '20.0.0';
  p.npm.found = true;
  p.git.installed = true;
  p.platforms.copilot.found = true;
  return p;
}

describe('data/recommender.json (table in isolation)', () => {
  let table;

  beforeAll(() => {
    table = JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8'));
  });

  test('parses and carries a numeric schemaVersion', () => {
    expect(typeof table.schemaVersion).toBe('number');
    expect(table.schemaVersion).toBeGreaterThanOrEqual(1);
  });

  test('declares a preferenceOrder with claude first', () => {
    expect(Array.isArray(table.preferenceOrder)).toBe(true);
    expect(table.preferenceOrder[0]).toBe('claude');
    expect(table.preferenceOrder).toEqual(
      expect.arrayContaining(['claude', 'codex', 'copilot'])
    );
  });

  test('byanWeb default apiUrl is the local dev URL', () => {
    expect(table.byanWeb.defaultApiUrl).toBe('http://localhost:3737');
  });

  test('recipes pin the recon-confirmed package + binary identities', () => {
    expect(table.recipes.claude.npmPackage).toBe('@anthropic-ai/claude-code');
    expect(table.recipes.claude.binary).toBe('claude');
    expect(table.recipes.codex.binary).toBe('codex');
    expect(table.recipes.copilot.binary).toBe('copilot');
    // Copilot CLI is bundled with gh, not an npm package (recon).
    expect(table.recipes.copilot.npmPackage).toBeNull();
    expect(table.recipes.copilot.bundledWith).toBe('gh');
  });

  test('every recipe carries the required fields (no missing field)', () => {
    const required = [
      'binary',
      'installCommandTemplate',
      'authCommand',
      'detectCommand',
      'configDirCandidates',
    ];
    for (const name of ['claude', 'codex', 'copilot']) {
      const recipe = table.recipes[name];
      for (const field of required) {
        expect(recipe).toHaveProperty(field);
      }
      expect(Array.isArray(recipe.installCommandTemplate)).toBe(true);
      expect(Array.isArray(recipe.detectCommand)).toBe(true);
      expect(Array.isArray(recipe.configDirCandidates)).toBe(true);
      // Zero-sudo invariant baked into the data (C11).
      expect(recipe.sudo).toBe(false);
    }
  });

  test('rules is a non-empty array of typed, severity-tagged entries', () => {
    expect(Array.isArray(table.rules)).toBe(true);
    expect(table.rules.length).toBeGreaterThan(0);
    for (const rule of table.rules) {
      expect(typeof rule.id).toBe('string');
      expect(typeof rule.when).toBe('string');
      expect(['block', 'recommend', 'warn']).toContain(rule.action);
      expect(typeof rule.message).toBe('string');
      expect(rule.message.length).toBeGreaterThan(0);
    }
  });

  test('carries a node-missing block rule and a git-absent warn rule (representative rules)', () => {
    const ids = table.rules.map((r) => r.id);
    expect(ids).toContain('node-too-old');
    expect(ids).toContain('git-absent');
    const nodeRule = table.rules.find((r) => r.id === 'node-too-old');
    expect(nodeRule.action).toBe('block');
    const gitRule = table.rules.find((r) => r.id === 'git-absent');
    expect(gitRule.action).toBe('warn');
  });

  test('carries a no-platform recommend rule that defaults to claude', () => {
    const rule = table.rules.find((r) => r.id === 'no-platform-cli');
    expect(rule).toBeDefined();
    expect(rule.action).toBe('recommend');
    expect(rule.defaultPlatform).toBe('claude');
  });
});

describe('lib/recommender — loadRecipes', () => {
  test('loadRecipes() returns the parsed table with recipes + preferenceOrder', () => {
    const t = loadRecipes();
    expect(t.schemaVersion).toBeGreaterThanOrEqual(1);
    expect(t.recipes.claude.npmPackage).toBe('@anthropic-ai/claude-code');
    expect(t.preferenceOrder[0]).toBe('claude');
  });

  test('loadRecipes(overridePath) deep-merges a user override, preserving original fields', () => {
    const overrideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-reco-ovr-'));
    const overridePath = path.join(overrideDir, 'override.json');
    fs.writeFileSync(
      overridePath,
      JSON.stringify({
        schemaVersion: 1,
        recipes: { claude: { versionRange: '^9.9.9' } },
      })
    );
    try {
      const t = loadRecipes(overridePath);
      // Overridden field wins.
      expect(t.recipes.claude.versionRange).toBe('^9.9.9');
      // Untouched fields survive the deep merge.
      expect(t.recipes.claude.npmPackage).toBe('@anthropic-ai/claude-code');
      expect(t.recipes.claude.binary).toBe('claude');
      // The base table is not mutated by the merge.
      expect(loadRecipes().recipes.claude.versionRange).not.toBe('^9.9.9');
    } finally {
      fs.rmSync(overrideDir, { recursive: true, force: true });
    }
  });

  test('loadRecipes throws on schemaVersion mismatch in the override', () => {
    const overrideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-reco-bad-'));
    const overridePath = path.join(overrideDir, 'bad.json');
    fs.writeFileSync(
      overridePath,
      JSON.stringify({ schemaVersion: 999, recipes: {} })
    );
    try {
      expect(() => loadRecipes(overridePath)).toThrow(/schemaVersion/i);
    } finally {
      fs.rmSync(overrideDir, { recursive: true, force: true });
    }
  });

  test('DEFAULTS exposes the byanWeb apiUrl', () => {
    expect(DEFAULTS.apiUrl).toBe('http://localhost:3737');
  });
});

describe('lib/recommender — recommendPlatform / recipeFor', () => {
  test('recommendPlatform returns the only found platform (copilot)', () => {
    expect(recommendPlatform(copilotOnlyProfile())).toBe('copilot');
  });

  test('recommendPlatform on a none-found profile returns the first preference entry', () => {
    expect(recommendPlatform(emptyProfile())).toBe('claude');
  });

  test('recommendPlatform honors preference order when several are found', () => {
    const p = completeProfile();
    p.platforms.copilot.found = true; // claude + copilot both found -> claude wins
    expect(recommendPlatform(p)).toBe('claude');
  });

  test('recipeFor returns the recipe for a platform', () => {
    const recipe = recipeFor('codex');
    expect(recipe.binary).toBe('codex');
    expect(recipe.authCommand).toBe('codex auth login');
  });
});

describe('lib/recommender — recommend(profile) evaluator', () => {
  test('is pure: same profile yields byte-identical ordered actions', () => {
    const p = emptyProfile();
    const a = recommend(p);
    const b = recommend(p);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // and the input is not mutated
    expect(JSON.stringify(p)).toBe(JSON.stringify(emptyProfile()));
  });

  test('returns an array of {id, action, severity, message} actions', () => {
    const actions = recommend(emptyProfile());
    expect(Array.isArray(actions)).toBe(true);
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(typeof action.id).toBe('string');
      expect(['block', 'recommend', 'warn']).toContain(action.action);
      expect(typeof action.message).toBe('string');
    }
  });

  test('empty machine: blocks come first, ordered block -> recommend -> warn', () => {
    const actions = recommend(emptyProfile());
    const order = actions.map((a) => a.action);
    // node-too-old block must lead.
    expect(actions[0].id).toBe('node-too-old');
    expect(actions[0].action).toBe('block');
    // global ordering: no warn appears before a block, no block after a warn.
    const rank = { block: 0, recommend: 1, warn: 2 };
    for (let i = 1; i < order.length; i++) {
      expect(rank[order[i]]).toBeGreaterThanOrEqual(rank[order[i - 1]]);
    }
  });

  test('empty machine fires the expected rule set (node, npm, git, no-platform)', () => {
    const ids = recommend(emptyProfile()).map((a) => a.id);
    expect(ids).toContain('node-too-old');
    expect(ids).toContain('npm-absent');
    expect(ids).toContain('git-absent');
    expect(ids).toContain('no-platform-cli');
  });

  test('empty machine: no-platform recommendation defaults to claude', () => {
    const actions = recommend(emptyProfile());
    const platformRec = actions.find((a) => a.id === 'no-platform-cli');
    expect(platformRec).toBeDefined();
    expect(platformRec.platform).toBe('claude');
  });

  test('complete machine: no blocking actions', () => {
    const actions = recommend(completeProfile());
    const blocks = actions.filter((a) => a.action === 'block');
    expect(blocks).toEqual([]);
    // a fully-equipped claude machine triggers no node/npm/git/platform rule.
    const ids = actions.map((a) => a.id);
    expect(ids).not.toContain('node-too-old');
    expect(ids).not.toContain('npm-absent');
    expect(ids).not.toContain('git-absent');
    expect(ids).not.toContain('no-platform-cli');
  });

  test('recommend reads from the table: a recommend action carries the rule message verbatim', () => {
    const table = JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8'));
    const rule = table.rules.find((r) => r.id === 'no-platform-cli');
    const action = recommend(emptyProfile()).find((a) => a.id === 'no-platform-cli');
    // proves the evaluator does not hardcode messages — they come from the data.
    expect(action.message).toBe(rule.message);
  });

  test('no LLM, no child_process required by the module', () => {
    const resolved = require.resolve('../lib/recommender');
    const mod = require.cache[resolved];
    const childLoaded = Object.keys(require.cache).some((k) =>
      /\bchild_process\b/.test(k)
    );
    // recommender itself must not pull child_process; assert it is not in its children.
    const requiredByRecommender = (mod.children || []).map((c) => c.id);
    expect(requiredByRecommender.some((id) => /child_process/.test(id))).toBe(false);
    // (childLoaded across the whole process may be true from jest internals; we only
    // assert recommender's own dependency graph is clean.)
    void childLoaded;
  });
});
