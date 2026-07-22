'use strict';

/**
 * HOME CREDENTIALS — the write side of the per-user install memory.
 *
 * The byan MCP server already RESOLVES its config from
 * ~/.byan/credentials.json (env -> file -> default, see
 * _byan/mcp/byan-mcp-server/lib/resolve-config.js). This module is the
 * installer-side counterpart: read what a previous install stored, merge in
 * what the user provides once, and never ask again on the next machine-wide
 * install. os.homedir() covers Linux/macOS/Windows.
 *
 * Guarantees: reading never throws (missing/garbage file -> {}), writing is a
 * merge (unknown keys already in the file are preserved), the file lands with
 * mode 0600 (it holds tokens), and no value is ever logged by this module.
 */

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

// Same key set the MCP server resolver understands — one vocabulary, two sides.
const KNOWN_KEYS = Object.freeze([
  'BYAN_API_URL',
  'BYAN_API_TOKEN',
  'LEANTIME_API_URL',
  'LEANTIME_API_TOKEN',
]);

function credentialsPath(homeDir = os.homedir()) {
  return path.join(homeDir, '.byan', 'credentials.json');
}

/** Read the stored credentials. Missing or invalid file -> {}. */
function readCredentials({ homeDir = os.homedir() } = {}) {
  try {
    const parsed = fs.readJSONSync(credentialsPath(homeDir));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Merge-write: existing keys are kept unless the patch overrides them with a
 * non-empty value. Empty/undefined patch values never erase a stored secret.
 * Returns the merged object actually written.
 */
function writeCredentials(patch, { homeDir = os.homedir() } = {}) {
  const current = readCredentials({ homeDir });
  const merged = { ...current };
  for (const [key, value] of Object.entries(patch || {})) {
    // Only known keys are written from a patch. The patch can reach here from
    // an HTTP body (the web wizard) ; an unknown key would be junk in the
    // secret store. Keys already present in the file are preserved (the spread
    // above), unknown ones just cannot be ADDED by a patch.
    if (!KNOWN_KEYS.includes(key)) continue;
    if (typeof value === 'string' && value.trim() !== '') merged[key] = value;
  }
  const file = credentialsPath(homeDir);
  fs.ensureDirSync(path.dirname(file));
  try {
    fs.chmodSync(path.dirname(file), 0o700); // the dir holds only secrets
  } catch {
    // best-effort (Windows ACLs) — the 0600 file mode below is the real guard
  }
  fs.writeJSONSync(file, merged, { spaces: 2, mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600); // writeJSON mode applies on create only; enforce on rewrite
  } catch {
    // chmod best-effort (e.g. Windows ACLs) — the write itself succeeded
  }
  return merged;
}

/** The keys among KNOWN_KEYS that are present and non-empty in the store. */
function storedKeys({ homeDir = os.homedir() } = {}) {
  const current = readCredentials({ homeDir });
  return KNOWN_KEYS.filter((k) => typeof current[k] === 'string' && current[k].trim() !== '');
}

const GOOGLE_KEYS = Object.freeze([
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GDOC_TEMPLATE_ID',
  'GDOC_LOGO_PNG_URL',
]);

/**
 * Soft-purge: remove Google-specific keys from credentials.json.
 * - If none of the three keys are present, returns { purged: [], backupPath: null }.
 * - Otherwise, creates a dated .bak copy (best-effort, non-blocking), removes
 *   the three keys, rewrites the file at mode 0600, and returns { purged, backupPath }.
 * - Never throws: any error is caught and returned as { purged: [], backupPath: null, error }.
 */
function purgeGoogleKeys({ homeDir = os.homedir() } = {}) {
  try {
    const current = readCredentials({ homeDir });
    const presentKeys = GOOGLE_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(current, k));
    if (presentKeys.length === 0) {
      return { purged: [], backupPath: null };
    }

    // Create a dated backup — best-effort, failure is non-blocking.
    const file = credentialsPath(homeDir);
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const backupPath = `${file}.bak-${today}`;
    let resolvedBackupPath = backupPath;
    try {
      fs.copySync(file, backupPath);
    } catch {
      resolvedBackupPath = null; // backup failed, but we continue
    }

    // Remove Google keys from the object.
    const cleaned = { ...current };
    for (const k of GOOGLE_KEYS) {
      delete cleaned[k];
    }

    // Rewrite at mode 0600.
    fs.ensureDirSync(path.dirname(file));
    fs.writeJSONSync(file, cleaned, { spaces: 2, mode: 0o600 });
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      // chmod best-effort (Windows ACLs)
    }

    return { purged: presentKeys, backupPath: resolvedBackupPath };
  } catch (e) {
    return { purged: [], backupPath: null, error: e.message };
  }
}

module.exports = {
  KNOWN_KEYS,
  GOOGLE_KEYS,
  credentialsPath,
  readCredentials,
  writeCredentials,
  storedKeys,
  purgeGoogleKeys,
};
