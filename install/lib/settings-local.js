/**
 * .claude/settings.local.json management.
 *
 * Claude Code only recognizes a project-scoped (.mcp.json) MCP server once its
 * id is listed in .claude/settings.local.json under `enabledMcpjsonServers`.
 * Without that whitelist the byan MCP server (and any third-party extension) is
 * present in .mcp.json but silently NOT enabled in Claude Code.
 *
 * settings.local.json is gitignored (it also holds the per-machine token env),
 * so this is the right home for the whitelist.
 */

const path = require('path');
const fs = require('fs-extra');

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
 * Idempotently add an MCP server id to enabledMcpjsonServers in
 * .claude/settings.local.json. Creates the file (and .claude/) if absent,
 * preserves any other keys, and never duplicates an id.
 *
 * @param {string} projectRoot
 * @param {string} name - the MCP server id (mcpServers key)
 * @returns {Promise<{ path: string, added: boolean }>}
 */
async function whitelistMcpServer(projectRoot, name) {
  if (!name || typeof name !== 'string') {
    throw new Error('whitelistMcpServer: name must be a non-empty string');
  }
  const filePath = path.join(projectRoot, '.claude', 'settings.local.json');
  await fs.ensureDir(path.dirname(filePath));

  const cfg = await readJsonOrEmpty(filePath);
  const list = Array.isArray(cfg.enabledMcpjsonServers) ? cfg.enabledMcpjsonServers : [];

  let added = false;
  if (!list.includes(name)) {
    list.push(name);
    added = true;
  }
  cfg.enabledMcpjsonServers = list;

  await fs.writeJson(filePath, cfg, { spaces: 2 });
  return { path: filePath, added };
}

module.exports = { whitelistMcpServer };
