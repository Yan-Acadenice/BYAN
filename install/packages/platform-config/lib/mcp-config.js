/**
 * .mcp.json management.
 *
 * READ-MERGE-WRITE semantics : preserves all existing mcpServers.* entries
 * and, if byan entry already exists, preserves its command/args. Only the
 * env.BYAN_API_URL and env.BYAN_API_TOKEN are authoritative from caller.
 */

const path = require('path');
const fs = require('fs-extra');
const { stripApiSuffix } = require('./url-utils');

const MCP_SERVER_REL_PATH = '_byan/mcp/byan-mcp-server/server.js';

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
 * @param {object} existingConfig — current parsed config (may be {} or {mcpServers:{...}})
 * @param {{ apiUrl: string, token?: string }} opts
 * @returns {object} new merged config
 */
function mergeByanEntry(existingConfig, { apiUrl, token } = {}) {
  const cfg = existingConfig && typeof existingConfig === 'object' ? { ...existingConfig } : {};
  cfg.mcpServers = { ...(cfg.mcpServers || {}) };

  const existing = cfg.mcpServers.byan || {};
  const cleanUrl = stripApiSuffix(apiUrl);

  const env = { ...(existing.env || {}) };
  env.BYAN_API_URL = cleanUrl;
  if (token && typeof token === 'string' && token.length > 0) {
    env.BYAN_API_TOKEN = token;
  } else {
    delete env.BYAN_API_TOKEN;
  }

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

module.exports = {
  ensureMcpConfig,
  readMcpConfig,
  mergeByanEntry,
  MCP_SERVER_REL_PATH,
};
