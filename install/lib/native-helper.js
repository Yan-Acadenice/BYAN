'use strict';

/**
 * native-helper — dependency-light helpers for installing OPTIONAL native
 * components (rtk today; turbo-whisper/parakeet can adopt it later to retire
 * their bespoke per-OS branches, shrinking the maintenance surface).
 *
 * Everything is PURE + injectable (the command runner is a parameter) so callers
 * stay unit-testable without shelling out for real. WHY: the install path runs on
 * every user machine across OSes — it must be exercised by tests, not hope.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { commandExists: sharedCommandExists } = require('./resolve-binary');

/**
 * commandExists(cmd) -> boolean. Is an executable resolvable on PATH?
 *
 * La sonde par defaut ne passe plus par un shell. Elle delegue au resolveur
 * partage (install/lib/resolve-binary.js), qui parcourt le PATH en JavaScript
 * et connait PATHEXT sous Windows. Motif mesure le 2026-08-11 : trois sondes
 * concurrentes coexistaient dans install/ et se contredisaient, et celle-ci
 * lancait un shell pour repondre a une question que le systeme de fichiers
 * suffit a trancher.
 *
 * Le lanceur reste injectable pour les tests qui simulent deja un shell : quand
 * `run` est fourni explicitement, on garde l'ancien chemin.
 */
function commandExists(cmd, { run = null, platform = process.platform, env = process.env } = {}) {
  if (!run) return sharedCommandExists(cmd, { platform, env });
  const probe = platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`;
  try {
    run(probe, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * safeHomedir() -> the home directory, or '' if it cannot be determined. WHY:
 * os.homedir() THROWS on an env with no $HOME/$USERPROFILE AND no passwd entry
 * for the effective uid (distroless / random-uid containers). An optional install
 * helper must never throw on that — it degrades to "no home dir to scan".
 */
function safeHomedir() {
  try {
    return os.homedir();
  } catch {
    return '';
  }
}

/**
 * knownBinDirs() -> ordered list of directories where installers commonly drop a
 * binary that is NOT on a non-login shell's PATH. The canonical case: `cargo
 * install` lands in ~/.cargo/bin, which Debian's apt-packaged cargo does NOT add
 * to PATH — so a freshly built binary is present yet invisible to a bare probe.
 * fs/env/home are injectable for tests. `home` defaults via safeHomedir so a
 * HOME-less environment yields a shorter scan instead of a throw.
 */
function knownBinDirs({ env = process.env, home = safeHomedir(), platform = process.platform } = {}) {
  const dirs = [];
  if (env && env.CARGO_HOME) dirs.push(path.join(env.CARGO_HOME, 'bin'));
  dirs.push(path.join(home, '.cargo', 'bin')); // cargo install
  dirs.push(path.join(home, '.local', 'bin')); // pip/pipx + many curl scripts
  if (platform === 'win32') {
    if (env && env.LOCALAPPDATA) dirs.push(path.join(env.LOCALAPPDATA, 'Programs'));
  } else {
    dirs.push('/usr/local/bin'); // common script target + brew (intel mac)
    dirs.push('/opt/homebrew/bin'); // brew (apple silicon)
    dirs.push('/usr/bin');
  }
  return dirs;
}

/**
 * resolveBinary(name) -> the command to invoke the executable, or null if it
 * cannot be located. Returns the BARE name when it is on PATH (let the shell
 * resolve it), else an ABSOLUTE path found in a knownBinDir. WHY: an optional
 * native install can succeed yet leave the binary off PATH; callers must verify
 * and wire it by its real location, not declare failure. All I/O is injectable.
 */
function resolveBinary(name, {
  has = commandExists,
  existsSync = fs.existsSync,
  env = process.env,
  home = safeHomedir(),
  platform = process.platform,
} = {}) {
  if (has(name)) return name;
  const exe = platform === 'win32' ? `${name}.exe` : name;
  for (const dir of knownBinDirs({ env, home, platform })) {
    const full = path.join(dir, exe);
    try {
      if (existsSync(full)) return full;
    } catch {
      // a stat error on one candidate must not abort the scan
    }
  }
  return null;
}

/**
 * detectPlatform() -> 'mac' | 'windows' | 'linux'. Coarse bucket for choosing an
 * install strategy. Keeps the platform string in ONE place.
 */
function detectPlatform(platform = process.platform) {
  if (platform === 'darwin') return 'mac';
  if (platform === 'win32') return 'windows';
  return 'linux';
}

/**
 * firstAvailable(candidates) -> the first candidate whose `tool` resolves on
 * PATH, or null. `candidates` is an ordered preference list of
 * { id, tool, ... }. This is the generic "pick the installer the machine has"
 * primitive; the concrete strategy list stays with each component.
 */
function firstAvailable(candidates, { has = commandExists } = {}) {
  if (!Array.isArray(candidates)) return null;
  return candidates.find((c) => c && c.tool && has(c.tool)) || null;
}

module.exports = { commandExists, detectPlatform, firstAvailable, knownBinDirs, resolveBinary, safeHomedir };
