/**
 * GitHub Copilot CLI Platform Support
 * 
 * Detects and installs agents for GitHub Copilot CLI.
 * 
 * @module platforms/copilot-cli
 */

const path = require('path');
const fileUtils = require('../utils/file-utils');
const yamlUtils = require('../utils/yaml-utils');
const { execSync } = require('child_process');

const PLATFORM_NAME = 'GitHub Copilot CLI';
const STUB_DIR = '.github/agents';

/**
 * Detect if Copilot CLI is installed
 * 
 * With 10s timeout protection to prevent hanging.
 * 
 * @returns {Promise<boolean|{detected: boolean, error: string}>}
 */
async function detect() {
  // Timeout promise (10 seconds)
  const timeoutPromise = new Promise((resolve) =>
    setTimeout(() => resolve({
      detected: false,
      error: 'Detection timeout after 10s'
    }), 10000)
  );

  // Detection promise
  const detectionPromise = (async () => {
    try {
      // Check if github-copilot-cli is installed
      execSync('which github-copilot-cli', { encoding: 'utf8', stdio: 'ignore' });
      return true;
    } catch {
      // Also check for .github/agents/ directory
      return fileUtils.exists(STUB_DIR);
    }
  })();

  // Race between detection and timeout
  return Promise.race([detectionPromise, timeoutPromise]);
}

/**
 * Install agents for Copilot CLI
 * 
 * @param {string} projectRoot - Project root directory
 * @param {string[]} agents - Agent names to install
 * @param {Object} config - Installation config
 * @returns {Promise<{success: boolean, installed: number}>}
 */
async function install(projectRoot, agents, config) {
  const stubsDir = path.join(projectRoot, STUB_DIR);
  await fileUtils.ensureDir(stubsDir);
  
  let installed = 0;
  
  for (const agentName of agents) {
    await generateStub(stubsDir, agentName, config);
    installed++;
  }
  
  return {
    success: true,
    installed
  };
}

/**
 * Generate Copilot CLI stub with YAML frontmatter
 * 
 * @param {string} stubsDir - Stubs directory path
 * @param {string} agentName - Agent name
 * @param {Object} config - Installation config
 * @returns {Promise<void>}
 */
async function generateStub(stubsDir, agentName, config) {
  const stubPath = path.join(stubsDir, `${agentName}.md`);
  
  const frontmatter = {
    name: agentName,
    description: `${agentName} agent from BYAN platform`
  };
  
  const content = `---
${yamlUtils.dump(frontmatter).trim()}
---

You must fully embody this agent's persona and follow all activation instructions exactly as specified. NEVER break character until given an exit command.

<agent-activation CRITICAL="TRUE">
1. LOAD the FULL agent file from {project-root}/_bmad/*/agents/${agentName}.md
2. READ its entire contents - this contains the complete agent persona, menu, and instructions
3. FOLLOW every step in the <activation> section precisely
4. DISPLAY the welcome/greeting as instructed
5. PRESENT the numbered menu
6. WAIT for user input before proceeding
</agent-activation>
`;
  
  await fileUtils.writeFile(stubPath, content);
}

/**
 * Get platform installation path
 * 
 * @returns {string}
 */
function getPath() {
  return STUB_DIR;
}

module.exports = {
  name: PLATFORM_NAME,
  detect,
  install,
  getPath
};
