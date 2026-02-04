/**
 * YANSTALLER - Main Orchestrator
 * 
 * Coordinates all YANSTALLER modules to perform intelligent BYAN installation.
 * 
 * @module yanstaller
 */

const detector = require('./detector');
const recommender = require('./recommender');
const installer = require('./installer');
const validator = require('./validator');
const troubleshooter = require('./troubleshooter');
const interviewer = require('./interviewer');
const backuper = require('./backuper');
const wizard = require('./wizard');
const logger = require('../utils/logger');

/**
 * @typedef {Object} YanInstallerOptions
 * @property {boolean} [yes] - Skip confirmations (--yes flag)
 * @property {string} [mode] - Installation mode: 'full' | 'minimal' | 'custom'
 * @property {boolean} [verbose] - Verbose output
 * @property {boolean} [quiet] - Minimal output
 */

/**
 * Main installation flow
 * 
 * @param {YanInstallerOptions} [options={}] - Installation options
 * @returns {Promise<void>}
 */
async function install(options = {}) {
  let backupPath = null;
  
  try {
    // TODO: Implement Phase 1-8 orchestration
    // 1. Detect environment
    // 2. Validate Node version (FAIL FAST)
    // 3. Recommend configuration
    // 4. Run interview (unless --yes)
    // 5. Backup existing installation
    // backupPath = await backuper.backup('_bmad');
    // 6. Install agents
    // 7. Validate installation
    // 8. Show post-install wizard
  } catch (error) {
    // ROLLBACK STRATEGY: Leave partial state + clear message
    // Rationale (Mantra #37 Ockham's Razor):
    // - Installation = mostly file copies (low risk)
    // - User can re-run (idempotent)
    // - Backup exists for manual restore
    // - Auto-rollback risks losing working partial install
    
    logger.error('Installation failed:', error.message);
    
    if (backupPath) {
      logger.info('\nPartial installation completed.');
      logger.info(`Backup available at: ${backupPath}`);
      logger.info('\nOptions:');
      logger.info('1. Re-run: npx create-byan-agent');
      logger.info(`2. Restore backup: yanstaller restore ${backupPath}`);
      logger.info('3. Troubleshoot: yanstaller doctor');
    }
    
    throw error; // Re-throw for exit code handling
  }
}

/**
 * Uninstall BYAN
 * 
 * @returns {Promise<void>}
 */
async function uninstall() {
  // TODO: Remove _bmad/, .github/agents/ stubs
}

/**
 * Update existing BYAN installation
 * 
 * @param {string} version - Target version
 * @returns {Promise<void>}
 */
async function update(version) {
  // TODO: Backup → Update agents → Merge configs
}

module.exports = {
  install,
  uninstall,
  update
};
