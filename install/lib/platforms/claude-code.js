/**
 * Claude Code Platform Support
 * 
 * Detects and installs MCP server config for Claude Code.
 * Uses agent Claude for native integration via MCP protocol.
 * 
 * @module platforms/claude-code
 */

const path = require('path');
const os = require('os');
const fileUtils = require('../utils/file-utils');
const logger = require('../utils/logger');
// Single source of truth for the byan + byan-channel entry shape: the same pure
// merge the canonical .mcp.json writer uses (READ-MERGE-WRITE, relative paths,
// no secret, byan-channel inert). installDirectMCP delegates to it instead of
// hand-building a divergent entry with an absolute path that overwrote siblings.
const { mcpConfig } = require('byan-platform-config');

const PLATFORM_NAME = 'Claude Code';
// Relative path discipline: the byan server entry args[0] is repo-relative
// (mcpConfig.MCP_SERVER_REL_PATH), NEVER an absolute path. The old
// MCP_SERVER_FILENAME ('byan-mcp-server.js') was both the wrong filename and
// joined into an absolute path; both are gone. Kept only as the existence probe
// target below is the real server file under the relative path.
const MCP_SERVER_REL_PATH = mcpConfig.MCP_SERVER_REL_PATH;

/**
 * Get config path for current platform
 * 
 * @returns {string|null}
 */
function getConfigPath() {
  const platform = os.platform();
  const home = os.homedir();
  
  switch (platform) {
    case 'darwin':
      return path.join(home, 'Library/Application Support/Claude/claude_desktop_config.json');
    case 'win32':
      return path.join(home, 'AppData/Roaming/Claude/claude_desktop_config.json');
    case 'linux':
      return path.join(home, '.config/Claude/claude_desktop_config.json');
    default:
      return null;
  }
}

/**
 * Detect if Claude Code is installed
 * 
 * @returns {Promise<boolean>}
 */
async function detect() {
  const configPath = getConfigPath();
  if (!configPath) return false;
  
  return fileUtils.exists(configPath);
}

/**
 * Install MCP server config for Claude Code
 * 
 * Delegates to agent Claude for native integration.
 * Falls back to basic JSON update if agent unavailable.
 * 
 * @param {string} projectRoot - Project root directory
 * @param {string[]} agents - Agent names to install
 * @param {Object} config - Installation config
 * @param {Object} [options] - Installation options
 * @param {string} [options.specialist] - Specialist agent to use (e.g., 'claude')
 * @param {boolean} [options.useAgent] - Use specialist agent if available (default: true)
 * @returns {Promise<{success: boolean, installed: number, method: string}>}
 */
async function install(projectRoot, agents, config, options = {}) {
  const configPath = getConfigPath();
  
  if (!configPath) {
    throw new Error(`Unsupported platform: ${os.platform()}`);
  }
  
  const useAgent = options.useAgent !== false && options.specialist === 'claude';
  
  if (useAgent) {
    logger.info('Using agent Claude for native MCP integration...');
    return await installViaClaudeAgent(projectRoot, agents, config);
  } else {
    logger.info('Using direct MCP configuration...');
    return await installDirectMCP(projectRoot, agents, config);
  }
}

/**
 * Install via agent Claude (native integration)
 * 
 * @param {string} projectRoot
 * @param {string[]} agents
 * @param {Object} config
 * @returns {Promise<{success: boolean, installed: number, method: string}>}
 */
async function installViaClaudeAgent(projectRoot, agents, config) {
  const agentLauncher = require('../yanstaller/agent-launcher');
  
  // Check if native launch is available
  if (agentLauncher.supportsNativeLaunch('claude')) {
    logger.info('\nLaunching agent Claude for MCP integration...');
    
    // Launch agent Claude with create-mcp-server action
    const result = await agentLauncher.launch({
      agent: 'claude',
      platform: 'claude',
      prompt: 'create-mcp-server'
    });
    
    if (result.success) {
      return {
        success: true,
        installed: agents.length,
        method: 'agent-claude-native'
      };
    } else {
      logger.warn(`Native launch failed: ${result.error}`);
      logger.info('Falling back to manual instructions...');
    }
  }
  
  // Fallback: Manual instructions
  logger.info('\nTo complete Claude Code integration:');
  logger.info('   1. Run: @bmad-agent-claude');
  logger.info('   2. Select option 1: Create MCP server for BYAN agents');
  logger.info('   3. Follow the guided setup\n');
  
  return {
    success: true,
    installed: agents.length,
    method: 'agent-claude-guided'
  };
}

/**
 * Install via direct MCP config update
 * 
 * @param {string} projectRoot
 * @param {string[]} agents
 * @param {Object} config
 * @returns {Promise<{success: boolean, installed: number, method: string}>}
 */
async function installDirectMCP(projectRoot, agents, config) {
  const configPath = getConfigPath();
  // Existence probe against the REAL server file at its repo-relative path
  // (resolved to absolute only for the fs check). The args written into the
  // config below stay relative — see mcpConfig.MCP_SERVER_REL_PATH.
  const mcpServerPath = path.join(projectRoot, MCP_SERVER_REL_PATH);

  // Check if MCP server exists
  if (!await fileUtils.exists(mcpServerPath)) {
    logger.warn(`MCP server not found at: ${mcpServerPath}`);
    logger.warn('Run @bmad-agent-claude to generate MCP server first.');

    return {
      success: false,
      installed: 0,
      method: 'direct-mcp-failed'
    };
  }

  // Backup existing config
  const backupPath = `${configPath}.backup`;
  await fileUtils.copy(configPath, backupPath);
  logger.info(`Backed up config to: ${backupPath}`);

  // READ-MERGE-WRITE through the shared pure merge so this writer is byte-for-byte
  // identical to the canonical .mcp.json writer: relative server path, no secret,
  // existing mcpServers.* preserved, and the inert byan-channel entry added.
  // apiUrl is irrelevant to the entry shape (the server resolves its own config),
  // but the merge signature accepts it; a localhost placeholder keeps it valid.
  const existingConfig = await fileUtils.readJson(configPath);
  const merged = mcpConfig.mergeByanEntry(existingConfig, { apiUrl: 'http://localhost:3737' });

  // Write updated config
  await fileUtils.writeJson(configPath, merged, { spaces: 2 });
  logger.info(`Updated MCP config: ${configPath}`);

  return {
    success: true,
    installed: agents.length,
    method: 'direct-mcp'
  };
}

/**
 * Get platform installation path
 * 
 * @returns {string}
 */
function getPath() {
  return getConfigPath() || 'unknown';
}

module.exports = {
  name: PLATFORM_NAME,
  detect,
  install,
  getPath
};
