/**
 * VSCode Copilot Extension Platform Support
 * 
 * Detects and installs agents for VSCode Copilot Extension.
 * Same format as Copilot CLI.
 * 
 * @module platforms/vscode
 */

const copilotCli = require('./copilot-cli');

const PLATFORM_NAME = 'VSCode Copilot Extension';

/**
 * Detect if VSCode with Copilot extension is installed
 * 
 * @returns {Promise<boolean>}
 */
async function detect() {
  // VSCode uses same stub format as Copilot CLI
  return copilotCli.detect();
}

/**
 * Install agents for VSCode
 * 
 * @param {string} projectRoot - Project root directory
 * @param {string[]} agents - Agent names to install
 * @param {Object} config - Installation config
 * @returns {Promise<{success: boolean, installed: number}>}
 */
async function install(projectRoot, agents, config) {
  // Reuse Copilot CLI installation (same format)
  return copilotCli.install(projectRoot, agents, config);
}

/**
 * Get platform installation path
 * 
 * @returns {string}
 */
function getPath() {
  return copilotCli.getPath();
}

module.exports = {
  name: PLATFORM_NAME,
  detect,
  install,
  getPath
};
