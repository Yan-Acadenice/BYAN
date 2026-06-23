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

/**
 * commandExists(cmd) -> boolean. Is an executable resolvable on PATH?
 * Uses POSIX `command -v` (and `where` on Windows). The runner is injectable.
 */
function commandExists(cmd, { run = execSync, platform = process.platform } = {}) {
  const probe = platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`;
  try {
    run(probe, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
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

module.exports = { commandExists, detectPlatform, firstAvailable };
