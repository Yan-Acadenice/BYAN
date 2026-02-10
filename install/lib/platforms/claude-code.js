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

const PLATFORM_NAME = 'Claude Code';
const MCP_SERVER_FILENAME = 'byan-mcp-server.js';

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
    return await installViaCopilotAgent(projectRoot, agents, config);
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
async function installViaCopilotAgent(projectRoot, agents, config) {
  // TODO: Launch @bmad-agent-claude with automated workflow
  // For now, return instruction to user
  
  logger.info('\n📝 To complete Claude Code integration:');
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
  const mcpServerPath = path.join(projectRoot, MCP_SERVER_FILENAME);
  
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
  
  // Read and update config
  const existingConfig = await fileUtils.readJson(configPath);
  existingConfig.mcpServers = existingConfig.mcpServers || {};
  
  existingConfig.mcpServers.byan = {
    command: 'node',
    args: [mcpServerPath],
    env: {
      PROJECT_ROOT: projectRoot
    }
  };
  
  // Write updated config
  await fileUtils.writeJson(configPath, existingConfig, { spaces: 2 });
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
