/**
 * Claude Code Platform Support
 * 
 * Detects and installs MCP server config for Claude Code.
 * 
 * @module platforms/claude-code
 */

const path = require('path');
const os = require('os');
const fileUtils = require('../utils/file-utils');

const PLATFORM_NAME = 'Claude Code';

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
 * @param {string} projectRoot - Project root directory
 * @param {string[]} agents - Agent names to install
 * @param {Object} config - Installation config
 * @returns {Promise<{success: boolean, installed: number}>}
 */
async function install(projectRoot, agents, config) {
  const configPath = getConfigPath();
  
  if (!configPath) {
    throw new Error(`Unsupported platform: ${os.platform()}`);
  }
  
  // TODO: Update claude_desktop_config.json to add MCP server
  // MCP server will expose BYAN agents
  
  return {
    success: true,
    installed: agents.length
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
