/**
 * YANSTALLER - Backup / update / rollback surface
 *
 * The programmatic install()/uninstall() orchestrator was removed: it was a
 * half-implemented stub (phases 4-9 never wired) and the real installer is
 * install/bin/create-byan-agent-v2.js. What remains here is the live, tested
 * surface consumed by the CLI (update / rollback / backups / check commands)
 * and the web UI: update, rollback, listBackups, plus the raw detector /
 * platformSelector / updater / backuper modules.
 *
 * @module yanstaller
 */

const path = require('path');
const detector = require('./detector');
const backuper = require('./backuper');
const updater = require('./updater');
const platformSelector = require('./platform-selector');
const logger = require('../utils/logger');

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
  update,
  rollback,
  listBackups,
  // Raw modules exposed for the CLI, the web UI, and tests
  detector,
  platformSelector,
  updater,
  backuper
};
