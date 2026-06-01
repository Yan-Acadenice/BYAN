'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const api = require('../../install/src/webui/api');

// ── fixtures ────────────────────────────────────────────────────────────────

function mkRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'byan-api-layout-'));
}

function write(root, rel, content = 'x') {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

let roots = [];
afterEach(() => {
  for (const r of roots) {
    try { fs.rmSync(r, { recursive: true, force: true }); } catch (_e) { /* noop */ }
  }
  roots = [];
});
function root() {
  const r = mkRoot();
  roots.push(r);
  return r;
}

// ── isByanInstalled ───────────────────────────────────────────────────────────

describe('isByanInstalled', () => {
  test('false on an empty project', () => {
    expect(api.isByanInstalled(root())).toBe(false);
  });

  test('true when the current _byan/ layout is present', () => {
    const r = root();
    write(r, '_byan/config.yaml');
    expect(api.isByanInstalled(r)).toBe(true);
  });

  test('true when only the legacy _bmad/ marker is present', () => {
    const r = root();
    write(r, '_bmad/core/config.yaml');
    expect(api.isByanInstalled(r)).toBe(true);
  });
});

// ── installRoot ───────────────────────────────────────────────────────────────

describe('installRoot', () => {
  test('returns _byan when it exists', () => {
    const r = root();
    write(r, '_byan/soul.md');
    expect(api.installRoot(r)).toBe(path.join(r, '_byan'));
  });

  test('falls back to legacy _bmad when only _bmad exists', () => {
    const r = root();
    write(r, '_bmad/core/config.yaml');
    expect(api.installRoot(r)).toBe(path.join(r, '_bmad'));
  });

  test('defaults to _byan for a fresh restore (neither present)', () => {
    const r = root();
    expect(api.installRoot(r)).toBe(path.join(r, '_byan'));
  });

  test('prefers _byan over _bmad when both exist', () => {
    const r = root();
    write(r, '_byan/soul.md');
    write(r, '_bmad/core/config.yaml');
    expect(api.installRoot(r)).toBe(path.join(r, '_byan'));
  });
});

// ── ensureDirectoryStructure ───────────────────────────────────────────────────

describe('ensureDirectoryStructure', () => {
  test('scaffolds the Gen2 _byan/ skeleton and _byan-output, never _bmad', () => {
    const r = root();
    api.ensureDirectoryStructure(r);
    for (const rel of [
      '_byan', '_byan/_config', '_byan/_memory',
      '_byan/core', '_byan/core/agents', '_byan/core/workflows', '_byan/core/tasks',
      '_byan-output', '_byan-output/planning-artifacts', '_byan-output/implementation-artifacts'
    ]) {
      expect(exists(r, rel)).toBe(true);
    }
    expect(exists(r, '_bmad')).toBe(false);
    expect(exists(r, '_bmad-output')).toBe(false);
  });

  test('is idempotent (second run does not throw)', () => {
    const r = root();
    api.ensureDirectoryStructure(r);
    expect(() => api.ensureDirectoryStructure(r)).not.toThrow();
    expect(exists(r, '_byan/core/agents')).toBe(true);
  });
});

// ── writeBaseConfig ─────────────────────────────────────────────────────────────

describe('writeBaseConfig', () => {
  test('writes _byan/config.yaml with _byan-output when no config exists', () => {
    const r = root();
    api.writeBaseConfig(r, { userName: 'Yan', language: 'Francais' });
    const p = path.join(r, '_byan', 'config.yaml');
    expect(fs.existsSync(p)).toBe(true);
    const content = fs.readFileSync(p, 'utf8');
    expect(content).toContain('user_name: Yan');
    expect(content).toContain('{project-root}/_byan-output');
    expect(content).not.toContain('_bmad-output');
  });

  test('does NOT shadow the authoritative _byan/bmb/config.yaml', () => {
    const r = root();
    write(r, '_byan/bmb/config.yaml', 'byan_version: 2.7.3');
    api.writeBaseConfig(r, { userName: 'Yan' });
    // guard must skip: no root config written over the authoritative module one
    expect(exists(r, '_byan/config.yaml')).toBe(false);
  });

  test('skips when a Gen2 root config already exists', () => {
    const r = root();
    write(r, '_byan/config.yaml', 'user_name: Existing');
    api.writeBaseConfig(r, { userName: 'Overwrite' });
    expect(fs.readFileSync(path.join(r, '_byan', 'config.yaml'), 'utf8'))
      .toContain('user_name: Existing');
  });

  test('skips when a Gen3 context config already exists', () => {
    const r = root();
    write(r, '_byan/context/config.yaml', 'user_name: Gen3');
    api.writeBaseConfig(r, { userName: 'Overwrite' });
    expect(exists(r, '_byan/config.yaml')).toBe(false);
  });
});
