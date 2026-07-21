'use strict';

const path = require('path');

// Detection of an installed BYAN Desktop app (Electron, packaged by
// electron-builder). productName is "BYAN", appId fr.acadenice.byan. We match
// CONCRETE executables at the install locations electron-builder produces per
// OS — NOT a bare `byan` on PATH, which would false-positive on any unrelated
// binary of that name. The AppImage build has no fixed install path, so it is
// covered by the BYAN_DESKTOP_BIN override (the user points at their AppImage).
//
// Pure and injectable: platform / env / homedir / existsSync are all overridable
// so the detection is unit-testable without touching the real filesystem.

function candidatePaths(platform, env, homedir) {
  const out = [];

  // Build the TARGET platform's paths, not the host's — so detection is correct
  // and unit-testable regardless of the OS the check runs on.
  const p = platform === 'win32' ? path.win32 : path.posix;

  // Explicit override always wins (AppImage users, custom install prefixes).
  if (env.BYAN_DESKTOP_BIN) out.push(env.BYAN_DESKTOP_BIN);

  if (platform === 'darwin') {
    out.push('/Applications/BYAN.app/Contents/MacOS/BYAN');
    out.push(p.join(homedir, 'Applications', 'BYAN.app', 'Contents', 'MacOS', 'BYAN'));
  } else if (platform === 'win32') {
    if (env.LOCALAPPDATA) out.push(p.join(env.LOCALAPPDATA, 'Programs', 'BYAN', 'BYAN.exe'));
    if (env.PROGRAMFILES) out.push(p.join(env.PROGRAMFILES, 'BYAN', 'BYAN.exe'));
  } else {
    // Linux deb/rpm: electron-builder installs to /opt/<productName> and drops
    // a symlink /usr/bin/<executableName> (productName lowercased -> byan).
    out.push('/opt/BYAN/byan');
    out.push('/usr/bin/byan');
    out.push('/usr/local/bin/byan');
  }

  return out;
}

function detectDesktopApp(opts = {}) {
  const platform = opts.platform || process.platform;
  const env = opts.env || process.env;
  const homedir = opts.homedir || require('os').homedir();
  const existsSync = opts.existsSync || require('fs').existsSync;

  for (const candidate of candidatePaths(platform, env, homedir)) {
    if (candidate && existsSync(candidate)) {
      const source = env.BYAN_DESKTOP_BIN === candidate ? 'env' : 'path';
      return { found: true, bin: candidate, source };
    }
  }

  return { found: false, bin: null, source: null };
}

module.exports = { detectDesktopApp, candidatePaths };
