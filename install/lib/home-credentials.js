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
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GDOC_TEMPLATE_ID',
  'GDOC_LOGO_PNG_URL',
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
    if (typeof value === 'string' && value.trim() !== '') merged[key] = value;
  }
  const file = credentialsPath(homeDir);
  fs.ensureDirSync(path.dirname(file));
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

module.exports = {
  KNOWN_KEYS,
  credentialsPath,
  readCredentials,
  writeCredentials,
  storedKeys,
};
