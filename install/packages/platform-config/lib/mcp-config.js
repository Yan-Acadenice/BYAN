/**
 * .mcp.json management.
 *
 * READ-MERGE-WRITE semantics : preserves all existing mcpServers.* entries
 * and, if byan entry already exists, preserves its command/args. Only the
 * env.BYAN_API_URL is authoritative from caller.
 *
 * Security: BYAN_API_TOKEN is NEVER written into .mcp.json (which is
 * checked into git). The token lives exclusively in:
 *   - .env (gitignored, for shell tools and Codex CLI)
 *   - .claude/settings.local.json (gitignored, for Claude Code MCP injection)
 *
 * Claude Code reads .claude/settings.local.json's "env" block at startup and
 * injects those vars into every MCP server it spawns. So the token reaches
 * the byan MCP server via that channel — no need to declare it in .mcp.json.
 *
 * The `token` parameter on this module's API is kept for backward-compat
 * but is intentionally discarded (with a one-line audit trail in the
 * returned result). Callers that supply a token should instead use
 * envConfig.updateDotenv + envConfig.updateSettingsLocal.
 */

const path = require('path');
const fs = require('fs-extra');
const { stripApiSuffix } = require('./url-utils');

const MCP_SERVER_REL_PATH = '_byan/mcp/byan-mcp-server/server.js';
const TOKEN_PLACEHOLDER = '${BYAN_API_TOKEN}';
const LEANTIME_URL_PLACEHOLDER = '${LEANTIME_API_URL}';
const LEANTIME_TOKEN_PLACEHOLDER = '${LEANTIME_API_TOKEN}';

async function readJsonOrEmpty(filePath) {
  if (await fs.pathExists(filePath)) {
    try {
      return await fs.readJson(filePath);
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Reads the project's .mcp.json.
 *
 * @param {string} projectRoot
 * @returns {Promise<object|null>} parsed config or null if missing/malformed.
 */
async function readMcpConfig(projectRoot) {
  const filePath = path.join(projectRoot, '.mcp.json');
  if (!(await fs.pathExists(filePath))) return null;
  try {
    return await fs.readJson(filePath);
  } catch {
    return null;
  }
}

/**
 * Pure merge — no I/O. Returns a new config object with byan entry merged.
 * Useful for migrations that inspect the diff before writing.
 *
 * BYAN_API_TOKEN is intentionally stripped from env (never written into
 * .mcp.json). See module header for the rationale and the persistence path.
 *
 * @param {object} existingConfig — current parsed config (may be {} or {mcpServers:{...}})
 * @param {{ apiUrl: string, token?: string }} opts — `token` is accepted but discarded
 * @returns {object} new merged config
 */
function mergeByanEntry(existingConfig, { apiUrl } = {}) {
  const cfg = existingConfig && typeof existingConfig === 'object' ? { ...existingConfig } : {};
  cfg.mcpServers = { ...(cfg.mcpServers || {}) };

  const existing = cfg.mcpServers.byan || {};
  const cleanUrl = stripApiSuffix(apiUrl);

  const env = { ...(existing.env || {}) };
  env.BYAN_API_URL = cleanUrl;
  delete env.BYAN_API_TOKEN;

  cfg.mcpServers.byan = {
    command: 'node',
    args: [MCP_SERVER_REL_PATH],
    ...existing,
    env,
  };

  return cfg;
}

/**
 * Ensures .mcp.json exists with a valid byan entry. READ-MERGE-WRITE.
 *
 * @param {string} projectRoot
 * @param {{ apiUrl: string, token?: string }} opts
 * @returns {Promise<{ path: string }>}
 */
async function ensureMcpConfig(projectRoot, { apiUrl, token } = {}) {
  const filePath = path.join(projectRoot, '.mcp.json');
  const current = await readJsonOrEmpty(filePath);
  const merged = mergeByanEntry(current, { apiUrl, token });
  await fs.writeJson(filePath, merged, { spaces: 2 });
  return { path: filePath };
}

/**
 * Pure merge — no I/O. Adds the Leantime env-var REFERENCES to the byan
 * server entry so the MCP server receives LEANTIME_API_URL / LEANTIME_API_TOKEN
 * at spawn time via env-var expansion.
 *
 * Security: the values written are the literal expansion placeholders
 * `${LEANTIME_API_URL}` / `${LEANTIME_API_TOKEN}` — NOT the secret. The real
 * token lives only in .env / .claude/settings.local.json (gitignored). The
 * placeholder strings do not match any token shape, so the anti-secret guard
 * is never tripped.
 *
 * Existing env keys (e.g. BYAN_API_URL) are preserved. If the byan entry does
 * not exist yet, a minimal one is created so the refs are not dropped on a
 * fresh install.
 *
 * @param {object} existingConfig — current parsed config
 * @returns {object} new merged config
 */
function mergeLeantimeRefs(existingConfig) {
  const cfg = existingConfig && typeof existingConfig === 'object' ? { ...existingConfig } : {};
  cfg.mcpServers = { ...(cfg.mcpServers || {}) };

  const existing = cfg.mcpServers.byan || {};
  const env = { ...(existing.env || {}) };
  env.LEANTIME_API_URL = LEANTIME_URL_PLACEHOLDER;
  env.LEANTIME_API_TOKEN = LEANTIME_TOKEN_PLACEHOLDER;

  cfg.mcpServers.byan = {
    command: 'node',
    args: [MCP_SERVER_REL_PATH],
    ...existing,
    env,
  };

  return cfg;
}

/**
 * Ensures the byan entry in .mcp.json carries the Leantime env-var references.
 * READ-MERGE-WRITE. Idempotent : re-running leaves the refs unchanged.
 *
 * @param {string} projectRoot
 * @returns {Promise<{ path: string }>}
 */
async function ensureLeantimeRefs(projectRoot) {
  const filePath = path.join(projectRoot, '.mcp.json');
  const current = await readJsonOrEmpty(filePath);
  const merged = mergeLeantimeRefs(current);
  await fs.writeJson(filePath, merged, { spaces: 2 });
  return { path: filePath };
}

/**
 * Adds (or replaces) an arbitrary MCP server entry under mcpServers.<name>.
 * Used by mcp-extensions to register third-party MCPs (gdrive, etc.) without
 * touching the byan entry. Other entries are preserved.
 *
 * Security guard : refuses to write any value matching common token shapes
 * directly into .mcp.json. Callers must put secrets in .env / settings.local
 * and reference env-var names elsewhere.
 *
 * @param {string} projectRoot
 * @param {string} name — server identifier (becomes the mcpServers key)
 * @param {object} entry — { command, args?, env?, ... }
 * @returns {Promise<{ path: string }>}
 */
async function addMcpEntry(projectRoot, name, entry) {
  if (!name || typeof name !== 'string') {
    throw new Error('addMcpEntry: name must be a non-empty string');
  }
  if (!entry || typeof entry !== 'object') {
    throw new Error('addMcpEntry: entry must be an object');
  }
  assertNoSecretInEntry(entry);

  const filePath = path.join(projectRoot, '.mcp.json');
  const current = await readJsonOrEmpty(filePath);
  const cfg = current && typeof current === 'object' ? { ...current } : {};
  cfg.mcpServers = { ...(cfg.mcpServers || {}) };
  cfg.mcpServers[name] = entry;
  await fs.writeJson(filePath, cfg, { spaces: 2 });
  return { path: filePath };
}

/**
 * Removes an MCP server entry. No-op if the entry does not exist.
 *
 * @param {string} projectRoot
 * @param {string} name
 * @returns {Promise<{ path: string, removed: boolean }>}
 */
async function removeMcpEntry(projectRoot, name) {
  const filePath = path.join(projectRoot, '.mcp.json');
  const current = await readJsonOrEmpty(filePath);
  if (!current || !current.mcpServers || !(name in current.mcpServers)) {
    return { path: filePath, removed: false };
  }
  const cfg = { ...current, mcpServers: { ...current.mcpServers } };
  delete cfg.mcpServers[name];
  await fs.writeJson(filePath, cfg, { spaces: 2 });
  return { path: filePath, removed: true };
}

const SECRET_SHAPES = [
  /^byan_[a-f0-9]{20,}$/i,                  // byan tokens
  /^lt_[A-Za-z0-9]{20,}$/,                  // Leantime API key
  /^ghp_[A-Za-z0-9]{30,}$/,                 // GitHub PAT
  /^gho_[A-Za-z0-9]{30,}$/,                 // GitHub OAuth
  /^github_pat_[A-Za-z0-9_]{60,}$/,         // GitHub PAT (new format)
  /^sk-ant-[A-Za-z0-9_-]{20,}$/,            // Anthropic
  /^sk-proj-[A-Za-z0-9_-]{20,}$/,           // OpenAI project
  /^AIza[0-9A-Za-z_-]{30,}$/,               // Google API key
  /^xox[bpao]-[0-9]+-[0-9]+-/,              // Slack
  /^AKIA[0-9A-Z]{16}$/,                     // AWS
];

function looksLikeSecret(value) {
  if (typeof value !== 'string') return false;
  return SECRET_SHAPES.some((re) => re.test(value));
}

function assertNoSecretInEntry(entry) {
  const env = (entry && entry.env) || {};
  for (const [key, val] of Object.entries(env)) {
    if (looksLikeSecret(val)) {
      throw new Error(
        `addMcpEntry: env.${key} looks like a secret. Refusing to write it into .mcp.json. ` +
          `Put the value in .env (gitignored) and reference it via .claude/settings.local.json env, ` +
          `or use \${VAR_NAME} if your MCP client supports env-var expansion.`
      );
    }
  }
}

module.exports = {
  ensureMcpConfig,
  readMcpConfig,
  mergeByanEntry,
  mergeLeantimeRefs,
  ensureLeantimeRefs,
  addMcpEntry,
  removeMcpEntry,
  looksLikeSecret,
  MCP_SERVER_REL_PATH,
  TOKEN_PLACEHOLDER,
  LEANTIME_URL_PLACEHOLDER,
  LEANTIME_TOKEN_PLACEHOLDER,
};
