'use strict';

// Pure-Node cross-platform executable lookup. Replaces every which/where spawn
// in the install path. WHY no child_process: spawning which/where is slow,
// non-portable, and a hidden side effect that breaks the purity contract of
// detect() (it must read-only walk the environment, never spawn).

const fs = require('fs');
const os = require('os');
const path = require('path');

// Detect the OS family for one resolution call. WHY the env hook: tests must be
// able to exercise the Windows PATHEXT branch on a POSIX runner without stubbing
// the global os.platform (which would leak across the whole jest worker). The
// hook is internal-only; real callers never set __BYAN_PLATFORM__.
function platformOf(env) {
  if (env && env.__BYAN_PLATFORM__) return env.__BYAN_PLATFORM__;
  return os.platform();
}

function isWindows(platform) {
  return platform === 'win32';
}

// The set of executable extensions to try on Windows. On POSIX the list is a
// single empty string (the name is taken verbatim). WHY preserve original case:
// Windows' filesystem is case-insensitive but a case-sensitive POSIX runner is
// not, so the candidate filename must be built with PATHEXT's exact casing
// (foo.CMD, not foo.cmd) to match a real file; the lowercased form is only used
// for the "already ends with this extension" comparison.
function extensionsFor(platform, env) {
  if (!isWindows(platform)) return [''];
  const raw = (env && typeof env.PATHEXT === 'string' && env.PATHEXT.length > 0)
    ? env.PATHEXT
    : '.COM;.EXE;.BAT;.CMD';
  const exts = raw.split(';').map(function (e) { return e.trim(); }).filter(Boolean);
  // An exact name that already carries one of these extensions should also match
  // verbatim, so always include the empty suffix.
  exts.unshift('');
  return exts;
}

function isExistingFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch (_e) {
    // WHY swallow: a missing path or permission error simply means "not here";
    // lookpath reports absence by returning null/[] , it never throws on env state.
    return false;
  }
}

// Match a directory entry against the requested command, honoring Windows
// case-insensitive extension matching. Returns the resolved absolute-ish path or
// null. dir+command are joined; on Windows each PATHEXT suffix is appended unless
// the command already ends with that extension.
function resolveInDir(dir, command, platform, exts) {
  const win = isWindows(platform);
  const lowerCmd = win ? command.toLowerCase() : command;

  for (let i = 0; i < exts.length; i++) {
    const ext = exts[i];
    let name;
    if (ext === '') {
      name = command;
    } else if (win && lowerCmd.endsWith(ext.toLowerCase())) {
      // command already carries this extension (case-insensitive); do not double it.
      name = command;
    } else {
      name = command + ext;
    }
    const candidate = path.join(dir, name);
    if (isExistingFile(candidate)) return candidate;
  }
  return null;
}

function getPathDirs(env) {
  const raw = env && typeof env.PATH === 'string' ? env.PATH : null;
  if (raw === null || raw.length === 0) return [];
  return raw.split(path.delimiter).filter(Boolean);
}

// When the command itself contains a path separator (e.g. "./tool" or an
// absolute path), it is checked directly and never PATH-walked. This mirrors
// shell behavior and lets callers pass a known location through unchanged.
function hasSeparator(command, platform) {
  if (command.indexOf('/') !== -1) return true;
  if (isWindows(platform) && command.indexOf('\\') !== -1) return true;
  return false;
}

function effectiveEnv(env) {
  return env || process.env;
}

// lookpathAll(command, env?) -> string[] of every match in PATH order. Empty
// array if none. WHY a separate "all": detect() may want to report shadowed
// binaries; lookpathSync is just the first element of this list.
function lookpathAll(command, env) {
  if (typeof command !== 'string' || command.length === 0) return [];
  const e = effectiveEnv(env);
  const platform = platformOf(e);
  const exts = extensionsFor(platform, e);

  if (hasSeparator(command, platform)) {
    const direct = resolveInDir(path.dirname(command), path.basename(command), platform, exts);
    return direct ? [direct] : [];
  }

  const dirs = getPathDirs(e);
  const matches = [];
  for (let i = 0; i < dirs.length; i++) {
    const hit = resolveInDir(dirs[i], command, platform, exts);
    if (hit) matches.push(hit);
  }
  return matches;
}

// lookpathSync(command, env?) -> first match path or null. Pure: reads env + fs
// stat only, never spawns, never writes.
function lookpathSync(command, env) {
  const all = lookpathAll(command, env);
  return all.length > 0 ? all[0] : null;
}

// lookpath(command, env?) -> Promise<string|null>. Thin async wrapper so callers
// that prefer await have a uniform shape; the work is the same sync PATH walk.
function lookpath(command, env) {
  return Promise.resolve(lookpathSync(command, env));
}

module.exports = {
  lookpath,
  lookpathSync,
  lookpathAll
};
