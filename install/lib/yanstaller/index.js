/**
 * YANSTALLER - Main Orchestrator
 * 
 * Coordinates all YANSTALLER modules to perform intelligent BYAN installation.
 * 
 * @module yanstaller
 */

const path = require('path');
const detector = require('./detector');
const recommender = require('./recommender');
const installer = require('./installer');
const validator = require('./validator');
const troubleshooter = require('./troubleshooter');
const interviewer = require('./interviewer');
const backuper = require('./backuper');
const updater = require('./updater');
const wizard = require('./wizard');
const platformSelector = require('./platform-selector');
const logger = require('../utils/logger');

/**
 * @typedef {Object} YanInstallerOptions
 * @property {boolean} [yes] - Skip confirmations (--yes flag)
 * @property {string} [mode] - Installation mode: 'full' | 'minimal' | 'custom'
 * @property {string[]} [platforms] - Target platforms (override detection)
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
    // Phase 1: Detect environment
    logger.info('🔍 Detecting environment...');
    const detection = await detector.detect();
    
    // Phase 2: Validate Node version (FAIL FAST)
    if (!detector.isNodeVersionValid(detection.nodeVersion, '18.0.0')) {
      throw new Error(`Node.js >= 18.0.0 required. Found: ${detection.nodeVersion}`);
    }
    
    // Phase 3: Platform Selection
    let platformSelection;
    if (options.platforms) {
      // CLI override
      platformSelection = {
        platforms: options.platforms,
        mode: 'manual'
      };
    } else if (options.yes) {
      // Auto mode
      platformSelection = {
        platforms: detection.platforms.filter(p => p.detected).map(p => p.name),
        mode: 'auto'
      };
    } else {
      // Interactive selection
      platformSelection = await platformSelector.select(detection);
    }
    
    logger.info(`\n✓ Selected ${platformSelection.platforms.length} platform(s)`);
    logger.info(`  Mode: ${platformSelection.mode}`);
    if (platformSelection.specialist) {
      logger.info(`  Specialist: @bmad-agent-${platformSelection.specialist}`);
    }
    
    // Phase 4: Recommend configuration
    // TODO: Implement
    
    // Phase 5: Run interview (unless --yes)
    // TODO: Implement
    
    // Phase 6: Backup existing installation
    // backupPath = await backuper.backup('_bmad');
    
    // Phase 7: Install agents
    // TODO: Implement
    
    // Phase 8: Validate installation
    // TODO: Implement
    
    // Phase 9: Show post-install wizard
    // TODO: Implement
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
 * @param {string} projectRoot - Project root directory
 * @param {Object} [options={}] - Update options
 * @param {boolean} [options.force] - Force update even if same version
 * @param {boolean} [options.preview] - Show diff without applying
 * @returns {Promise<import('./updater').UpdateResult>}
 */
async function update(projectRoot, options = {}) {
  return updater.update(projectRoot, options);
}

/**
 * Rollback to the most recent backup.
 *
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<void>}
 */
async function rollback(projectRoot) {
  const backups = await backuper.listBackups(projectRoot);
  if (backups.length === 0) {
    throw new Error('No backups found to restore from.');
  }

  const latestBackup = backups[0];
  const targetPath = path.join(projectRoot, '_byan');
  logger.info(`Restoring from ${path.basename(latestBackup)}...`);
  await backuper.restore(latestBackup, targetPath);
}

/**
 * List all available BYAN backups.
 *
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<string[]>} Absolute paths, newest first
 */
async function listBackups(projectRoot) {
  return backuper.listBackups(projectRoot);
}

module.exports = {
  install,
  uninstall,
  update,
  rollback,
  listBackups,
  // Expose for testing
  detector,
  platformSelector,
  updater,
  backuper
};
