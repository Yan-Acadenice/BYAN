'use strict';

/**
 * Tests for the file-system core of `update-byan-agent update`.
 *
 * Proves the field-reported fixes:
 *  - BUG3 : the template is resolved from the running package (no npm install).
 *  - BUG2 : the source is validated before _byan is touched, the swap is atomic
 *           (no .staging/.prev residue), and a missing/empty source leaves the
 *           existing _byan intact.
 *  - F22 not regressed : .github/agents is refreshed from the local template.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  applyUpdate,
  resolvePackageRoot,
  stageAndSwap,
  isNonEmptyDir,
} = require('../lib/apply-update');

function mkdtemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'byan-apply-update-'));
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

/**
 * Build a fake create-byan-agent package root carrying a Gen3 template:
 *   <pkg>/update-byan-agent/bin/update-byan-agent.js   (so ../.. resolves here)
 *   <pkg>/install/templates/_byan/agent/marc/marc.md
 *   <pkg>/install/templates/.github/agents/bmad-agent-marc.md  (Gen3-first stub)
 */
function makeFakePackage() {
  const pkg = mkdtemp();
  write(path.join(pkg, 'update-byan-agent', 'bin', 'update-byan-agent.js'), '// bin');
  const tpl = path.join(pkg, 'install', 'templates');
  write(path.join(tpl, '_byan', 'agent', 'marc', 'marc.md'), '# marc (Gen3)\n');
  write(path.join(tpl, '_byan', 'agent', 'byan', 'byan.md'), '# byan (Gen3)\n');
  write(path.join(tpl, '_byan', '_config', 'manifest.csv'), 'name\nmarc\n');
  write(
    path.join(tpl, '.github', 'agents', 'bmad-agent-marc.md'),
    '1. LOAD the FULL agent file from {project-root}/_byan/agent/marc/marc.md (new layout); ' +
    'if absent, {project-root}/_byan/*/agents/marc.md (legacy layout)\n'
  );
  return pkg;
}

/** Build a fake installed project still carrying Gen2 residue + Gen2 stubs. */
function makeOldInstall() {
  const proj = mkdtemp();
  // Gen2 residue under _byan that must NOT survive the rebuild.
  write(path.join(proj, '_byan', 'bmb', 'agents', 'marc.md'), '# OLD Gen2 marc\n');
  write(path.join(proj, '_byan', 'agents', 'byan.md'), '# OLD Gen2 flat byan\n');
  // Gen2-pointing stub that must be replaced.
  write(
    path.join(proj, '.github', 'agents', 'bmad-agent-marc.md'),
    '1. LOAD the FULL agent file from {project-root}/_byan/bmb/agents/marc.md\n'
  );
  return proj;
}

describe('resolvePackageRoot (BUG3 — local resolution, no npm install)', () => {
  test('resolves the running package root from the bin dir', () => {
    const pkg = makeFakePackage();
    const binDir = path.join(pkg, 'update-byan-agent', 'bin');
    const installPath = mkdtemp();
    const r = resolvePackageRoot({ installPath, binDir });
    expect(r.source).toBe('running-package');
    expect(r.pkgRoot).toBe(pkg);
  });

  test('throws a diagnostic listing probed paths when no template is found', () => {
    const binDir = path.join(mkdtemp(), 'update-byan-agent', 'bin');
    const installPath = mkdtemp();
    expect(() => resolvePackageRoot({ installPath, binDir })).toThrow(/Could not resolve the create-byan-agent package template/);
  });

  test('distinguishes a present-but-empty template (package defect)', () => {
    const pkg = mkdtemp();
    fs.mkdirSync(path.join(pkg, 'update-byan-agent', 'bin'), { recursive: true });
    fs.mkdirSync(path.join(pkg, 'install', 'templates', '_byan'), { recursive: true }); // empty
    const binDir = path.join(pkg, 'update-byan-agent', 'bin');
    expect(() => resolvePackageRoot({ installPath: mkdtemp(), binDir }))
      .toThrow(/present but EMPTY/);
  });
});

describe('applyUpdate (BUG2 atomic swap + F22 stub refresh)', () => {
  test('fully replaces _byan: Gen2 residue gone, Gen3 present', () => {
    const pkg = makeFakePackage();
    const proj = makeOldInstall();
    applyUpdate({ installPath: proj, pkgRoot: pkg });

    // Gen3 content present.
    expect(fs.existsSync(path.join(proj, '_byan', 'agent', 'marc', 'marc.md'))).toBe(true);
    expect(fs.existsSync(path.join(proj, '_byan', 'agent', 'byan', 'byan.md'))).toBe(true);
    // Gen2 residue gone (full replace, not merge).
    expect(fs.existsSync(path.join(proj, '_byan', 'bmb', 'agents', 'marc.md'))).toBe(false);
    expect(fs.existsSync(path.join(proj, '_byan', 'agents', 'byan.md'))).toBe(false);
  });

  test('refreshes .github/agents to the Gen3-first stub (F22 not regressed)', () => {
    const pkg = makeFakePackage();
    const proj = makeOldInstall();
    applyUpdate({ installPath: proj, pkgRoot: pkg });

    const stub = fs.readFileSync(path.join(proj, '.github', 'agents', 'bmad-agent-marc.md'), 'utf8');
    expect(stub).toMatch(/_byan\/agent\/marc\/marc\.md \(new layout\)/);
    expect(stub).not.toMatch(/_byan\/bmb\/agents\/marc\.md(?! )/); // old Gen2-only target gone
  });

  test('leaves no .staging or .prev residue after the swap', () => {
    const pkg = makeFakePackage();
    const proj = makeOldInstall();
    applyUpdate({ installPath: proj, pkgRoot: pkg });

    expect(fs.existsSync(path.join(proj, '_byan.staging'))).toBe(false);
    expect(fs.existsSync(path.join(proj, '_byan.prev'))).toBe(false);
    expect(fs.existsSync(path.join(proj, '.github', 'agents.staging'))).toBe(false);
    expect(fs.existsSync(path.join(proj, '.github', 'agents.prev'))).toBe(false);
  });

  test('works when the project has no pre-existing _byan (fresh dir)', () => {
    const pkg = makeFakePackage();
    const proj = mkdtemp();
    expect(() => applyUpdate({ installPath: proj, pkgRoot: pkg })).not.toThrow();
    expect(fs.existsSync(path.join(proj, '_byan', 'agent', 'marc', 'marc.md'))).toBe(true);
  });
});

describe('destructive-safety (BUG2 — never delete _byan before a valid source)', () => {
  test('a missing template source throws and leaves the existing _byan intact', () => {
    const emptyPkg = mkdtemp(); // no install/templates/_byan
    const proj = makeOldInstall();
    const sentinel = path.join(proj, '_byan', 'bmb', 'agents', 'marc.md');
    expect(fs.existsSync(sentinel)).toBe(true);

    expect(() => applyUpdate({ installPath: proj, pkgRoot: emptyPkg }))
      .toThrow(/missing or empty/);

    // _byan was NOT touched.
    expect(fs.existsSync(sentinel)).toBe(true);
    expect(fs.existsSync(path.join(proj, '_byan.staging'))).toBe(false);
    expect(fs.existsSync(path.join(proj, '_byan.prev'))).toBe(false);
  });

  test('an empty template source dir throws and leaves _byan intact', () => {
    const pkg = mkdtemp();
    fs.mkdirSync(path.join(pkg, 'install', 'templates', '_byan'), { recursive: true }); // empty
    const proj = makeOldInstall();
    const sentinel = path.join(proj, '_byan', 'agents', 'byan.md');
    expect(fs.existsSync(sentinel)).toBe(true);

    expect(() => applyUpdate({ installPath: proj, pkgRoot: pkg })).toThrow(/missing or empty/);
    expect(fs.existsSync(sentinel)).toBe(true);
  });
});

describe('helpers', () => {
  test('isNonEmptyDir is false for missing, empty, and file paths', () => {
    const base = mkdtemp();
    expect(isNonEmptyDir(path.join(base, 'nope'))).toBe(false);
    const empty = path.join(base, 'empty');
    fs.mkdirSync(empty);
    expect(isNonEmptyDir(empty)).toBe(false);
    const file = path.join(base, 'f.txt');
    fs.writeFileSync(file, 'x');
    expect(isNonEmptyDir(file)).toBe(false);
    expect(isNonEmptyDir(base)).toBe(true);
  });

  test('stageAndSwap clears a stale .prev residue from a prior run', () => {
    const base = mkdtemp();
    const src = path.join(base, 'src');
    write(path.join(src, 'new.txt'), 'NEW');
    const dst = path.join(base, 'dst');
    write(path.join(dst, 'old.txt'), 'OLD');
    write(path.join(`${dst}.prev`, 'stale.txt'), 'STALE'); // leftover debris

    stageAndSwap(src, dst, 'dst');

    expect(fs.existsSync(path.join(dst, 'new.txt'))).toBe(true);
    expect(fs.existsSync(path.join(dst, 'old.txt'))).toBe(false);
    expect(fs.existsSync(`${dst}.prev`)).toBe(false);
    expect(fs.existsSync(`${dst}.staging`)).toBe(false);
  });

  test('stageAndSwap replaces content and reports entry count', () => {
    const base = mkdtemp();
    const src = path.join(base, 'src');
    write(path.join(src, 'a.txt'), 'A');
    write(path.join(src, 'sub', 'b.txt'), 'B');
    const dst = path.join(base, 'dst');
    write(path.join(dst, 'old.txt'), 'OLD');

    const count = stageAndSwap(src, dst, 'dst');
    expect(count).toBe(2); // a.txt + sub
    expect(fs.existsSync(path.join(dst, 'old.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(dst, 'a.txt'), 'utf8')).toBe('A');
    expect(fs.readFileSync(path.join(dst, 'sub', 'b.txt'), 'utf8')).toBe('B');
  });
});
