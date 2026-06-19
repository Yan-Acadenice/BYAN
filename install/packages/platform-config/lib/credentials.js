/**
 * Global per-user credentials file: ~/.byan/credentials.json.
 *
 * The byan MCP server resolves its config (BYAN_API_URL / BYAN_API_TOKEN /
 * LEANTIME_API_URL / LEANTIME_API_TOKEN) from this file when the matching env
 * var is absent (see _byan/mcp/byan-mcp-server/lib/resolve-config.js). Writing
 * it here with Node fs is cross-shell AND cross-OS: os.homedir() resolves ~ on
 * Unix and %USERPROFILE% on Windows, so a yanstaller install configures the MCP
 * for every shell (zsh/fish/bash) with no profile editing and no reliance on
 * the fragile .mcp.json ${} expansion.
 *
 * The file holds a secret (the token), so it lives OUTSIDE any repo (under the
 * user HOME, never committed) and is chmod 600 on Unix.
 */

const os = require('os');
const path = require('path');
const fs = require('fs-extra');

// Keys the credentials file understands. Any other key passed in is ignored.
const KNOWN_KEYS = ['BYAN_API_URL', 'BYAN_API_TOKEN', 'LEANTIME_API_URL', 'LEANTIME_API_TOKEN'];

function credentialsDir(homedir = os.homedir()) {
  return path.join(homedir, '.byan');
}

function credentialsPath(homedir = os.homedir()) {
  return path.join(credentialsDir(homedir), 'credentials.json');
}

// A value worth persisting: a non-empty string that is NOT an unexpanded
// ${..} placeholder (persisting a placeholder would defeat the whole point).
function usable(v) {
  return typeof v === 'string' && v.trim().length > 0 && !/^\$\{.+\}$/.test(v.trim());
}

/**
 * Read the credentials file. Missing file or invalid JSON yields {} -- never
 * throws, so a first run or a corrupted file does not break the installer.
 *
 * @param {string} [homedir=os.homedir()]
 * @returns {Promise<object>}
 */
async function readCredentials(homedir = os.homedir()) {
  try {
    const data = await fs.readJson(credentialsPath(homedir));
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

/**
 * Merge-write the global credentials file. Only the known, usable keys in
 * `values` are written; existing keys are preserved (idempotent: re-running
 * with the same values leaves the content unchanged). The directory is created
 * if absent and the file is chmod 600 on Unix (best-effort: a platform without
 * POSIX modes, e.g. Windows, swallows the chmod rather than failing the install).
 *
 * @param {object} values  subset of KNOWN_KEYS -> string
 * @param {{ homedir?: string }} [opts]
 * @returns {Promise<{ path: string, written: string[] }>}
 */
async function writeCredentials(values = {}, opts = {}) {
  const homedir = opts.homedir || os.homedir();
  const dir = credentialsDir(homedir);
  const file = credentialsPath(homedir);

  const current = await readCredentials(homedir);
  const next = { ...current };
  const written = [];
  for (const key of KNOWN_KEYS) {
    if (usable(values[key])) {
      next[key] = values[key];
      written.push(key);
    }
  }

  await fs.mkdirp(dir);
  // Create restrictively AT THE SOURCE: the `mode` option makes a NEW file land
  // at 0600 directly, closing the TOCTOU window where a write-then-chmod would
  // expose the token at the umask default (0644, group/other-readable) between
  // the two syscalls. `mode` only applies when the file is created, so the
  // chmod below still runs to tighten a pre-existing file on overwrite.
  await fs.writeFile(file, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  try {
    await fs.chmod(file, 0o600);
  } catch {
    // POSIX modes unsupported (e.g. Windows / exotic FS): the file is still
    // written, just without the 600 tightening. Do not fail the install.
  }
  return { path: file, written };
}

module.exports = {
  writeCredentials,
  readCredentials,
  credentialsPath,
  credentialsDir,
  KNOWN_KEYS,
};
