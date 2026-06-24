// F1 -- portable config resolver for the byan MCP server.
//
// The server must NOT depend on how it was launched. `.mcp.json` ${VAR}
// expansion is resolved by the launcher (Claude Code / Codex / shell) and is
// fragile: a var absent from the launch environment reaches the process as the
// literal "${BYAN_API_URL}", which breaks every byan_web call. Codex has no
// `.mcp.json` at all. So the server owns its resolution here, with precedence:
//
//   process.env (a real value) -> ~/.byan/credentials.json -> default
//
// env wins so a prod sidecar / Docker / CI that sets BYAN_API_URL in the real
// environment keeps working. The per-user global file is the fallback the
// yanstaller writes (F3). os.homedir() is cross-OS (~ on Unix, %USERPROFILE%
// on Windows), so this works on zsh/fish/bash x Linux/Windows/macOS with zero
// shell dependency.
//
// Hard guarantees: never throws at boot (a missing or garbage file degrades to
// defaults), and never logs a secret.

import fs from 'node:fs';
import os from 'node:os';
import nodePath from 'node:path';

// Default API URL when nothing resolves (local dev). Mirrors the historical
// `process.env.BYAN_API_URL || 'http://localhost:3737'` default.
const DEFAULT_API_URL = 'http://localhost:3737';

// Keys the resolver understands. BYAN_API_URL is the only one with a non-empty
// default; tokens, the optional Leantime URL, and the optional Google Docs
// publish config (service-account key path, template id, logo URL) stay empty
// when unset.
const KEYS = [
  'BYAN_API_URL',
  'BYAN_API_TOKEN',
  'LEANTIME_API_URL',
  'LEANTIME_API_TOKEN',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GDOC_TEMPLATE_ID',
  'GDOC_LOGO_PNG_URL',
];

/**
 * An unexpanded `${...}` placeholder is NOT a real value. It is what a launcher
 * passes verbatim when it could not expand the variable (the exact bug this
 * module repairs). Treat such a value as absent so resolution falls through.
 * @param {*} v
 * @returns {boolean}
 */
function isUnexpandedPlaceholder(v) {
  return typeof v === 'string' && /^\$\{.+\}$/.test(v.trim());
}

// A usable string value: present, non-empty after trim, not a placeholder.
function usable(v) {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  if (isUnexpandedPlaceholder(trimmed)) return undefined;
  return v;
}

/**
 * Absolute path to the global per-user credentials file.
 * @param {string} [homedir=os.homedir()]
 * @returns {string}
 */
function credentialsPath(homedir = os.homedir()) {
  return nodePath.join(homedir, '.byan', 'credentials.json');
}

// Read + parse the credentials file. Any failure (missing file, unreadable,
// invalid JSON, non-object) yields {} -- the server must boot regardless.
function readCredentialsFile(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Resolve the byan MCP server config along the precedence chain.
 * @param {object} [opts]
 * @param {object} [opts.env]             defaults to process.env
 * @param {string} [opts.homedir]         defaults to os.homedir()
 * @param {string} [opts.credentialsPath] override the file path (tests)
 * @returns {{BYAN_API_URL:string, BYAN_API_TOKEN:string, LEANTIME_API_URL:string, LEANTIME_API_TOKEN:string}}
 */
function resolveConfig(opts = {}) {
  const env = opts.env || process.env;
  const homedir = opts.homedir || os.homedir();
  const file = readCredentialsFile(opts.credentialsPath || credentialsPath(homedir));

  const out = {};
  for (const key of KEYS) {
    out[key] = usable(env[key]) ?? usable(file[key]);
  }

  // Apply defaults: only the URL gets localhost; the rest collapse to ''.
  out.BYAN_API_URL = out.BYAN_API_URL || DEFAULT_API_URL;
  out.BYAN_API_TOKEN = out.BYAN_API_TOKEN || '';
  out.LEANTIME_API_URL = out.LEANTIME_API_URL || '';
  out.LEANTIME_API_TOKEN = out.LEANTIME_API_TOKEN || '';
  out.GOOGLE_APPLICATION_CREDENTIALS = out.GOOGLE_APPLICATION_CREDENTIALS || '';
  out.GDOC_TEMPLATE_ID = out.GDOC_TEMPLATE_ID || '';
  out.GDOC_LOGO_PNG_URL = out.GDOC_LOGO_PNG_URL || '';
  return out;
}

export { resolveConfig, credentialsPath, isUnexpandedPlaceholder, DEFAULT_API_URL };
