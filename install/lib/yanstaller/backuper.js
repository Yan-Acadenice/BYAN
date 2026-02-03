/**
 * BACKUPER Module
 * 
 * Backs up and restores _bmad/ directory.
 * 
 * Phase 6: 24h development
 * 
 * @module yanstaller/backuper
 */

const path = require('path');
const fileUtils = require('../utils/file-utils');

/**
 * @typedef {Object} BackupResult
 * @property {boolean} success
 * @property {string} backupPath - Path to backup directory
 * @property {number} filesBackedUp
 * @property {number} size - Backup size in bytes
 */

/**
 * Backup _bmad/ directory
 * 
 * @param {string} bmadPath - Path to _bmad/ directory
 * @returns {Promise<BackupResult>}
 */
async function backup(bmadPath) {
  const timestamp = Date.now();
  const backupPath = `${bmadPath}.backup-${timestamp}`;
  
  try {
    // TODO: Copy entire _bmad/ to backup path
    // await fileUtils.copy(bmadPath, backupPath);
    
    return {
      success: true,
      backupPath,
      filesBackedUp: 0,
      size: 0
    };
  } catch (error) {
    throw new BackupError(`Failed to backup ${bmadPath}`, { cause: error });
  }
}

/**
 * Restore from backup
 * 
 * @param {string} backupPath - Path to backup directory
 * @param {string} targetPath - Target restoration path
 * @returns {Promise<void>}
 */
async function restore(backupPath, targetPath) {
  // TODO: Remove current _bmad/, copy backup to target
  // await fileUtils.remove(targetPath);
  // await fileUtils.copy(backupPath, targetPath);
}

/**
 * List available backups
 * 
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<string[]>} - Array of backup paths
 */
async function listBackups(projectRoot) {
  // TODO: Find all _bmad.backup-* directories
  return [];
}

/**
 * Clean old backups (keep last N)
 * 
 * @param {string} projectRoot - Project root directory
 * @param {number} keep - Number of backups to keep
 * @returns {Promise<number>} - Number of backups deleted
 */
async function cleanOldBackups(projectRoot, keep = 3) {
  // TODO: Sort by timestamp, delete oldest
  return 0;
}

/**
 * Get backup size
 * 
 * @param {string} backupPath - Path to backup directory
 * @returns {Promise<number>} - Size in bytes
 */
async function getBackupSize(backupPath) {
  // TODO: Recursively calculate directory size
  return 0;
}

class BackupError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'BackupError';
  }
}

module.exports = {
  backup,
  restore,
  listBackups,
  cleanOldBackups,
  getBackupSize,
  BackupError
};
