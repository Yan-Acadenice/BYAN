'use strict';

const path = require('path');

// Contract: the default `create-byan-agent` action prefers the native Desktop
// app when it is installed, and falls back to the browser wizard when it is
// not. This tests the detection half (option A, 2.58.0). The launch + fallback
// wiring lives in the bin; here we pin the pure detection down per OS.

const { detectDesktopApp, candidatePaths } = require('../lib/desktop-app');

function existsAmong(present) {
  const set = new Set(present);
  return (p) => set.has(p);
}

describe('detectDesktopApp — concrete install paths, not a loose PATH match', () => {
  test('linux deb symlink present -> found via /usr/bin/byan', () => {
    const res = detectDesktopApp({
      platform: 'linux',
      env: {},
      homedir: '/home/u',
      existsSync: existsAmong(['/usr/bin/byan']),
    });
    expect(res).toEqual({ found: true, bin: '/usr/bin/byan', source: 'path' });
  });

  test('linux nothing installed -> not found (browser fallback branch)', () => {
    const res = detectDesktopApp({
      platform: 'linux',
      env: {},
      homedir: '/home/u',
      existsSync: existsAmong([]),
    });
    expect(res).toEqual({ found: false, bin: null, source: null });
  });

  test('BYAN_DESKTOP_BIN override wins and is reported as source=env', () => {
    const res = detectDesktopApp({
      platform: 'linux',
      env: { BYAN_DESKTOP_BIN: '/home/u/Apps/BYAN.AppImage' },
      homedir: '/home/u',
      existsSync: existsAmong(['/home/u/Apps/BYAN.AppImage', '/usr/bin/byan']),
    });
    expect(res).toEqual({ found: true, bin: '/home/u/Apps/BYAN.AppImage', source: 'env' });
  });

  test('override pointing at a missing file -> falls through to real paths', () => {
    const res = detectDesktopApp({
      platform: 'linux',
      env: { BYAN_DESKTOP_BIN: '/nope/BYAN.AppImage' },
      homedir: '/home/u',
      existsSync: existsAmong(['/opt/BYAN/byan']),
    });
    expect(res).toEqual({ found: true, bin: '/opt/BYAN/byan', source: 'path' });
  });

  test('macOS system Applications bundle', () => {
    const res = detectDesktopApp({
      platform: 'darwin',
      env: {},
      homedir: '/Users/u',
      existsSync: existsAmong(['/Applications/BYAN.app/Contents/MacOS/BYAN']),
    });
    expect(res.found).toBe(true);
    expect(res.bin).toBe('/Applications/BYAN.app/Contents/MacOS/BYAN');
  });

  test('windows LOCALAPPDATA Programs install', () => {
    const res = detectDesktopApp({
      platform: 'win32',
      env: { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' },
      homedir: 'C:\\Users\\u',
      existsSync: existsAmong(['C:\\Users\\u\\AppData\\Local\\Programs\\BYAN\\BYAN.exe']),
    });
    expect(res.found).toBe(true);
    expect(res.bin).toContain('BYAN.exe');
  });

  test('candidatePaths on linux does not include a bare "byan" PATH lookup', () => {
    const paths = candidatePaths('linux', {}, '/home/u');
    // every candidate is an absolute concrete path, never a bare command name
    for (const p of paths) {
      expect(path.isAbsolute(p)).toBe(true);
    }
    expect(paths).toContain('/opt/BYAN/byan');
  });
});
