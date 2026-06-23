'use strict';

/**
 * rtk-integration.js + native-helper.js
 *
 * RTK install/wiring is exercised entirely through an INJECTED command runner +
 * PATH probe — no test ever shells out, installs a binary, or touches the user
 * machine. The invariants under test:
 *   - delegation: BYAN runs rtk's OWN installer (brew/cargo/script) + `rtk init -g`
 *   - graceful: a missing installer or any failed step is a no-op, ok stays true
 *   - idempotent: an already-present rtk still (re)wires the hook
 *   - never breaks BYAN: setupRtkIntegration NEVER throws and ok===true always
 */

const {
  setupRtkIntegration,
  rtkStatus,
  pickStrategy,
  installStrategies,
  doctor,
  shouldOfferRtk,
  RTK_VERSION,
} = require('../lib/rtk-integration');
const { commandExists, detectPlatform, firstAvailable } = require('../lib/native-helper');

// A stateful fake runner. rtk is "not installed" until an install command runs,
// then `rtk --version` reports VERSION_OUT. Each command can be forced to throw.
function makeRun(opts = {}) {
  const o = {
    installed: false,
    versionOut: 'rtk 0.42.4',
    installSucceeds: true,
    initSucceeds: true,
    versionUnverified: false, // install "runs" but rtk --version still fails after
    ...opts,
  };
  const calls = [];
  const run = (cmd) => {
    calls.push(cmd);
    if (/^rtk --version/.test(cmd)) {
      if (!o.installed) throw new Error('rtk: command not found');
      return Buffer.from(o.versionOut);
    }
    if (/install/.test(cmd) && /(brew|cargo|install\.sh)/.test(cmd)) {
      if (!o.installSucceeds) throw new Error('install failed');
      if (!o.versionUnverified) o.installed = true;
      return Buffer.from('');
    }
    if (/^rtk init -g/.test(cmd)) {
      if (!o.initSucceeds) throw new Error('rtk init failed');
      return Buffer.from('');
    }
    return Buffer.from('');
  };
  run.calls = calls;
  return run;
}

// A PATH probe that only knows about the tools in `present`.
const hasFrom = (present) => (tool) => present.includes(tool);

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

describe('rtk-integration — strategy selection', () => {
  test('install strategies are ordered brew > cargo > script and delegate to rtk', () => {
    const ids = installStrategies().map((s) => s.id);
    expect(ids).toEqual(['brew', 'cargo', 'script']);
    const byId = Object.fromEntries(installStrategies().map((s) => [s.id, s.cmd]));
    expect(byId.brew).toBe('brew install rtk');
    // cargo + script are PINNED to the tag (supply-chain: no moving branch).
    expect(byId.cargo).toMatch(/^cargo install --git https:\/\/github\.com\/rtk-ai\/rtk --tag v0\.42\.4$/);
    expect(byId.script).toMatch(/^curl -fsSL .*refs\/tags\/v0\.42\.4\/install\.sh \| RTK_VERSION=v0\.42\.4 sh$/);
  });

  test('pickStrategy honors PATH availability and preference order', () => {
    expect(pickStrategy({ has: hasFrom(['brew', 'cargo', 'curl']) }).id).toBe('brew');
    expect(pickStrategy({ has: hasFrom(['cargo', 'curl']) }).id).toBe('cargo');
    expect(pickStrategy({ has: hasFrom(['curl']) }).id).toBe('script');
    expect(pickStrategy({ has: hasFrom([]) })).toBeNull();
  });
});

describe('rtk-integration — setupRtkIntegration', () => {
  test('no installer available: graceful no-op, ok stays true', () => {
    const run = makeRun();
    const r = setupRtkIntegration({ run, has: hasFrom([]) });
    expect(r.ok).toBe(true);
    expect(r.synced).toBe(false);
    expect(r.reason).toBe('no-installer');
    expect(r.installed).toBe(false);
    // No install was attempted.
    expect(run.calls.some((c) => /brew|cargo|install\.sh/.test(c))).toBe(false);
  });

  test('brew present: installs via brew, verifies, wires hook via `rtk init -g`', () => {
    const run = makeRun();
    const r = setupRtkIntegration({ run, has: hasFrom(['brew', 'curl']) });
    expect(r).toMatchObject({ ok: true, synced: true, reason: 'wired', installedVia: 'brew', version: '0.42.4', hook: true });
    expect(run.calls).toContain('brew install rtk');
    expect(run.calls).toContain('rtk init -g');
    // brew was preferred even though curl was also present.
    expect(run.calls.some((c) => /install\.sh/.test(c))).toBe(false);
  });

  test('only curl present: falls back to the official install.sh script', () => {
    const run = makeRun();
    const r = setupRtkIntegration({ run, has: hasFrom(['curl']) });
    expect(r.installedVia).toBe('script');
    expect(r.synced).toBe(true);
    expect(run.calls.some((c) => /install\.sh \| RTK_VERSION=v0\.42\.4 sh$/.test(c))).toBe(true);
  });

  test('already installed: skips install, still (re)wires the hook idempotently', () => {
    const run = makeRun({ installed: true });
    const r = setupRtkIntegration({ run, has: hasFrom(['brew']) });
    expect(r.installedVia).toBe('already-present');
    expect(r.synced).toBe(true);
    expect(r.hook).toBe(true);
    expect(run.calls.some((c) => /brew install/.test(c))).toBe(false); // no reinstall
    expect(run.calls).toContain('rtk init -g');
  });

  test('install command fails: graceful, ok true, reason names the strategy', () => {
    const run = makeRun({ installSucceeds: false });
    const r = setupRtkIntegration({ run, has: hasFrom(['brew']) });
    expect(r.ok).toBe(true);
    expect(r.synced).toBe(false);
    expect(r.reason).toBe('install-failed:brew');
    expect(r.installed).toBe(false);
  });

  test('install runs but version cannot be verified: install-unverified', () => {
    const run = makeRun({ versionUnverified: true });
    const r = setupRtkIntegration({ run, has: hasFrom(['cargo']) });
    expect(r.ok).toBe(true);
    expect(r.synced).toBe(false);
    expect(r.reason).toBe('install-unverified');
  });

  test('hook wiring fails after a good install: hook-failed but still ok', () => {
    const run = makeRun({ initSucceeds: false });
    const r = setupRtkIntegration({ run, has: hasFrom(['brew']) });
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
    ];
    const probes = [hasFrom([]), hasFrom(['brew']), hasFrom(['cargo']), hasFrom(['curl'])];
    for (const run of scenarios) {
      for (const has of probes) {
        let r;
        expect(() => { r = setupRtkIntegration({ run, has }); }).not.toThrow();
        expect(r.ok).toBe(true);
      }
    }
  });

  test('a one-line log breadcrumb is emitted (never the raw multi-line error)', () => {
    const logs = [];
    setupRtkIntegration({ run: makeRun({ installSucceeds: false }), has: hasFrom(['brew']), log: (m) => logs.push(m) });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => !l.includes('\n'))).toBe(true);
  });
});

describe('rtk-integration — status + doctor', () => {
  test('rtkStatus parses the version when present, reports absent otherwise', () => {
    expect(rtkStatus({ run: makeRun({ installed: true }) })).toEqual({ installed: true, version: '0.42.4' });
    expect(rtkStatus({ run: makeRun({ installed: false }) })).toEqual({ installed: false, version: null });
  });

  test('doctor reports the component status + the pinned floor + hook command', () => {
    const d = doctor({ run: makeRun({ installed: true }) });
    expect(d).toMatchObject({ component: 'rtk', installed: true, version: '0.42.4', pinned: RTK_VERSION, hookCommand: 'rtk init -g' });
  });
});

describe('rtk-integration — review-hardening coverage', () => {
  test('already-present + hook fails: hook-failed via the already-installed entry too', () => {
    const run = makeRun({ installed: true, initSucceeds: false });
    const r = setupRtkIntegration({ run, has: hasFrom(['brew']) });
    expect(r).toMatchObject({ ok: true, synced: false, reason: 'hook-failed', installedVia: 'already-present', hook: false });
    expect(run.calls.some((c) => /install/.test(c))).toBe(false); // no reinstall
  });

  test('installed but version unparseable: status null-version, still wires', () => {
    const run = makeRun({ installed: true, versionOut: 'rtk (dev build)' });
    expect(rtkStatus({ run })).toEqual({ installed: true, version: null });
    const r = setupRtkIntegration({ run, has: hasFrom(['brew']) });
    expect(r).toMatchObject({ ok: true, synced: true, version: null, hook: true });
  });

  test('every log breadcrumb on the success path is single-line', () => {
    const logs = [];
    setupRtkIntegration({ run: makeRun(), has: hasFrom(['brew']), log: (m) => logs.push(m) });
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
