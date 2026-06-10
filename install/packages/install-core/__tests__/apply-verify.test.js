/**
 * apply.js + verify.js — the mutator and the read-only verifier.
 *
 * apply(plan, opts) is the ONLY mutator in install-core. verify(planOrTarget)
 * never writes and never spawns.
 *
 * Covers:
 *   C11 zero-sudo: no install command invokes sudo; per-user npm -g only.
 *   C12 AUTH handoff is explicit: signalled, never reported as a false success.
 *   C14 --install-cli claude|codex installs via npm -g; spawn mocked.
 *   C1  apply is the only mutator (detect/plan are pure); part of C6 (superset).
 *
 * All targets are under os.tmpdir(); the real repo is never touched.
 * The spawn runner is INJECTED (opts.run) so no real `npm install -g` ever runs.
 * The fake token is a SHAPE fixture only (MEMORY: feedback_no_real_tokens_in_tests).
 */

const path = require('path');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs-extra');
const childProcess = require('child_process');

const { apply, ApplyError } = require('../lib/apply');
const { verify, AUTO_ARTIFACT_SET } = require('../lib/verify');

// Shape-only fixture. NOT a real token: 'byan_' + 64 zeroes.
const FAKE_TOKEN = 'byan_' + '0'.repeat(64);
const TOKEN_REF = 'BYAN_API_TOKEN';

// A spy runner that records every spawn instead of executing it. Returns a
// success-shaped result so apply treats the install as done. The whole point:
// no test ever shells out to the network.
function makeRunner() {
  const calls = [];
  const run = (file, args, runOpts) => {
    calls.push({ file, args, opts: runOpts });
    return { status: 0, stdout: '', stderr: '' };
  };
  run.calls = calls;
  return run;
}

// Minimal hand-built InstallPlan matching the design installPlanSchema. apply
// consumes the plan SHAPE, not plan.js (which is built in parallel). Secret
// values are carried by reference key, resolved from opts.secrets at apply-time.
function buildPlan(overrides) {
  const base = {
    schemaVersion: 1,
    type: 'InstallPlan',
    planId: 'testplan0001',
    deterministic: true,
    flow: 'auto',
    targets: {
      platforms: ['claude'],
      byanWeb: { enabled: true, apiUrl: 'http://localhost:3737' },
    },
    answers: { flow: 'auto' },
    steps: [
      { id: 'mkdir:_byan', type: 'mkdir', dest: '_byan' },
      { id: 'mkdir:_byan/agent', type: 'mkdir', dest: '_byan/agent' },
      {
        id: 'write:config.yaml',
        type: 'write-file',
        dest: '_byan/bmb/config.yaml',
        format: 'yaml',
        data: {
          user_name: 'Yan',
          communication_language: 'fr',
          platform: 'claude',
          install_mode: 'auto',
          byan_version: '1.0.0',
          soul_mode: 'creator',
        },
      },
      {
        id: 'render:mcp',
        type: 'render-mcp',
        dest: '.mcp.json',
        apiUrl: 'http://localhost:3737',
      },
      {
        id: 'write:env',
        type: 'write-env',
        scope: 'project',
        vars: { BYAN_API_URL: 'http://localhost:3737', BYAN_API_TOKEN: '@secret:BYAN_API_TOKEN' },
        secretKeys: ['BYAN_API_TOKEN'],
      },
      {
        id: 'write:settings-local',
        type: 'write-settings-local',
        dest: '.claude/settings.local.json',
        env: { BYAN_API_TOKEN: '@secret:BYAN_API_TOKEN', BYAN_API_URL: 'http://localhost:3737' },
        secretKeys: ['BYAN_API_TOKEN'],
      },
      {
        id: 'auth-handoff:claude',
        type: 'auth-handoff',
        platform: 'claude',
        command: 'claude login',
        reason: 'interactive auth cannot be automated',
      },
      { id: 'manifest', type: 'manifest', dest: '_byan/.manifest.json' },
    ],
    authHandoffs: [{ platform: 'claude', command: 'claude login' }],
    deferredInstalls: [],
  };
  return Object.assign(base, overrides || {});
}

// A cli-install step for the npm-global path (C14). version is concrete so the
// asserted command is exact.
function cliInstallStep(platform, npmPackage, version) {
  return {
    id: 'cli-install:' + platform,
    type: 'cli-install',
    platform: platform,
    npmPackage: npmPackage,
    version: version,
    command: ['npm', 'install', '-g', npmPackage + '@' + version],
    global: true,
    sudo: false,
  };
}

describe('apply + verify (install-core)', () => {
  let tmpRoot;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-apply-verify-'));
  });

  afterEach(async () => {
    await fs.remove(tmpRoot);
    jest.restoreAllMocks();
  });

  describe('apply — happy path (C1 mutator, part of C6)', () => {
    test('creates declared dirs/files and verify(plan) returns ok:true', async () => {
      const plan = buildPlan();
      const result = await apply(plan, {
        cwd: tmpRoot,
        run: makeRunner(),
        secrets: { BYAN_API_TOKEN: FAKE_TOKEN },
      });

      expect(await fs.pathExists(path.join(tmpRoot, '_byan'))).toBe(true);
      expect(await fs.pathExists(path.join(tmpRoot, '_byan', 'agent'))).toBe(true);
      expect(await fs.pathExists(path.join(tmpRoot, '_byan', 'bmb', 'config.yaml'))).toBe(true);
      expect(await fs.pathExists(path.join(tmpRoot, '.mcp.json'))).toBe(true);
      expect(await fs.pathExists(path.join(tmpRoot, '.env'))).toBe(true);
      expect(
        await fs.pathExists(path.join(tmpRoot, '.claude', 'settings.local.json'))
      ).toBe(true);
      expect(await fs.pathExists(path.join(tmpRoot, '_byan', '.manifest.json'))).toBe(true);

      const report = await verify(plan, { cwd: tmpRoot });
      expect(report.ok).toBe(true);
      expect(report.missing).toEqual([]);
      expect(report.drift).toEqual([]);
    });

    test('every executed step has a typed StepResult with a known status', async () => {
      const plan = buildPlan();
      const result = await apply(plan, {
        cwd: tmpRoot,
        run: makeRunner(),
        secrets: { BYAN_API_TOKEN: FAKE_TOKEN },
      });
      const known = new Set(['done', 'skipped', 'deferred', 'failed']);
      result.results.forEach((r) => {
        expect(r).toHaveProperty('id');
        expect(r).toHaveProperty('type');
        expect(known.has(r.status)).toBe(true);
      });
      // The mutating steps landed.
      const byId = Object.fromEntries(result.results.map((r) => [r.id, r]));
      expect(byId['mkdir:_byan'].status).toBe('done');
      expect(byId['render:mcp'].status).toBe('done');
      expect(byId['write:env'].status).toBe('done');
      expect(byId['manifest'].status).toBe('done');
    });

    test('written .mcp.json is clean: BYAN_API_URL has no /api, no token key', async () => {
      const plan = buildPlan({
        steps: buildPlan().steps.map((s) =>
          s.id === 'render:mcp' ? { ...s, apiUrl: 'http://localhost:3737/api' } : s
        ),
      });
      await apply(plan, { cwd: tmpRoot, run: makeRunner(), secrets: { BYAN_API_TOKEN: FAKE_TOKEN } });
      const mcp = await fs.readJson(path.join(tmpRoot, '.mcp.json'));
      expect(mcp.mcpServers.byan.env.BYAN_API_URL).toBe('http://localhost:3737');
      expect(mcp.mcpServers.byan.env.BYAN_API_TOKEN).toBeUndefined();
    });

    test('config.yaml carries the v2.19 AUTO fields (install_mode, platform, byan_version, soul_mode)', async () => {
      const plan = buildPlan();
      await apply(plan, { cwd: tmpRoot, run: makeRunner(), secrets: { BYAN_API_TOKEN: FAKE_TOKEN } });
      const raw = await fs.readFile(path.join(tmpRoot, '_byan', 'bmb', 'config.yaml'), 'utf8');
      expect(raw).toMatch(/install_mode:\s*auto/);
      expect(raw).toMatch(/platform:\s*claude/);
      expect(raw).toMatch(/byan_version:\s*['"]?1\.0\.0/);
      expect(raw).toMatch(/soul_mode:\s*creator/);
    });
  });

  describe('apply — idempotence (re-run converges)', () => {
    test('re-apply on the same plan/cwd does not duplicate .env keys and keeps .mcp.json valid', async () => {
      const plan = buildPlan();
      const opts = { cwd: tmpRoot, run: makeRunner(), secrets: { BYAN_API_TOKEN: FAKE_TOKEN } };
      await apply(plan, opts);
      await apply(plan, { ...opts, run: makeRunner() });

      const env = await fs.readFile(path.join(tmpRoot, '.env'), 'utf8');
      expect(env.match(/BYAN_API_TOKEN=/g)).toHaveLength(1);
      expect(env.match(/BYAN_API_URL=/g)).toHaveLength(1);

      // Still a parseable, byan-bearing config after the second pass.
      const mcp = await fs.readJson(path.join(tmpRoot, '.mcp.json'));
      expect(mcp.mcpServers.byan).toBeDefined();

      // Second verify still green.
      const report = await verify(plan, { cwd: tmpRoot });
      expect(report.ok).toBe(true);
    });
  });

  describe('apply — dryRun writes nothing (C1 purity boundary)', () => {
    test('dryRun:true creates no files but returns full results with intended status', async () => {
      const plan = buildPlan();
      const before = await fs.readdir(tmpRoot);
      const result = await apply(plan, {
        cwd: tmpRoot,
        dryRun: true,
        run: makeRunner(),
        secrets: { BYAN_API_TOKEN: FAKE_TOKEN },
      });
      const after = await fs.readdir(tmpRoot);
      expect(after).toEqual(before); // nothing written
      expect(await fs.pathExists(path.join(tmpRoot, '.mcp.json'))).toBe(false);
      expect(await fs.pathExists(path.join(tmpRoot, '_byan'))).toBe(false);

      // Results still describe what WOULD happen.
      expect(result.results.length).toBe(plan.steps.length);
      const byId = Object.fromEntries(result.results.map((r) => [r.id, r]));
      expect(byId['render:mcp'].status).toBe('skipped');
      expect(byId['render:mcp'].detail).toMatch(/dry/i);
    });
  });

  describe('apply — AUTH handoff is deferred, never faked (C12)', () => {
    test('auth-handoff step returns status:deferred with the command; no login is ever spawned', async () => {
      const run = makeRunner();
      const execSpy = jest.spyOn(childProcess, 'execFileSync');
      const plan = buildPlan();
      const result = await apply(plan, { cwd: tmpRoot, run, secrets: { BYAN_API_TOKEN: FAKE_TOKEN } });

      const authResult = result.results.find((r) => r.id === 'auth-handoff:claude');
      expect(authResult.status).toBe('deferred');
      expect(authResult.detail).toMatch(/claude login/);

      // Surfaced for the frontal to present — never executed.
      expect(result.authHandoffs).toEqual([
        expect.objectContaining({ platform: 'claude', command: 'claude login' }),
      ]);

      // No spawn of 'claude login' through EITHER channel.
      const loginViaRunner = run.calls.some(
        (c) => /claude/.test(c.file) || (c.args || []).some((a) => /login/.test(a))
      );
      expect(loginViaRunner).toBe(false);
      const loginViaExec = execSpy.mock.calls.some(
        (c) => /claude/.test(String(c[0])) || (c[1] || []).some((a) => /login/.test(String(a)))
      );
      expect(loginViaExec).toBe(false);
    });
  });

  describe('apply — cli-install (C14, C11 zero-sudo)', () => {
    test('runInstalls:true spawns "npm install -g <pkg>" via injected runner, NO sudo', async () => {
      const run = makeRunner();
      const plan = buildPlan({
        steps: [
          ...buildPlan().steps,
          cliInstallStep('claude', '@anthropic-ai/claude-code', '^2.1.114'),
        ],
        deferredInstalls: [],
      });
      const result = await apply(plan, {
        cwd: tmpRoot,
        runInstalls: true,
        run,
        secrets: { BYAN_API_TOKEN: FAKE_TOKEN },
      });

      // Exactly one install spawn, and it is npm -g for the claude package.
      const installCalls = run.calls.filter((c) => /npm/.test(c.file) || c.args[0] === 'install');
      expect(installCalls.length).toBe(1);
      const call = installCalls[0];
      // npm is the file; args are install -g <pkg@version>.
      const flat = [call.file, ...call.args].join(' ');
      expect(flat).toMatch(/npm/);
      expect(flat).toMatch(/install/);
      expect(flat).toMatch(/-g/);
      expect(flat).toMatch(/@anthropic-ai\/claude-code@\^2\.1\.114/);

      // C11: never sudo, in file OR any arg.
      expect(call.file).not.toMatch(/sudo/);
      expect(flat).not.toMatch(/sudo/);

      const cliResult = result.results.find((r) => r.id === 'cli-install:claude');
      expect(cliResult.status).toBe('done');
    });

    test('--install-cli claude vs codex spawn the right npm package', async () => {
      const runClaude = makeRunner();
      const planClaude = buildPlan({
        steps: [...buildPlan().steps, cliInstallStep('claude', '@anthropic-ai/claude-code', '^2.1.114')],
      });
      await apply(planClaude, { cwd: tmpRoot, runInstalls: true, run: runClaude, secrets: { BYAN_API_TOKEN: FAKE_TOKEN } });
      const claudeFlat = runClaude.calls.map((c) => [c.file, ...c.args].join(' ')).join('|');
      expect(claudeFlat).toMatch(/@anthropic-ai\/claude-code/);
      expect(claudeFlat).not.toMatch(/@openai\/codex/);

      const tmp2 = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-apply-codex-'));
      try {
        const runCodex = makeRunner();
        const planCodex = buildPlan({
          steps: [...buildPlan().steps, cliInstallStep('codex', '@openai/codex', 'latest')],
        });
        await apply(planCodex, { cwd: tmp2, runInstalls: true, run: runCodex, secrets: { BYAN_API_TOKEN: FAKE_TOKEN } });
        const codexFlat = runCodex.calls.map((c) => [c.file, ...c.args].join(' ')).join('|');
        expect(codexFlat).toMatch(/@openai\/codex/);
        expect(codexFlat).not.toMatch(/@anthropic-ai\/claude-code/);
      } finally {
        await fs.remove(tmp2);
      }
    });

    test('runInstalls:false defers the cli-install with the exact npm -g command and sudo:false', async () => {
      const run = makeRunner();
      const plan = buildPlan({
        steps: [...buildPlan().steps, cliInstallStep('claude', '@anthropic-ai/claude-code', '^2.1.114')],
      });
      const result = await apply(plan, {
        cwd: tmpRoot,
        runInstalls: false,
        run,
        secrets: { BYAN_API_TOKEN: FAKE_TOKEN },
      });

      const cliResult = result.results.find((r) => r.id === 'cli-install:claude');
      expect(cliResult.status).toBe('deferred');

      // No install was actually spawned.
      const installCalls = run.calls.filter((c) => c.args[0] === 'install' || /npm/.test(c.file));
      expect(installCalls.length).toBe(0);

      // The deferred install carries the EXACT command and sudo:false (C11).
      const deferred = result.deferredInstalls.find((d) => d.platform === 'claude');
      expect(deferred.command).toEqual(['npm', 'install', '-g', '@anthropic-ai/claude-code@^2.1.114']);
      expect(deferred.sudo).toBe(false);
      expect(deferred.global).toBe(true);
    });
  });

  describe('apply — manifest ledger + secret hygiene', () => {
    test('_byan/.manifest.json is written last with SHA-256 entries', async () => {
      const plan = buildPlan();
      await apply(plan, { cwd: tmpRoot, run: makeRunner(), secrets: { BYAN_API_TOKEN: FAKE_TOKEN } });
      const manifest = await fs.readJson(path.join(tmpRoot, '_byan', '.manifest.json'));
      // A hash ledger: keys are relative paths, values carry a sha256.
      const entries = manifest.files || manifest.entries || manifest;
      const flat = JSON.stringify(entries);
      // At least one tracked artifact with a 64-hex sha256.
      expect(flat).toMatch(/[a-f0-9]{64}/);
    });

    test('the secret token is written to .env but never appears in the ApplyResult', async () => {
      const plan = buildPlan();
      const result = await apply(plan, {
        cwd: tmpRoot,
        run: makeRunner(),
        secrets: { BYAN_API_TOKEN: FAKE_TOKEN },
      });
      // Landed in .env.
      const env = await fs.readFile(path.join(tmpRoot, '.env'), 'utf8');
      expect(env).toMatch(/BYAN_API_TOKEN=byan_0{64}/);
      // But never leaked into the returned result object.
      expect(JSON.stringify(result)).not.toContain(FAKE_TOKEN);
    });

    test('the secret reference is never written verbatim into config-bearing files', async () => {
      const plan = buildPlan();
      await apply(plan, { cwd: tmpRoot, run: makeRunner(), secrets: { BYAN_API_TOKEN: FAKE_TOKEN } });
      // The reference token '@secret:...' must be resolved, not written literally.
      const env = await fs.readFile(path.join(tmpRoot, '.env'), 'utf8');
      expect(env).not.toMatch(/@secret:/);
    });
  });

  describe('verify — read-only report (C1 boundary)', () => {
    test('verify(plan) flags a missing artifact after a tracked file is deleted', async () => {
      const plan = buildPlan();
      await apply(plan, { cwd: tmpRoot, run: makeRunner(), secrets: { BYAN_API_TOKEN: FAKE_TOKEN } });

      await fs.remove(path.join(tmpRoot, '.mcp.json'));
      const report = await verify(plan, { cwd: tmpRoot });
      expect(report.ok).toBe(false);
      expect(report.missing).toContain('.mcp.json');
    });

    test('verify reports drift when a manifest-tracked file is mutated post-apply', async () => {
      const plan = buildPlan();
      await apply(plan, { cwd: tmpRoot, run: makeRunner(), secrets: { BYAN_API_TOKEN: FAKE_TOKEN } });

      // Tamper with a tracked artifact (config.yaml is in the manifest ledger).
      await fs.appendFile(path.join(tmpRoot, '_byan', 'bmb', 'config.yaml'), '\n# tampered\n');
      const report = await verify(plan, { cwd: tmpRoot });
      expect(report.ok).toBe(false);
      expect(report.drift.some((d) => /config\.yaml/.test(d))).toBe(true);
    });

    test('verify({cwd}) target form checks the AUTO_ARTIFACT_SET and lists missing paths', async () => {
      // Fresh empty dir: nothing exists, so the AUTO set is all missing.
      const report = await verify({ cwd: tmpRoot });
      expect(report.ok).toBe(false);
      expect(report.missing.length).toBeGreaterThan(0);
      // Every missing entry is from the known AUTO identity set.
      report.missing.forEach((m) => {
        expect(AUTO_ARTIFACT_SET.includes(m)).toBe(true);
      });
    });

    test('verify flags drift on a .mcp.json containing a /api suffix in BYAN_API_URL', async () => {
      const plan = buildPlan();
      await apply(plan, { cwd: tmpRoot, run: makeRunner(), secrets: { BYAN_API_TOKEN: FAKE_TOKEN } });
      // Corrupt the url with an /api suffix (the thing render strips).
      const mcpPath = path.join(tmpRoot, '.mcp.json');
      const mcp = await fs.readJson(mcpPath);
      mcp.mcpServers.byan.env.BYAN_API_URL = 'http://localhost:3737/api';
      await fs.writeJson(mcpPath, mcp);

      const report = await verify(plan, { cwd: tmpRoot });
      expect(report.ok).toBe(false);
      expect(report.drift.some((d) => /api|url/i.test(d))).toBe(true);
    });

    test('verify flags drift on a .mcp.json containing a raw token', async () => {
      const plan = buildPlan();
      await apply(plan, { cwd: tmpRoot, run: makeRunner(), secrets: { BYAN_API_TOKEN: FAKE_TOKEN } });
      const mcpPath = path.join(tmpRoot, '.mcp.json');
      const mcp = await fs.readJson(mcpPath);
      mcp.mcpServers.byan.env.BYAN_API_TOKEN = FAKE_TOKEN; // never allowed in .mcp.json
      await fs.writeJson(mcpPath, mcp);

      const report = await verify(plan, { cwd: tmpRoot });
      expect(report.ok).toBe(false);
      expect(report.drift.some((d) => /token/i.test(d))).toBe(true);
    });

    test('verify never writes and never spawns', async () => {
      const plan = buildPlan();
      await apply(plan, { cwd: tmpRoot, run: makeRunner(), secrets: { BYAN_API_TOKEN: FAKE_TOKEN } });

      const execSpy = jest.spyOn(childProcess, 'execFileSync');
      const before = JSON.stringify((await walk(tmpRoot)).sort());
      await verify(plan, { cwd: tmpRoot });
      const after = JSON.stringify((await walk(tmpRoot)).sort());
      expect(after).toBe(before); // no write
      expect(execSpy).not.toHaveBeenCalled(); // no spawn
    });
  });

  describe('apply — programmer-error guards', () => {
    test('throws ApplyError on a missing plan', async () => {
      await expect(apply(null, { cwd: tmpRoot })).rejects.toThrow(ApplyError);
    });

    test('throws ApplyError on a plan with a non-array steps', async () => {
      await expect(apply({ steps: 'nope' }, { cwd: tmpRoot })).rejects.toThrow(ApplyError);
    });

    test('a failed step is recorded as status:failed, not thrown, when continueOnError', async () => {
      // render-mcp with a garbage url cannot validate -> the step fails.
      const plan = buildPlan({
        steps: [
          { id: 'mkdir:_byan', type: 'mkdir', dest: '_byan' },
          { id: 'render:mcp', type: 'render-mcp', dest: '.mcp.json', apiUrl: 'not a url' },
        ],
        authHandoffs: [],
      });
      const result = await apply(plan, {
        cwd: tmpRoot,
        run: makeRunner(),
        continueOnError: true,
        secrets: {},
      });
      const r = result.results.find((s) => s.id === 'render:mcp');
      expect(r.status).toBe('failed');
      // mkdir before it still succeeded.
      expect(result.results.find((s) => s.id === 'mkdir:_byan').status).toBe('done');
    });
  });
});

// Recursively list relative file paths under a dir (for the no-write assertion).
async function walk(root) {
  const out = [];
  async function rec(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await rec(full);
      } else {
        out.push(path.relative(root, full));
      }
    }
  }
  await rec(root);
  return out;
}
