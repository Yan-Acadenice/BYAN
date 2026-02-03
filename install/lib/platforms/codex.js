/**
 * Codex Platform Support
 * 
 * Detects and installs agents for Codex.
 * 
 * @module platforms/codex
 */

const path = require('path');
const fileUtils = require('../utils/file-utils');

const PLATFORM_NAME = 'Codex';
const PROMPTS_DIR = '.codex/prompts';

/**
 * Detect if Codex is configured
 * 
 * @returns {Promise<boolean>}
 */
async function detect() {
  // Check if .codex/prompts/ directory exists
  return fileUtils.exists(PROMPTS_DIR);
}

/**
 * Install agents for Codex
 * 
 * @param {string} projectRoot - Project root directory
 * @param {string[]} agents - Agent names to install
 * @param {Object} config - Installation config
 * @returns {Promise<{success: boolean, installed: number}>}
 */
async function install(projectRoot, agents, config) {
  const promptsDir = path.join(projectRoot, PROMPTS_DIR);
  await fileUtils.ensureDir(promptsDir);
  
  let installed = 0;
  
  for (const agentName of agents) {
    await generatePrompt(promptsDir, agentName, config);
    installed++;
  }
  
  return {
    success: true,
    installed
  };
}

/**
 * Generate Codex prompt file
 * 
 * @param {string} promptsDir - Prompts directory path
 * @param {string} agentName - Agent name
 * @param {Object} config - Installation config
 * @returns {Promise<void>}
 */
async function generatePrompt(promptsDir, agentName, config) {
  const promptPath = path.join(promptsDir, `${agentName}.md`);
  
  const content = `# ${agentName} Agent

You must fully embody this agent's persona and follow all activation instructions exactly as specified.

<agent-activation CRITICAL="TRUE">
1. LOAD the FULL agent file from {project-root}/_bmad/*/agents/${agentName}.md
2. READ its entire contents - this contains the complete agent persona, menu, and instructions
3. FOLLOW every step in the <activation> section precisely
4. DISPLAY the welcome/greeting as instructed
5. PRESENT the numbered menu
6. WAIT for user input before proceeding
</agent-activation>
`;
  
  await fileUtils.writeFile(promptPath, content);
}

/**
 * Get platform installation path
 * 
 * @returns {string}
 */
function getPath() {
  return PROMPTS_DIR;
}

module.exports = {
  name: PLATFORM_NAME,
  detect,
  install,
  getPath
};
