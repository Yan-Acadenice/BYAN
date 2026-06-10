'use strict';

// Covers C3: lookpath is pure-Node cross-platform, no which/where via execSync.
// The injected-env tests prove cross-platform PATH/PATHEXT logic without
// touching the real OS, so the Windows branch is exercised on a POSIX runner.

const fs = require('fs');
const os = require('os');
const path = require('path');

const { lookpath, lookpathSync, lookpathAll } = require('../lib/lookpath');

// Build an isolated temp dir tree we fully control, so the tests do not depend
// on whatever binaries happen to exist on the runner's real PATH.
function mkTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function touch(file) {
  fs.writeFileSync(file, '#!/bin/sh\nexit 0\n');
  // executable bit only matters on POSIX; harmless on Windows.
  try { fs.chmodSync(file, 0o755); } catch (_e) { /* WHY: chmod is a no-op/throws on some FS, presence is what we assert */ }
}

describe('lookpathSync', () => {
  test('finds a known binary on the real PATH (node)', () => {
    // process.execPath is the running node; its basename is on PATH in CI.
    const found = lookpathSync('node');
    // CI always has node; assert it resolves to an existing absolute path.
    expect(found).toBeTruthy();
    expect(path.isAbsolute(found)).toBe(true);
    expect(fs.existsSync(found)).toBe(true);
  });

  test('returns null for a guaranteed-absent command, does not throw', () => {
    expect(() => lookpathSync('definitely-not-a-real-bin-xyz')).not.toThrow();
    expect(lookpathSync('definitely-not-a-real-bin-xyz')).toBeNull();
  });

  test('honors PATH order across two injected dirs (second dir wins only if first lacks it)', () => {
    const dirA = mkTmpDir('lp-a-');
    const dirB = mkTmpDir('lp-b-');
    // place the bin ONLY in the second dir
    const binInB = path.join(dirB, 'mytool');
    touch(binInB);

    const env = { PATH: [dirA, dirB].join(path.delimiter) };
    const resolved = lookpathSync('mytool', env);
    expect(resolved).toBe(binInB);

    // Now place it in the FIRST dir too: first-on-PATH must win.
    const binInA = path.join(dirA, 'mytool');
    touch(binInA);
    expect(lookpathSync('mytool', env)).toBe(binInA);
  });

  test('Windows branch: PATHEXT suffix matching finds foo.CMD when querying foo', () => {
    const dir = mkTmpDir('lp-win-');
    const cmdFile = path.join(dir, 'foo.CMD');
    touch(cmdFile);

    // Simulate Windows: provide PATHEXT and force the platform via injected env.
    const env = {
      PATH: dir,
      PATHEXT: '.EXE;.CMD;.BAT',
      // internal hook to force win32 logic without stubbing global os.platform
      __BYAN_PLATFORM__: 'win32'
    };
    const resolved = lookpathSync('foo', env);
    expect(resolved).toBe(cmdFile);
  });

  test('Windows branch: an exact name with extension still resolves', () => {
    const dir = mkTmpDir('lp-win2-');
    const exeFile = path.join(dir, 'bar.EXE');
    touch(exeFile);
    const env = {
      PATH: dir,
      PATHEXT: '.EXE;.CMD',
      __BYAN_PLATFORM__: 'win32'
    };
    expect(lookpathSync('bar.EXE', env)).toBe(exeFile);
  });

  test('absolute/relative command containing a separator is checked directly, not PATH-walked', () => {
    const dir = mkTmpDir('lp-abs-');
    const bin = path.join(dir, 'mytool');
    touch(bin);
    // empty PATH: if it PATH-walked it would fail; direct path must still resolve.
    expect(lookpathSync(bin, { PATH: '' })).toBe(bin);
    expect(lookpathSync(path.join(dir, 'nope'), { PATH: '' })).toBeNull();
  });

  test('empty/undefined command returns null without throwing', () => {
    expect(lookpathSync('', {})).toBeNull();
    expect(lookpathSync(undefined, {})).toBeNull();
  });

  test('missing PATH in env returns null (no crash)', () => {
    expect(lookpathSync('mytool', {})).toBeNull();
  });
});

describe('lookpathAll', () => {
  test('returns every matching dir occurrence in PATH order', () => {
    const dirA = mkTmpDir('lp-all-a-');
    const dirB = mkTmpDir('lp-all-b-');
    touch(path.join(dirA, 'dup'));
    touch(path.join(dirB, 'dup'));
    const env = { PATH: [dirA, dirB].join(path.delimiter) };
    const all = lookpathAll('dup', env);
    expect(all).toEqual([path.join(dirA, 'dup'), path.join(dirB, 'dup')]);
  });

  test('returns [] for an absent command', () => {
    expect(lookpathAll('definitely-not-a-real-bin-xyz')).toEqual([]);
  });
});

describe('lookpath (async)', () => {
  test('resolves the same value as lookpathSync', async () => {
    await expect(lookpath('node')).resolves.toBe(lookpathSync('node'));
  });

  test('resolves null for an absent command without rejecting', async () => {
    await expect(lookpath('definitely-not-a-real-bin-xyz')).resolves.toBeNull();
  });
});

describe('purity: no child_process', () => {
  test('module source references no child_process require and no spawn/exec call', () => {
    const src = fs.readFileSync(path.join(__dirname, '../lib/lookpath.js'), 'utf8');
    expect(src).not.toMatch(/require\(\s*['"]child_process['"]\s*\)/);
    // Match call-shaped usage only (foo() ), so the WHY-comments that explain the
    // absence of a spawn are not false positives.
    expect(src).not.toMatch(/\b(execSync|execFileSync|spawnSync|spawn|exec)\s*\(/);
  });

  test('child_process is not in the require cache after loading lookpath', () => {
    // Load lookpath in a clean module registry and assert it never pulled child_process.
    jest.resetModules();
    const cpPath = require.resolve('child_process');
    delete require.cache[cpPath];
    require('../lib/lookpath');
    expect(require.cache[cpPath]).toBeUndefined();
  });
});
