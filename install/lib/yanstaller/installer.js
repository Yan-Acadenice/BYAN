/**
 * INSTALLER Module
 * 
 * Installs BYAN agents across multiple platforms.
 * Most complex module: 56h development.
 * 
 * Phase 3: 56h development
 * 
 * @module yanstaller/installer
 */

const path = require('path');
const fileUtils = require('../utils/file-utils');
const logger = require('../utils/logger');

/**
 * @typedef {Object} InstallConfig
 * @property {string} mode - 'full' | 'minimal' | 'custom'
 * @property {string[]} agents - Agent names to install
 * @property {string} userName - User's name
 * @property {string} language - 'Francais' | 'English'
 * @property {string[]} targetPlatforms - Platforms to install on
 * @property {string} outputFolder - Output folder path
 * @property {string} projectRoot - Project root directory
 */

/**
 * @typedef {Object} InstallResult
 * @property {boolean} success
 * @property {number} agentsInstalled - Number of agents installed
 * @property {string[]} platforms - Platforms installed on
 * @property {string[]} errors - Installation errors
 * @property {number} duration - Duration in ms
 */

/**
 * Install BYAN agents
 * 
 * @param {InstallConfig} config - Installation configuration
 * @returns {Promise<InstallResult>}
 */
async function install(config) {
  const startTime = Date.now();
  const errors = [];
  let agentsInstalled = 0;
  
  try {
    logger.info(`Installing ${config.agents.length} agents in ${config.mode} mode...`);
    
    // 1. Create _bmad/ structure
    logger.info('Creating _bmad/ directory structure...');
    await createBmadStructure(config.projectRoot);
    
    // 2. Copy agent files from templates/
    logger.info('Copying agent files...');
    for (const agentName of config.agents) {
      try {
        await copyAgentFile(agentName, config.projectRoot);
        agentsInstalled++;
        logger.info(`  ✓ ${agentName}`);
      } catch (error) {
        errors.push(`Failed to install ${agentName}: ${error.message}`);
        logger.warn(`  ✗ ${agentName} - ${error.message}`);
      }
    }
    
    // 3. Generate platform-specific stubs
    logger.info('Generating platform stubs...');
    for (const platform of config.targetPlatforms) {
      try {
        await generatePlatformStubs(platform, config);
        logger.info(`  ✓ ${platform}`);
      } catch (error) {
        errors.push(`Failed to generate ${platform} stubs: ${error.message}`);
        logger.warn(`  ✗ ${platform} - ${error.message}`);
      }
    }
    
    // 4. Create config files
    logger.info('Creating configuration files...');
    await createModuleConfig('bmb', config, config.projectRoot);
    
    const success = errors.length === 0;
    
    return {
      success,
      agentsInstalled,
      platforms: config.targetPlatforms,
      errors,
      duration: Date.now() - startTime
    };
  } catch (error) {
    errors.push(error.message);
    return {
      success: false,
      agentsInstalled,
      platforms: [],
      errors,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Create _bmad/ directory structure
 * 
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<void>}
 */
async function createBmadStructure(projectRoot) {
  const directories = [
    '_bmad',
    '_bmad/_config',
    '_bmad/_memory',
    '_bmad/_output',
    '_bmad/core',
    '_bmad/core/agents',
    '_bmad/core/workflows',
    '_bmad/bmm',
    '_bmad/bmm/agents',
    '_bmad/bmm/workflows',
    '_bmad/bmb',
    '_bmad/bmb/agents',
    '_bmad/bmb/workflows',
    '_bmad/tea',
    '_bmad/tea/agents',
    '_bmad/tea/workflows',
    '_bmad/cis',
    '_bmad/cis/agents',
    '_bmad/cis/workflows'
  ];
  
  for (const dir of directories) {
    const dirPath = path.join(projectRoot, dir);
    await fileUtils.ensureDir(dirPath);
  }
}

/**
 * Copy agent file from template
 * 
 * @param {string} agentName - Agent name
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<void>}
 */
async function copyAgentFile(agentName, projectRoot) {
  // Template base path
  const templateBase = path.join(__dirname, '../../templates/_bmad');
  
  // Search for agent in all modules
  const modules = ['core', 'bmm', 'bmb', 'tea', 'cis'];
  
  for (const module of modules) {
    const sourceFile = path.join(templateBase, module, 'agents', `${agentName}.md`);
    
    if (await fileUtils.exists(sourceFile)) {
      const targetFile = path.join(projectRoot, '_bmad', module, 'agents', `${agentName}.md`);
      await fileUtils.copy(sourceFile, targetFile);
      return;
    }
  }
  
  throw new Error(`Agent template not found: ${agentName}`);
}

/**
 * Generate platform stubs for all agents
 * 
 * @param {string} platform - Platform name ('copilot-cli' | 'vscode' | 'claude-code' | 'codex')
 * @param {InstallConfig} config - Installation config
 * @returns {Promise<void>}
 */
async function generatePlatformStubs(platform, config) {
  const normalized = platform === 'claude' ? 'claude-code' : platform;
  const platformModule = require(`../platforms/${normalized}`);
  
  if (!platformModule || typeof platformModule.install !== 'function') {
    throw new Error(`Platform module not found or invalid: ${platform}`);
  }
  
  await platformModule.install(config.projectRoot, config.agents, config);
}

/**
 * Create module config file
 * 
 * @param {string} moduleName - Module name (core, bmm, bmb, tea, cis)
 * @param {InstallConfig} config - Installation config
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<void>}
 */
async function createModuleConfig(moduleName, config, projectRoot) {
  const yaml = require('js-yaml');
  
  const configContent = {
    user_name: config.userName,
    communication_language: config.language,
    document_output_language: config.language,
    output_folder: config.outputFolder || '{project-root}/_bmad-output',
    
    // Installation metadata
    installed_by: 'yanstaller',
    installed_at: new Date().toISOString(),
    version: '1.2.0',
    mode: config.mode,
    agents_installed: config.agents
  };
  
  // Add module-specific settings
  if (moduleName === 'bmb') {
    configContent.bmb_creations_output_folder = '{project-root}/_bmad-output/bmb-creations';
  }
  
  const configPath = path.join(projectRoot, '_bmad', moduleName, 'config.yaml');
  const yamlContent = yaml.dump(configContent, { indent: 2 });
  
  await fileUtils.writeFile(configPath, yamlContent);
}

module.exports = {
  install,
  createBmadStructure,
  copyAgentFile,
  generatePlatformStubs,
  createModuleConfig
};
