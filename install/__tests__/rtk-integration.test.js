'use strict';

/**
 * rtk-integration.js + native-helper.js
 *
 * RTK install/wiring is exercised entirely through an INJECTED command runner +
 * PATH probe + binary resolver — no test ever shells out, installs a binary, or
 * touches the user machine. The invariants under test:
 *   - delegation: BYAN runs rtk's OWN installer (brew/script/cargo) + `rtk init -g --auto-patch`
 *   - fail-proof: the install runs BOUNDED (timeout) + VISIBLE (stdio inherit);
 *     a missing installer / failed / timed-out step is a no-op, ok stays true
 *   - off-PATH safe: an install that lands off PATH is RESOLVED, verified, wired
 *     by its real path, and reported with a pathHint (the cargo ~/.cargo/bin case)
 *   - idempotent: an already-present rtk still (re)wires the hook
 *   - Codex target: installs/verifies the native binary without pretending there
 *     is a transparent Codex hook
 *   - never breaks BYAN: setupRtkIntegration NEVER throws and ok===true always
 */

const os = require('os');
const {
  setupRtkIntegration,
  rtkStatus,
  locateRtk,
  pickStrategy,
  installStrategies,
  timeoutFor,
  isTimeout,
  pathHintFor,
  normalizeTargetPlatforms,
  doctor,
  shouldOfferRtk,
  RTK_VERSION,
  RTK_TIMEOUT_MS,
  RTK_DEFAULT_TIMEOUT_MS,
} = require('../lib/rtk-integration');
const {
  commandExists,
  detectPlatform,
  firstAvailable,
  knownBinDirs,
  resolveBinary,
  safeHomedir,
} = require('../lib/native-helper');

// A stateful fake runner. rtk is "not installed" until an install command runs,
// then `rtk --version` reports VERSION_OUT. Each command can be forced to throw.
// Records (cmd, opts) so tests can assert HOW a command was run (stdio/timeout).
function makeRun(opts = {}) {
  const o = {
    installed: false,
    versionOut: 'rtk 0.42.4',
    installSucceeds: true,
    initSucceeds: true,
    versionUnverified: false, // install "runs" but rtk --version still fails after
    installTimesOut: false, // install throws a timeout-shaped error (we killed it)
    ...opts,
  };
  const calls = [];
  const invocations = [];
  const run = (cmd, runOpts) => {
    calls.push(cmd);
    invocations.push({ cmd, opts: runOpts });
    if (/--version/.test(cmd)) {
      if (!o.installed) throw new Error('rtk: command not found');
      return Buffer.from(o.versionOut);
    }
    if (/install/.test(cmd) && /(brew|cargo|install\.sh)/.test(cmd)) {
      if (o.installTimesOut) throw Object.assign(new Error('timed out'), { killed: true, signal: 'SIGTERM' });
      if (!o.installSucceeds) throw new Error('install failed');
      if (!o.versionUnverified) o.installed = true;
      return Buffer.from('');
    }
    if (/init -g/.test(cmd)) {
      if (!o.initSucceeds) throw new Error('rtk init failed');
      return Buffer.from('');
    }
    return Buffer.from('');
  };
  run.calls = calls;
  run.invocations = invocations;
  run.optsFor = (re) => (invocations.find((i) => re.test(i.cmd)) || {}).opts;
  return run;
}

// A PATH probe that only knows about the tools in `present`.
const hasFrom = (present) => (tool) => present.includes(tool);

// setupRtkIntegration with resolve stubbed to "not found off PATH" by default, so
// no test reaches the real filesystem. Tests that exercise the off-PATH path pass
// their own `resolve`.
const setup = (opts = {}) => setupRtkIntegration({ resolve: () => null, ...opts });

describe('native-helper', () => {
  test('commandExists: true when the probe succeeds, false when it throws', () => {
    const ok = () => Buffer.from('');
    const ko = () => { throw new Error('not found'); };
    expect(commandExists('brew', { run: ok })).toBe(true);
    expect(commandExists('brew', { run: ko })).toBe(false);
  });

  test('commandExists: uses `where` on win32, `command -v` elsewhere', () => {
    const seen = [];
    const run = (c) => { seen.push(c); return Buffer.from(''); };
    commandExists('rtk', { run, platform: 'win32' });
    commandExists('rtk', { run, platform: 'linux' });
    expect(seen[0]).toMatch(/^where rtk/);
    expect(seen[1]).toMatch(/^command -v rtk/);
  });

  test('detectPlatform buckets darwin/win32/other', () => {
    expect(detectPlatform('darwin')).toBe('mac');
    expect(detectPlatform('win32')).toBe('windows');
    expect(detectPlatform('linux')).toBe('linux');
  });

  test('firstAvailable returns the first candidate whose tool is on PATH, else null', () => {
    const cands = [{ id: 'a', tool: 'brew' }, { id: 'b', tool: 'cargo' }];
    expect(firstAvailable(cands, { has: hasFrom(['cargo']) }).id).toBe('b');
    expect(firstAvailable(cands, { has: hasFrom([]) })).toBeNull();
  });
});

describe('native-helper — resolveBinary (off-PATH location)', () => {
  test('on PATH: returns the bare name (let the shell resolve it)', () => {
    expect(resolveBinary('rtk', { has: hasFrom(['rtk']) })).toBe('rtk');
  });

  test('off PATH: returns the absolute path from ~/.cargo/bin (the cargo case)', () => {
    const home = '/home/u';
    const exists = (p) => p === '/home/u/.cargo/bin/rtk';
    expect(resolveBinary('rtk', { has: hasFrom([]), existsSync: exists, home, platform: 'linux', env: {} }))
      .toBe('/home/u/.cargo/bin/rtk');
  });

  test('off PATH: honors CARGO_HOME ahead of the default ~/.cargo/bin', () => {
    const exists = (p) => p === '/custom/cargo/bin/rtk';
    expect(resolveBinary('rtk', { has: hasFrom([]), existsSync: exists, home: '/home/u', platform: 'linux', env: { CARGO_HOME: '/custom/cargo' } }))
      .toBe('/custom/cargo/bin/rtk');
  });

  test('not found anywhere: null (never throws on a stat error)', () => {
    const exists = () => { throw new Error('EACCES'); };
    expect(resolveBinary('rtk', { has: hasFrom([]), existsSync: exists, home: '/home/u', platform: 'linux', env: {} })).toBeNull();
  });

  test('win32: probes the .exe name', () => {
    const seen = [];
    const exists = (p) => { seen.push(p); return false; };
    resolveBinary('rtk', { has: hasFrom([]), existsSync: exists, home: 'C:\\Users\\u', platform: 'win32', env: {} });
    expect(seen.some((p) => /rtk\.exe$/.test(p))).toBe(true);
  });

  test('knownBinDirs includes ~/.cargo/bin and puts CARGO_HOME first', () => {
    const dirs = knownBinDirs({ env: { CARGO_HOME: '/c' }, home: '/home/u', platform: 'linux' });
    expect(dirs[0]).toBe('/c/bin');
    expect(dirs).toContain('/home/u/.cargo/bin');
  });

  test('a throwing os.homedir() never propagates (C1: never-throws contract)', () => {
    const real = os.homedir;
    os.homedir = () => { throw Object.assign(new Error('EINVAL'), { code: 'EINVAL' }); };
    try {
      expect(safeHomedir()).toBe(''); // degrades, does not throw
      // the default-param path (no `home` passed) must not throw either
      expect(() => knownBinDirs({ env: {}, platform: 'linux' })).not.toThrow();
      expect(() => resolveBinary('rtk', { has: hasFrom([]), existsSync: () => false, env: {}, platform: 'linux' })).not.toThrow();
    } finally {
      os.homedir = real;
    }
  });
});

describe('rtk-integration — strategy selection', () => {
  test('install strategies are ordered brew > script > cargo and delegate to rtk', () => {
    const ids = installStrategies().map((s) => s.id);
    // script BEFORE cargo: prefer the prebuilt binary over a from-source compile.
    expect(ids).toEqual(['brew', 'script', 'cargo']);
    const byId = Object.fromEntries(installStrategies().map((s) => [s.id, s.cmd]));
    expect(byId.brew).toBe('brew install rtk');
    // cargo + script are PINNED to the tag (supply-chain: no moving branch).
    expect(byId.cargo).toMatch(/^cargo install --git https:\/\/github\.com\/rtk-ai\/rtk --tag v0\.42\.4$/);
    expect(byId.script).toMatch(/^curl -fsSL .*refs\/tags\/v0\.42\.4\/install\.sh \| RTK_VERSION=v0\.42\.4 sh$/);
  });

  test('every strategy carries a positive timeout budget', () => {
    for (const s of installStrategies()) {
      expect(typeof s.timeoutMs).toBe('number');
      expect(s.timeoutMs).toBeGreaterThan(0);
    }
    // cargo compiles from source -> it gets the widest budget.
    expect(RTK_TIMEOUT_MS.cargo).toBeGreaterThan(RTK_TIMEOUT_MS.script);
  });

  test('pickStrategy honors PATH availability and preference order', () => {
    expect(pickStrategy({ has: hasFrom(['brew', 'cargo', 'curl']) }).id).toBe('brew');
    // curl present + cargo present -> script wins (prebuilt preferred over compile).
    expect(pickStrategy({ has: hasFrom(['cargo', 'curl']) }).id).toBe('script');
    expect(pickStrategy({ has: hasFrom(['cargo']) }).id).toBe('cargo');
    expect(pickStrategy({ has: hasFrom(['curl']) }).id).toBe('script');
    expect(pickStrategy({ has: hasFrom([]) })).toBeNull();
  });
});

describe('rtk-integration — timeoutFor (F1 bound + override)', () => {
  test('defaults to the strategy budget', () => {
    const cargo = installStrategies().find((s) => s.id === 'cargo');
    expect(timeoutFor(cargo, { env: {} })).toBe(RTK_TIMEOUT_MS.cargo);
  });

  test('BYAN_RTK_TIMEOUT_MS overrides when it is a clean integer', () => {
    const cargo = installStrategies().find((s) => s.id === 'cargo');
    expect(timeoutFor(cargo, { env: { BYAN_RTK_TIMEOUT_MS: '1234' } })).toBe(1234);
    // a junk override is ignored (falls back to the strategy budget).
    expect(timeoutFor(cargo, { env: { BYAN_RTK_TIMEOUT_MS: 'soon' } })).toBe(RTK_TIMEOUT_MS.cargo);
  });

  test('a 0 override is REJECTED (timeout:0 = no timeout) and falls back (C2/SEC-1)', () => {
    const cargo = installStrategies().find((s) => s.id === 'cargo');
    expect(timeoutFor(cargo, { env: { BYAN_RTK_TIMEOUT_MS: '0' } })).toBe(RTK_TIMEOUT_MS.cargo);
  });

  test('a strategy with no budget falls back to RTK_DEFAULT_TIMEOUT_MS (Q3)', () => {
    expect(timeoutFor({ id: 'x' }, { env: {} })).toBe(RTK_DEFAULT_TIMEOUT_MS);
  });
});

describe('rtk-integration — isTimeout (C3: kill vs build failure)', () => {
  test('true when Node killed the child on timeout (killed) or marked ETIMEDOUT', () => {
    expect(isTimeout({ killed: true, signal: 'SIGTERM' })).toBe(true);
    expect(isTimeout({ code: 'ETIMEDOUT' })).toBe(true);
  });

  test('false for a normal non-zero-exit build failure', () => {
    expect(isTimeout({ status: 101, signal: null })).toBe(false);
    expect(isTimeout(new Error('boom'))).toBe(false);
  });

  test('false for a bare SIGTERM we did not cause (no false-positive timeout)', () => {
    expect(isTimeout({ signal: 'SIGTERM', killed: false })).toBe(false);
  });
});

describe('rtk-integration — pathHintFor (H1/C5: shell + platform aware)', () => {
  test('fish: emits fish_add_path (not POSIX export)', () => {
    expect(pathHintFor('/home/u/.cargo/bin/rtk', { env: { SHELL: '/usr/bin/fish' }, platform: 'linux' }))
      .toBe('fish_add_path /home/u/.cargo/bin');
  });

  test('bash/zsh: emits POSIX export', () => {
    expect(pathHintFor('/home/u/.cargo/bin/rtk', { env: { SHELL: '/bin/zsh' }, platform: 'linux' }))
      .toBe('export PATH="/home/u/.cargo/bin:$PATH"');
  });

  test('windows: emits a PowerShell assignment with the win32-parsed dir, not POSIX export', () => {
    const hint = pathHintFor('C:\\Users\\u\\.cargo\\bin\\rtk.exe', { env: {}, platform: 'win32' });
    // dir must be parsed with win32 rules even on a POSIX test host.
    expect(hint).toBe('$env:PATH = "C:\\Users\\u\\.cargo\\bin;$env:PATH"');
    expect(hint).not.toContain('export PATH');
  });
});

describe('rtk-integration — setupRtkIntegration', () => {
  test('no installer available: graceful no-op, ok stays true', () => {
    const run = makeRun();
    const r = setup({ run, has: hasFrom([]) });
    expect(r.ok).toBe(true);
    expect(r.synced).toBe(false);
    expect(r.reason).toBe('no-installer');
    expect(r.installed).toBe(false);
    // No install was attempted.
    expect(run.calls.some((c) => /brew|cargo|install\.sh/.test(c))).toBe(false);
  });

  test('brew present: installs via brew, verifies, wires hook via `rtk init -g`', () => {
    const run = makeRun();
    const r = setup({ run, has: hasFrom(['brew', 'curl']) });
    expect(r).toMatchObject({ ok: true, synced: true, reason: 'wired', installedVia: 'brew', version: '0.42.4', hook: true });
    expect(run.calls).toContain('brew install rtk');
    expect(run.calls).toContain('rtk init -g --auto-patch');
    // brew was preferred even though curl was also present.
    expect(run.calls.some((c) => /install\.sh/.test(c))).toBe(false);
  });

  test('install command runs VISIBLE (stdio inherit) + BOUNDED (timeout); version probe stays piped', () => {
    const run = makeRun();
    setup({ run, has: hasFrom(['brew']) });
    const installOpts = run.optsFor(/brew install rtk/);
    expect(installOpts).toMatchObject({ stdio: 'inherit' });
    expect(typeof installOpts.timeout).toBe('number');
    expect(installOpts.timeout).toBeGreaterThan(0);
    // the version probe must stay piped (we parse its output).
    expect(run.optsFor(/--version/)).toMatchObject({ stdio: 'pipe' });
  });

  test('install exceeds the timeout: graceful, reason names install-timeout:<strategy>', () => {
    const run = makeRun({ installTimesOut: true });
    const r = setup({ run, has: hasFrom(['cargo']) });
    expect(r.ok).toBe(true);
    expect(r.synced).toBe(false);
    expect(r.reason).toBe('install-timeout:cargo');
    expect(r.installed).toBe(false);
  });

  test('curl present (no brew): falls back to the official install.sh script', () => {
    const run = makeRun();
    const r = setup({ run, has: hasFrom(['curl']) });
    expect(r.installedVia).toBe('script');
    expect(r.synced).toBe(true);
    expect(run.calls.some((c) => /install\.sh \| RTK_VERSION=v0\.42\.4 sh$/.test(c))).toBe(true);
  });

  test('off-PATH install (cargo -> ~/.cargo/bin): resolved, verified + wired by real path, pathHint set', () => {
    const abs = '/home/u/.cargo/bin/rtk';
    let installed = false;
    const run = (cmd, _o) => {
      if (/cargo install/.test(cmd)) { installed = true; return Buffer.from(''); }
      if (cmd === 'rtk --version') throw new Error('not on PATH'); // bare probe fails
      if (cmd === `${abs} --version`) {
        if (!installed) throw new Error('not yet');
        return Buffer.from('rtk 0.42.4');
      }
      if (cmd === `${abs} init -g --auto-patch`) return Buffer.from('');
      return Buffer.from('');
    };
    const r = setupRtkIntegration({ run, has: hasFrom(['cargo']), resolve: () => abs, env: { SHELL: '/bin/bash' }, platform: 'linux' });
    expect(r).toMatchObject({ ok: true, synced: true, reason: 'wired', installedVia: 'cargo', bin: abs, hook: true });
    expect(r.pathHint).toBe('export PATH="/home/u/.cargo/bin:$PATH"');
  });

  test('already present OFF PATH: skips install, wires via resolved path with a pathHint', () => {
    const abs = '/home/u/.cargo/bin/rtk';
    const run = (cmd) => {
      if (cmd === 'rtk --version') throw new Error('not on PATH');
      if (cmd === `${abs} --version`) return Buffer.from('rtk 0.42.4');
      if (cmd === `${abs} init -g --auto-patch`) return Buffer.from('');
      throw new Error(`unexpected ${cmd}`); // no install command may run
    };
    const r = setupRtkIntegration({ run, has: hasFrom(['cargo']), resolve: () => abs, env: { SHELL: '/bin/bash' }, platform: 'linux' });
    expect(r).toMatchObject({ ok: true, synced: true, installedVia: 'already-present', bin: abs, hook: true });
    expect(r.pathHint).toBe('export PATH="/home/u/.cargo/bin:$PATH"');
  });

  test('already installed (on PATH): skips install, still (re)wires the hook idempotently', () => {
    const run = makeRun({ installed: true });
    const r = setup({ run, has: hasFrom(['brew']) });
    expect(r.installedVia).toBe('already-present');
    expect(r.synced).toBe(true);
    expect(r.hook).toBe(true);
    expect(r.pathHint).toBeUndefined();
    expect(run.calls.some((c) => /brew install/.test(c))).toBe(false); // no reinstall
    expect(run.calls).toContain('rtk init -g --auto-patch');
  });

  test('Codex-only target: already installed binary is ready without Claude hook wiring', () => {
    const run = makeRun({ installed: true });
    const r = setup({ run, has: hasFrom(['brew']), targetPlatforms: ['codex'] });
    expect(r).toMatchObject({
      ok: true,
      synced: true,
      reason: 'codex-binary-ready',
      installedVia: 'already-present',
      codexReady: true,
      claudeHook: false,
      hook: false,
    });
    expect(run.calls.some((c) => /brew install/.test(c))).toBe(false);
    expect(run.calls).not.toContain('rtk init -g --auto-patch');
  });

  test('Codex-only target: installs via available strategy, verifies binary, and does not run Claude hook init', () => {
    const run = makeRun();
    const r = setup({ run, has: hasFrom(['brew']), targetPlatforms: ['codex'] });
    expect(r).toMatchObject({
      ok: true,
      synced: true,
      reason: 'codex-binary-ready',
      installedVia: 'brew',
      codexReady: true,
      claudeHook: false,
      hook: false,
    });
    expect(run.calls).toContain('brew install rtk');
    expect(run.calls).not.toContain('rtk init -g --auto-patch');
  });

  test('Claude+Codex target: wires Claude hook and marks Codex binary ready', () => {
    const run = makeRun({ installed: true });
    const r = setup({ run, has: hasFrom(['brew']), targetPlatforms: ['claude', 'codex'] });
    expect(r).toMatchObject({
      ok: true,
      synced: true,
      reason: 'wired+codex-binary-ready',
      installedVia: 'already-present',
      codexReady: true,
      claudeHook: true,
      hook: true,
    });
    expect(run.calls).toContain('rtk init -g --auto-patch');
  });

  test('install command fails: graceful, ok true, reason names the strategy', () => {
    const run = makeRun({ installSucceeds: false });
    const r = setup({ run, has: hasFrom(['brew']) });
    expect(r.ok).toBe(true);
    expect(r.synced).toBe(false);
    expect(r.reason).toBe('install-failed:brew');
    expect(r.installed).toBe(false);
  });

  test('install runs but version cannot be verified anywhere: install-unverified', () => {
    const run = makeRun({ versionUnverified: true });
    const r = setup({ run, has: hasFrom(['cargo']) }); // resolve stub -> null
    expect(r.ok).toBe(true);
    expect(r.synced).toBe(false);
    expect(r.reason).toBe('install-unverified');
  });

  test('a THROWING resolver never breaks the contract (C1/ROBUST-1: degrades to not-found)', () => {
    const run = makeRun();
    const boom = () => { throw Object.assign(new Error('EINVAL'), { code: 'EINVAL' }); };
    let r;
    expect(() => { r = setupRtkIntegration({ run, has: hasFrom([]), resolve: boom }); }).not.toThrow();
    expect(r.ok).toBe(true);
    expect(r.reason).toBe('no-installer'); // resolve threw -> before=not-found -> no installer
  });

  test('hook wiring fails after a good install: hook-failed but still ok', () => {
    const run = makeRun({ initSucceeds: false });
    const r = setup({ run, has: hasFrom(['brew']) });
    expect(r.ok).toBe(true);
    expect(r.synced).toBe(false);
    expect(r.reason).toBe('hook-failed');
    expect(r.installed).toBe(true);
    expect(r.hook).toBe(false);
  });

  test('setupRtkIntegration NEVER throws and ok===true across every path', () => {
    const scenarios = [
      makeRun(),
      makeRun({ installed: true }),
      makeRun({ installSucceeds: false }),
      makeRun({ initSucceeds: false }),
      makeRun({ versionUnverified: true }),
      makeRun({ installTimesOut: true }),
    ];
    const probes = [hasFrom([]), hasFrom(['brew']), hasFrom(['cargo']), hasFrom(['curl'])];
    for (const run of scenarios) {
      for (const has of probes) {
        let r;
        expect(() => { r = setup({ run, has }); }).not.toThrow();
        expect(r.ok).toBe(true);
      }
    }
  });

  test('a one-line log breadcrumb is emitted (never the raw multi-line error)', () => {
    const logs = [];
    setup({ run: makeRun({ installSucceeds: false }), has: hasFrom(['brew']), log: (m) => logs.push(m) });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => !l.includes('\n'))).toBe(true);
  });
});

describe('rtk-integration — status + doctor', () => {
  test('rtkStatus parses the version when present, reports absent otherwise', () => {
    expect(rtkStatus({ run: makeRun({ installed: true }) })).toMatchObject({ installed: true, version: '0.42.4' });
    expect(rtkStatus({ run: makeRun({ installed: false }) })).toMatchObject({ installed: false, version: null });
  });

  test('locateRtk falls back to the resolved off-PATH binary', () => {
    const abs = '/home/u/.cargo/bin/rtk';
    const run = (cmd) => {
      if (cmd === 'rtk --version') throw new Error('not on PATH');
      if (cmd === `${abs} --version`) return Buffer.from('rtk 0.42.4');
      return Buffer.from('');
    };
    expect(locateRtk({ run, has: hasFrom([]), resolve: () => abs })).toMatchObject({ installed: true, version: '0.42.4', bin: abs });
  });

  test('doctor reports the component status + the pinned floor + hook command', () => {
    const d = doctor({ run: makeRun({ installed: true }), resolve: () => 'rtk' });
    expect(d).toMatchObject({ component: 'rtk', installed: true, version: '0.42.4', pinned: RTK_VERSION, hookCommand: 'rtk init -g --auto-patch' });
  });
});

describe('rtk-integration — target platform normalization', () => {
  test('defaults to Claude to preserve npm run setup-rtk behavior', () => {
    expect([...normalizeTargetPlatforms()]).toEqual(['claude']);
  });

  test('accepts aliases and filters unknown values', () => {
    expect([...normalizeTargetPlatforms(['claude-code', 'codex', 'unknown'])].sort()).toEqual(['claude', 'codex']);
    expect([...normalizeTargetPlatforms(['unknown'])]).toEqual(['claude']);
  });
});

describe('rtk-integration — review-hardening coverage', () => {
  test('already-present + hook fails: hook-failed via the already-installed entry too', () => {
    const run = makeRun({ installed: true, initSucceeds: false });
    const r = setup({ run, has: hasFrom(['brew']) });
    expect(r).toMatchObject({ ok: true, synced: false, reason: 'hook-failed', installedVia: 'already-present', hook: false });
    expect(run.calls.some((c) => /install/.test(c))).toBe(false); // no reinstall
  });

  test('installed but version unparseable: status null-version, still wires', () => {
    const run = makeRun({ installed: true, versionOut: 'rtk (dev build)' });
    expect(rtkStatus({ run })).toMatchObject({ installed: true, version: null });
    const r = setup({ run, has: hasFrom(['brew']) });
    expect(r).toMatchObject({ ok: true, synced: true, version: null, hook: true });
  });

  test('every log breadcrumb on the success path is single-line', () => {
    const logs = [];
    setup({ run: makeRun(), has: hasFrom(['brew']), log: (m) => logs.push(m) });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => typeof l === 'string' && !l.includes('\n'))).toBe(true);
  });

  test('BYAN_SKIP_RTK opts out ONLY on the exact value "1" (strict, pinned contract)', () => {
    expect(shouldOfferRtk({ env: { BYAN_SKIP_RTK: 'true' }, isTTY: true, has: hasFrom(['brew']) })).toBe(true);
    expect(shouldOfferRtk({ env: { BYAN_SKIP_RTK: '0' }, isTTY: true, has: hasFrom(['brew']) })).toBe(true);
    expect(shouldOfferRtk({ env: { BYAN_SKIP_RTK: '1' }, isTTY: true, has: hasFrom(['brew']) })).toBe(false);
  });
});

describe('rtk-integration — shouldOfferRtk (installer gate)', () => {
  test('offers when TTY + an installer is available + not opted out', () => {
    expect(shouldOfferRtk({ env: {}, isTTY: true, has: hasFrom(['brew']) })).toBe(true);
  });

  test('does NOT offer when opted out via BYAN_SKIP_RTK=1', () => {
    expect(shouldOfferRtk({ env: { BYAN_SKIP_RTK: '1' }, isTTY: true, has: hasFrom(['brew']) })).toBe(false);
  });

  test('does NOT offer in a non-interactive (no-TTY / CI) context', () => {
    expect(shouldOfferRtk({ env: {}, isTTY: false, has: hasFrom(['brew']) })).toBe(false);
  });

  test('does NOT offer when no installer is on PATH (never prompt for the undeliverable)', () => {
    expect(shouldOfferRtk({ env: {}, isTTY: true, has: hasFrom([]) })).toBe(false);
  });
});
