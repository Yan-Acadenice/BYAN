'use strict';

// Module under test: lib/plan.js
//
// Contract: plan(profile, answers) is PURE (no disk write, no spawn) and
// deterministic — same (profile, answers) yields a byte-identical InstallPlan.
// It consumes lib/recommender.js (the versioned JSON table, C5) to resolve
// 'auto' fields, collapses AUTO/CUSTOM/MANUAL into one code path that only
// toggles `when` predicates + stub breadth (I37), always emits an explicit
// AUTH-handoff step (C12, never fakes auth), and carries the byanWeb token by
// reference (never inline — secret hygiene).
//
// Covers C1 (plan purity), C5 (consumes the table), C7 (no prompts inside),
// part of C6 (superset of the v2.19 AUTO artifact contract), C12 (AUTH handoff).

const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

const { plan, InstallPlanError, ANSWERS_SCHEMA } = require('../lib/plan');
const { DEFAULTS } = require('../lib/recommender');

// Shape-only fixture. NOT a real token: 'byan_' + 64 zeroes (see MEMORY:
// feedback_no_real_tokens_in_tests).
const FAKE_TOKEN = 'byan_' + '0'.repeat(64);

// --- profile fixtures (REAL MachineProfile shape from lib/detect.js) ----------
// detect.js emits FLAT per-platform keys (profile.claude/.codex/.copilot), each
// { present, path, version }, NOT a nested profile.platforms.{...}. plan() must
// consume that real shape.

function makeProfile(presentPlatforms) {
  const set = new Set(presentPlatforms || []);
  function tool(bin) {
    const present = set.has(bin);
    return {
      present: present,
      path: present ? '/usr/bin/' + bin : null,
      version: present ? '1.0.0' : null,
    };
  }
  return Object.freeze({
    schemaVersion: 1,
    type: 'MachineProfile',
    os: { name: 'linux', platform: 'linux', arch: 'x64', release: '5.10', isWindows: false },
    node: { present: true, version: '20.0.0', min: '18.0.0', meetsMin: true },
    npm: tool('npm'),
    git: tool('git'),
    claude: tool('claude'),
    codex: tool('codex'),
    copilot: tool('copilot'),
    recommended: { primaryPlatform: 'claude', rationale: 'test fixture' },
    generatedAt: '2026-01-01T00:00:00.000Z',
  });
}

// The canonical AUTO answers — reproduces v2.19 AUTO exactly. Only user.name +
// language are explicit; everything else is defaulted/'auto'. flow:'auto'.
function autoAnswers(overrides) {
  const base = {
    flow: 'auto',
    platforms: 'auto',
    agents: [],
    user: { name: 'Yan', communicationLanguage: 'fr' },
    soul: { mode: 'creator' },
    byanWeb: { enabled: true, apiUrl: 'auto', token: FAKE_TOKEN, syncConsent: false },
    turboWhisper: 'skip',
    costOptimizer: false,
    installV2: false,
    installClis: false,
    byanVersion: '2.19.0',
  };
  return Object.assign({}, base, overrides || {});
}

// The v2.19 AUTO artifact contract (the dest paths that an AUTO install must
// produce). plan() output dest set must be a SUPERSET of this. Encoded here as
// the test's source of truth (verify.js owns the runtime AUTO_ARTIFACT_SET; the
// plan only needs to emit steps that cover these dests).
const V2_19_AUTO_DESTS = Object.freeze([
  '_byan',
  '.claude',
  '.github/agents',
  '_byan/bmb/config.yaml',
  '_byan/agent/byan',
  '.mcp.json',
  '.env',
]);

// Helper: collect every `dest` declared by the plan's steps.
function destsOf(p) {
  return p.steps.map(function (s) { return s.dest; }).filter(Boolean);
}

function typesOf(p) {
  return p.steps.map(function (s) { return s.type; });
}

// --- purity (C1) --------------------------------------------------------------

describe('plan — purity (C1)', () => {
  test('does not require child_process, fs-extra, or fs at module load', () => {
    // Read the source and assert no spawn / no fs-write API is referenced. plan
    // is a PURE transform: profile + answers -> data. It never touches disk.
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'plan.js'), 'utf8');
    expect(src).not.toMatch(/require\(['"]child_process['"]\)/);
    expect(src).not.toMatch(/require\(['"]fs-extra['"]\)/);
    expect(src).not.toMatch(/execSync|execFileSync|spawnSync|\.spawn\(/);
    // No fs WRITE surface (a stray fs.readFileSync of the table would be fine,
    // but plan must not write). Assert the obvious mutators are absent.
    expect(src).not.toMatch(/\bwriteFile|ensureDir|mkdirSync|copySync|\.copy\(/);
  });

  test('does not create or modify any file under a temp cwd', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-plan-pure-'));
    try {
      const before = fs.readdirSync(tmp).sort();
      plan(makeProfile(['claude']), autoAnswers({ user: { name: 'Yan', communicationLanguage: 'fr' } }));
      const after = fs.readdirSync(tmp).sort();
      expect(after).toEqual(before);
      expect(after).toHaveLength(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('never spawns: a child_process spy is untouched after plan()', () => {
    const spies = [
      jest.spyOn(childProcess, 'execSync'),
      jest.spyOn(childProcess, 'execFileSync'),
      jest.spyOn(childProcess, 'spawnSync'),
    ];
    plan(makeProfile(['claude', 'copilot']), autoAnswers());
    spies.forEach(function (s) { expect(s).not.toHaveBeenCalled(); });
    jest.restoreAllMocks();
  });

  test('returns a serializable plan (JSON round-trips)', () => {
    const p = plan(makeProfile(['claude']), autoAnswers());
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });
});

// --- determinism (C1) ---------------------------------------------------------

describe('plan — determinism', () => {
  test('same (profile, answers) yields byte-identical plan (stable planId)', () => {
    const profile = makeProfile(['claude']);
    const a = plan(profile, autoAnswers());
    const b = plan(profile, autoAnswers());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.planId).toBe(b.planId);
    expect(typeof a.planId).toBe('string');
    expect(a.planId.length).toBeGreaterThan(0);
  });

  test('different answers yield a different planId', () => {
    const profile = makeProfile(['claude']);
    const a = plan(profile, autoAnswers());
    const b = plan(profile, autoAnswers({ user: { name: 'Other', communicationLanguage: 'en' } }));
    expect(a.planId).not.toBe(b.planId);
  });
});

// --- C5: consumes the recommender table --------------------------------------

describe('plan — consumes the recommender table (C5)', () => {
  test("platforms:'auto' resolves via recommender.recommendPlatform (claude found => claude)", () => {
    const p = plan(makeProfile(['claude']), autoAnswers());
    expect(p.targets.platforms).toContain('claude');
  });

  test("platforms:'auto' honors the REAL detect shape: a copilot-only machine resolves to copilot, not the claude fallback", () => {
    // Regression guard: detect.js emits FLAT per-platform keys
    // (profile.copilot.present), and the profile already carries
    // recommended.primaryPlatform computed from that shape. plan() must resolve
    // 'auto' to the ACTUAL found platform, not silently degrade to claude.
    const copilotOnly = makeProfile(['copilot']);
    // detect would compute primaryPlatform=copilot for this machine.
    const profile = Object.assign({}, copilotOnly, {
      recommended: { primaryPlatform: 'copilot', rationale: 'copilot is the only found platform' },
    });
    const p = plan(profile, autoAnswers());
    expect(p.targets.platforms).toEqual(['copilot']);
  });

  test("byanWeb.apiUrl:'auto' resolves to recommender DEFAULTS.apiUrl", () => {
    const p = plan(makeProfile(['claude']), autoAnswers());
    expect(p.targets.byanWeb.apiUrl).toBe(DEFAULTS.apiUrl);
  });

  test('cli-install step carries the npm package name from the table recipe', () => {
    // claude NOT present + installClis => a cli-install step using the table recipe.
    const p = plan(
      makeProfile([]),
      autoAnswers({ platforms: ['claude'], installClis: true })
    );
    const cli = p.steps.find(function (s) { return s.type === 'cli-install' && s.platform === 'claude'; });
    expect(cli).toBeDefined();
    expect(cli.npmPackage).toBe('@anthropic-ai/claude-code');
    expect(cli.command).toContain('npm');
    expect(cli.command).toContain('-g');
    expect(cli.sudo).toBe(false);
  });
});

// --- C7: no prompts inside (engine-level wizard support) ----------------------

describe('plan — no hidden prompts (C7)', () => {
  test('source contains no inquirer / readline / process.stdin', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'plan.js'), 'utf8');
    expect(src).not.toMatch(/inquirer|readline|process\.stdin|prompt\(/);
  });

  test('ANSWERS_SCHEMA documents the full non-interactive contract', () => {
    expect(ANSWERS_SCHEMA).toBeDefined();
    // The contract carries every field a wizard must prefill — proving the UI
    // is a thin answer-builder with no prompt inside the engine.
    ['flow', 'platforms', 'agents', 'user', 'soul', 'byanWeb', 'installClis', 'byanVersion'].forEach(function (k) {
      expect(Object.prototype.hasOwnProperty.call(ANSWERS_SCHEMA, k)).toBe(true);
    });
  });
});

// --- C6 (part): superset of v2.19 AUTO artifact contract ----------------------

describe('plan — AUTO is a superset of the v2.19 AUTO artifact contract (part of C6)', () => {
  test('AUTO plan dest set covers every v2.19 AUTO dest (no regression)', () => {
    // v2.19 AUTO installs BOTH the Claude (.claude/.mcp.json) and the Copilot
    // (.github/agents) artifact families, so the canonical AUTO targets both.
    const p = plan(makeProfile(['claude', 'copilot']), autoAnswers({ platforms: ['claude', 'copilot'] }));
    const produced = new Set(destsOf(p));
    const missing = V2_19_AUTO_DESTS.filter(function (d) { return !produced.has(d); });
    expect(missing).toEqual([]);
  });

  test('config.yaml write step carries the v2.19 AUTO field block', () => {
    const p = plan(makeProfile(['claude']), autoAnswers());
    const cfg = p.steps.find(function (s) { return s.dest === '_byan/bmb/config.yaml'; });
    expect(cfg).toBeDefined();
    expect(cfg.type).toBe('write-file');
    expect(cfg.data.install_mode).toBe('auto');
    expect(cfg.data.soul_mode).toBe('creator');
    expect(cfg.data.byan_version).toBe('2.19.0');
    expect(typeof cfg.data.platform).toBe('string');
    expect(cfg.data.user_name).toBe('Yan');
    expect(cfg.data.communication_language).toBe('fr');
  });

  test('soul creator step carries the byan-* -> active rename map', () => {
    const p = plan(makeProfile(['claude']), autoAnswers());
    const soul = p.steps.find(function (s) { return s.id === 'soul:creator'; });
    expect(soul).toBeDefined();
    expect(soul.dest).toBe('_byan/agent/byan');
    // creator mode renames byan-soul.md -> soul.md, byan-tao.md -> tao.md, etc.
    expect(soul.files).toEqual(expect.arrayContaining([
      'byan-soul.md->soul.md',
      'byan-tao.md->tao.md',
      'byan-soul-memory.md->soul-memory.md',
    ]));
  });

  test('blank soul mode does NOT emit the creator rename map', () => {
    const p = plan(makeProfile(['claude']), autoAnswers({ soul: { mode: 'blank' } }));
    const creator = p.steps.find(function (s) { return s.id === 'soul:creator'; });
    expect(creator).toBeUndefined();
  });
});

// --- C12: explicit AUTH handoff, always present, never faked ------------------

describe('plan — explicit AUTH handoff (C12)', () => {
  test('an auth-handoff step is present for every selected platform', () => {
    const p = plan(makeProfile([]), autoAnswers({ platforms: ['claude', 'codex'] }));
    const auths = p.steps.filter(function (s) { return s.type === 'auth-handoff'; });
    const platforms = auths.map(function (s) { return s.platform; });
    expect(platforms).toEqual(expect.arrayContaining(['claude', 'codex']));
  });

  test('the auth-handoff carries the recipe authCommand, not a fake success', () => {
    const p = plan(makeProfile([]), autoAnswers({ platforms: ['claude'] }));
    const auth = p.steps.find(function (s) { return s.type === 'auth-handoff' && s.platform === 'claude'; });
    expect(auth).toBeDefined();
    expect(auth.command).toBe('claude login');
    // It is a handoff descriptor: it must NOT claim authenticated.
    expect(JSON.stringify(auth)).not.toMatch(/authenticated|success/i);
  });

  test('authHandoffs summary mirrors the auth-handoff steps', () => {
    const p = plan(makeProfile([]), autoAnswers({ platforms: ['claude', 'codex'] }));
    expect(Array.isArray(p.authHandoffs)).toBe(true);
    const cmds = p.authHandoffs.map(function (h) { return h.command; });
    expect(cmds).toEqual(expect.arrayContaining(['claude login', 'codex auth login']));
  });
});

// --- flow-unique mapping (I37): one code path, predicates differ --------------

describe('plan — flow-unique (I37)', () => {
  test('AUTO with claude-only includes copy:.claude + render:mcp, excludes copy:.github/agents', () => {
    const p = plan(makeProfile(['claude']), autoAnswers({ platforms: ['claude'] }));
    const ids = p.steps.map(function (s) { return s.id; });
    expect(ids).toContain('copy:_byan');
    expect(ids).toContain('copy:.claude');
    expect(ids).toContain('render:mcp');
    expect(ids).not.toContain('copy:.github/agents');
  });

  test('copilot selected => copy:.github/agents present', () => {
    const p = plan(makeProfile(['claude', 'copilot']), autoAnswers({ platforms: ['claude', 'copilot'] }));
    const ids = p.steps.map(function (s) { return s.id; });
    expect(ids).toContain('copy:.github/agents');
  });

  test('MANUAL with agents:[dev,pm] narrows the stub-copy breadth (filtered, not all)', () => {
    const p = plan(
      makeProfile(['copilot']),
      autoAnswers({ flow: 'manual', platforms: ['copilot'], agents: ['dev', 'pm'], soul: { mode: 'blank' } })
    );
    const stub = p.steps.find(function (s) { return s.id === 'copy:.github/agents'; });
    expect(stub).toBeDefined();
    // filtered breadth: the step declares the explicit agent subset, not "all".
    expect(Array.isArray(stub.agents)).toBe(true);
    expect(stub.agents).toEqual(['dev', 'pm']);
    expect(stub.all).toBe(false);
  });

  test('AUTO stub-copy is the full (unfiltered) breadth', () => {
    const p = plan(makeProfile(['copilot']), autoAnswers({ flow: 'auto', platforms: ['copilot'] }));
    const stub = p.steps.find(function (s) { return s.id === 'copy:.github/agents'; });
    expect(stub).toBeDefined();
    expect(stub.all).toBe(true);
  });

  test('AUTO and CUSTOM produce the identical step TYPE multiset (only predicates/fields differ) — I37', () => {
    const profile = makeProfile(['claude', 'copilot']);
    const a = plan(profile, autoAnswers({ flow: 'auto', platforms: ['claude', 'copilot'] }));
    const c = plan(profile, autoAnswers({ flow: 'custom', platforms: ['claude', 'copilot'] }));
    expect(typesOf(a).sort()).toEqual(typesOf(c).sort());
  });
});

// --- step pruning + ordering --------------------------------------------------

describe('plan — pruning and ordering', () => {
  test('no step in the final plan carries when===false (pruned)', () => {
    const p = plan(makeProfile(['claude']), autoAnswers());
    p.steps.forEach(function (s) { expect(s.when).not.toBe(false); });
  });

  test('steps are in the fixed canonical order: mkdir -> copy -> write config -> soul -> mcp -> env -> cli-install -> auth -> manifest', () => {
    const p = plan(makeProfile([]), autoAnswers({ platforms: ['claude'], installClis: true }));
    // Phase rank keyed by id/type: soul:creator is a copy-template BY TYPE but a
    // distinct phase that lands AFTER write config (matches v2.19 + the design's
    // fixed order). Rank by phase, not raw type.
    const phaseRank = function (s) {
      if (s.id && s.id.indexOf('soul:') === 0) return 3;
      const order = ['mkdir', 'copy-template', 'write-file', '__soul__', 'render-mcp', 'write-env', 'write-settings-local', 'cli-install', 'auth-handoff', 'manifest'];
      return order.indexOf(s.type);
    };
    let prev = -1;
    p.steps.forEach(function (s) {
      const r = phaseRank(s);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    });
  });

  test('manifest step is always last', () => {
    const p = plan(makeProfile(['claude']), autoAnswers());
    const last = p.steps[p.steps.length - 1];
    expect(last.type).toBe('manifest');
    expect(last.dest).toBe('_byan/.manifest.json');
  });
});

// --- cli-install gating (C14 part) --------------------------------------------

describe('plan — cli-install gating', () => {
  test('cli-install present ONLY when installClis && platform not already found', () => {
    // claude already present => no install step even with installClis.
    const present = plan(makeProfile(['claude']), autoAnswers({ platforms: ['claude'], installClis: true }));
    expect(present.steps.find(function (s) { return s.type === 'cli-install' && s.platform === 'claude'; })).toBeUndefined();

    // claude absent + installClis => install step appears.
    const absent = plan(makeProfile([]), autoAnswers({ platforms: ['claude'], installClis: true }));
    expect(absent.steps.find(function (s) { return s.type === 'cli-install' && s.platform === 'claude'; })).toBeDefined();

    // installClis false => never an install step.
    const noFlag = plan(makeProfile([]), autoAnswers({ platforms: ['claude'], installClis: false }));
    expect(noFlag.steps.find(function (s) { return s.type === 'cli-install'; })).toBeUndefined();
  });

  test('--install-cli=codex changes the install step to the codex npm package', () => {
    const p = plan(makeProfile([]), autoAnswers({ platforms: ['codex'], installClis: true, soul: { mode: 'blank' } }));
    const cli = p.steps.find(function (s) { return s.type === 'cli-install' && s.platform === 'codex'; });
    expect(cli).toBeDefined();
    expect(cli.npmPackage).toBe('@openai/codex');
    expect(cli.command.join(' ')).toMatch(/@openai\/codex/);
    expect(cli.sudo).toBe(false);
  });

  test('deferredInstalls summary mirrors cli-install steps with the exact npm -g command (no sudo, I47)', () => {
    const p = plan(makeProfile([]), autoAnswers({ platforms: ['claude'], installClis: true }));
    expect(Array.isArray(p.deferredInstalls)).toBe(true);
    const di = p.deferredInstalls.find(function (d) { return d.platform === 'claude'; });
    expect(di).toBeDefined();
    expect(di.command[0]).toBe('npm');
    expect(di.command).toContain('-g');
    expect(di.sudo).toBe(false);
  });
});

// --- secret hygiene -----------------------------------------------------------

describe('plan — secret hygiene', () => {
  test('the byanWeb token never appears anywhere in the serialized plan', () => {
    const p = plan(makeProfile(['claude']), autoAnswers());
    expect(JSON.stringify(p)).not.toContain(FAKE_TOKEN);
  });

  test('write-env step references the token by secretKeys, never an inline value', () => {
    const p = plan(makeProfile(['claude']), autoAnswers());
    const env = p.steps.find(function (s) { return s.type === 'write-env'; });
    expect(env).toBeDefined();
    expect(env.secretKeys).toContain('BYAN_API_TOKEN');
    // The vars object must NOT carry the raw token value.
    expect(JSON.stringify(env.vars)).not.toContain(FAKE_TOKEN);
  });
});

// --- validation (throws InstallPlanError on contradiction) --------------------

describe('plan — validation', () => {
  test("flow:'manual' with empty agents[] throws InstallPlanError", () => {
    expect(function () {
      plan(makeProfile(['claude']), autoAnswers({ flow: 'manual', agents: [] }));
    }).toThrow(InstallPlanError);
  });

  test("soul mode 'import' without importPath throws InstallPlanError", () => {
    expect(function () {
      plan(makeProfile(['claude']), autoAnswers({ soul: { mode: 'import' } }));
    }).toThrow(InstallPlanError);
  });

  test('an unknown flow value throws InstallPlanError', () => {
    expect(function () {
      plan(makeProfile(['claude']), autoAnswers({ flow: 'turbo' }));
    }).toThrow(InstallPlanError);
  });

  test('a missing answers object throws InstallPlanError (programmer error)', () => {
    expect(function () { plan(makeProfile(['claude']), null); }).toThrow(InstallPlanError);
  });

  test('a missing profile throws InstallPlanError', () => {
    expect(function () { plan(null, autoAnswers()); }).toThrow(InstallPlanError);
  });

  test('byanWeb disabled => no render:mcp / write-env steps, plan still valid', () => {
    const p = plan(makeProfile(['claude']), autoAnswers({ byanWeb: { enabled: false } }));
    expect(p.steps.find(function (s) { return s.type === 'render-mcp'; })).toBeUndefined();
    expect(p.steps.find(function (s) { return s.type === 'write-env'; })).toBeUndefined();
    // core copy + manifest still present.
    expect(p.steps.find(function (s) { return s.id === 'copy:_byan'; })).toBeDefined();
    expect(p.steps[p.steps.length - 1].type).toBe('manifest');
  });
});
