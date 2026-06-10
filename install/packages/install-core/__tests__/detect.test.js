'use strict';

// Module under test: lib/detect.js (consumes lib/probe-matrix.js).
// Contract: detect(opts) accepts injectable { lookpath, runVersion } so the
// suite drives detection with fakes and asserts a PURE, serializable
// MachineProfile with ZERO real spawns. Covers C4 (serializable profile with
// os/arch/node/npm/git/claude/codex present+version) and part of C1 (detect is
// pure: no disk write, no spawn — here proven by never injecting a real
// spawner and by snapshotting the cwd).

const fs = require('fs');
const os = require('os');
const path = require('path');

const { detect } = require('../lib/detect');
const { PROBE_MATRIX, TOOL_PROBES } = require('../lib/probe-matrix');

// --- Test doubles -----------------------------------------------------------

// A lookpath fake: resolves only the binaries named in `present`, to a
// deterministic absolute path; everything else returns null.
function fakeLookpath(present) {
  const table = {};
  present.forEach((bin) => {
    table[bin] = '/usr/bin/' + bin;
  });
  return function (bin) {
    return Object.prototype.hasOwnProperty.call(table, bin) ? table[bin] : null;
  };
}

// A runVersion fake: returns a canned version string for known bins, null
// otherwise. Records every call so we can assert it is never invoked for an
// absent binary (no wasted spawn) and never called when probeVersions:false.
function fakeRunVersion(versions, calls) {
  return function (bin) {
    if (calls) calls.push(bin);
    return Object.prototype.hasOwnProperty.call(versions, bin)
      ? versions[bin]
      : null;
  };
}

// A spawner that must never run: if detect ever ignores the injected
// runVersion and reaches for a real spawn, this throws and fails the test.
function explodingRunVersion() {
  return function (bin) {
    throw new Error('detect() must not spawn for ' + bin + '; use injected runVersion');
  };
}

// --- probe-matrix --------------------------------------------------------------

describe('probe-matrix', () => {
  test('exports a declarative array of probes covering the required tools', () => {
    expect(Array.isArray(PROBE_MATRIX)).toBe(true);
    const ids = PROBE_MATRIX.map((p) => p.id);
    ['os', 'arch', 'node', 'npm', 'git', 'claude', 'codex'].forEach((id) => {
      expect(ids).toContain(id);
    });
  });

  test('each probe is declarative data: id + kind, no inlined spawning', () => {
    PROBE_MATRIX.forEach((p) => {
      expect(typeof p.id).toBe('string');
      expect(['platform', 'runtime', 'tool']).toContain(p.kind);
      // A tool probe declares which binary to look up and the version flag,
      // but does NOT itself spawn — detect injects the runner.
      if (p.kind === 'tool') {
        expect(typeof p.binary).toBe('string');
        expect(Array.isArray(p.versionArgs)).toBe(true);
      }
    });
  });

  test('TOOL_PROBES is the subset of tool-kind probes (npm/git/claude/codex)', () => {
    const toolIds = TOOL_PROBES.map((p) => p.id);
    expect(toolIds).toEqual(expect.arrayContaining(['npm', 'git', 'claude', 'codex']));
    TOOL_PROBES.forEach((p) => expect(p.kind).toBe('tool'));
  });
});

// --- detect: full machine ----------------------------------------------------

describe('detect — machine with node+npm+git+claude but NOT codex', () => {
  const lookpath = fakeLookpath(['npm', 'git', 'claude']);
  const versions = {
    npm: '10.8.2',
    git: '2.39.2',
    claude: '2.1.114',
  };

  test('returns a MachineProfile with present/version per tool', async () => {
    const profile = await detect({
      lookpath,
      runVersion: fakeRunVersion(versions),
      probeVersions: true, // opt into version probing for this assertion
    });

    // node is the runtime — always present, version from process.versions.
    expect(profile.node.present).toBe(true);
    expect(typeof profile.node.version).toBe('string');
    expect(profile.node.version.length).toBeGreaterThan(0);

    // present tools resolve a path + version.
    expect(profile.npm.present).toBe(true);
    expect(profile.npm.path).toBe('/usr/bin/npm');
    expect(profile.npm.version).toBe('10.8.2');

    expect(profile.git.present).toBe(true);
    expect(profile.git.version).toBe('2.39.2');

    expect(profile.claude.present).toBe(true);
    expect(profile.claude.version).toBe('2.1.114');

    // absent tool: present:false, path:null, version:null — never thrown.
    expect(profile.codex.present).toBe(false);
    expect(profile.codex.path).toBe(null);
    expect(profile.codex.version).toBe(null);
  });

  test('os and arch are populated from the os module (serializable strings)', async () => {
    const profile = await detect({
      lookpath,
      runVersion: fakeRunVersion(versions),
    });
    expect(typeof profile.os.platform).toBe('string');
    expect(profile.os.platform).toBe(os.platform());
    expect(typeof profile.os.arch).toBe('string');
    expect(profile.os.arch).toBe(os.arch());
    expect(typeof profile.os.release).toBe('string');
  });

  test('version probing is skipped only for absent binaries (no wasted spawn)', async () => {
    const calls = [];
    await detect({
      lookpath,
      runVersion: fakeRunVersion(versions, calls),
      probeVersions: true, // opt in; otherwise the default probes nothing
    });
    // codex was absent: its version must never be probed.
    expect(calls).not.toContain('codex');
    // present tools were probed.
    expect(calls).toEqual(expect.arrayContaining(['npm', 'git', 'claude']));
  });

  test('DEFAULT detect (probeVersions unset) performs ZERO spawns even when tools ARE present', async () => {
    // C1: detect must be spawn-free out of the box. With present binaries but
    // no probeVersions opt-in, the exploding runner must never fire and every
    // version stays null while presence is still resolved via lookpath.
    const profile = await detect({
      lookpath, // npm + git + claude present
      runVersion: explodingRunVersion(),
    });
    expect(profile.npm.present).toBe(true);
    expect(profile.npm.version).toBe(null);
    expect(profile.git.present).toBe(true);
    expect(profile.git.version).toBe(null);
    expect(profile.claude.present).toBe(true);
    expect(profile.claude.version).toBe(null);
  });

  test('probeVersions:false leaves versions null but still resolves present via lookpath', async () => {
    const calls = [];
    const profile = await detect({
      lookpath,
      runVersion: explodingRunVersion(), // must never be called
      probeVersions: false,
    });
    expect(profile.claude.present).toBe(true);
    expect(profile.claude.version).toBe(null);
    expect(profile.npm.present).toBe(true);
    expect(profile.npm.version).toBe(null);
    expect(calls).toHaveLength(0);
  });

  test('JSON.stringify(profile) round-trips (fully serializable)', async () => {
    const profile = await detect({
      lookpath,
      runVersion: fakeRunVersion(versions),
    });
    const json = JSON.stringify(profile);
    const back = JSON.parse(json);
    expect(back).toEqual(profile);
    // schemaVersion + generatedAt are present and serializable.
    expect(back.schemaVersion).toBe(profile.schemaVersion);
    expect(typeof back.generatedAt).toBe('string');
  });
});

// --- detect: empty machine ---------------------------------------------------

describe('detect — empty machine (no tools on PATH)', () => {
  const lookpath = fakeLookpath([]); // nothing resolves

  test('every tool reports present:false, path:null, version:null without throwing', async () => {
    const calls = [];
    const profile = await detect({
      lookpath,
      runVersion: fakeRunVersion({}, calls),
    });
    ['npm', 'git', 'claude', 'codex'].forEach((tool) => {
      expect(profile[tool].present).toBe(false);
      expect(profile[tool].path).toBe(null);
      expect(profile[tool].version).toBe(null);
    });
    // node still present (runtime is the host process).
    expect(profile.node.present).toBe(true);
    // No version probe happened: every binary was absent.
    expect(calls).toHaveLength(0);
  });

  test('still serializable and round-trips on an empty machine', async () => {
    const profile = await detect({
      lookpath,
      runVersion: fakeRunVersion({}),
    });
    expect(JSON.parse(JSON.stringify(profile))).toEqual(profile);
  });
});

// --- purity ------------------------------------------------------------------

describe('detect — purity (part of C1)', () => {
  test('does not create or modify any file under opts.cwd', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-detect-pure-'));
    try {
      const before = fs.readdirSync(tmp).sort();
      await detect({
        cwd: tmp,
        lookpath: fakeLookpath(['npm']),
        runVersion: fakeRunVersion({ npm: '10.8.2' }),
      });
      const after = fs.readdirSync(tmp).sort();
      expect(after).toEqual(before);
      expect(after).toHaveLength(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('runs with zero REAL spawns: an exploding runVersion is never invoked when no tool present', async () => {
    // empty machine => nothing to probe => exploding runner stays untouched.
    const profile = await detect({
      lookpath: fakeLookpath([]),
      runVersion: explodingRunVersion(),
    });
    expect(profile.node.present).toBe(true);
  });

  test('returns a frozen profile (defensive immutability)', async () => {
    const profile = await detect({
      lookpath: fakeLookpath([]),
      runVersion: fakeRunVersion({}),
    });
    expect(Object.isFrozen(profile)).toBe(true);
  });
});
