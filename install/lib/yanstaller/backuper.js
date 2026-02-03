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
const fs = require('fs-extra');
const fileUtils = require('../utils/file-utils');
const logger = require('../utils/logger');

/**
 * @typedef {Object} BackupResult
 * @property {boolean} success
 * @property {string} backupPath - Path to backup directory
 * @property {number} filesBackedUp
 * @property {number} size - Backup size in bytes
 * @property {number} duration - Backup duration in ms
 */

/**
 * @typedef {Object} BackupInfo
 * @property {string} path - Backup directory path
 * @property {number} timestamp - Creation timestamp
 * @property {Date} created - Creation date
 * @property {number} size - Size in bytes
 * @property {number} files - Number of files
 */

/**
 * Backup _bmad/ directory
 * 
 * @param {string} bmadPath - Path to _bmad/ directory
 * @param {Object} options - Backup options
 * @returns {Promise<BackupResult>}
 */
async function backup(bmadPath, options = {}) {
  const startTime = Date.now();
  const timestamp = Date.now();
  const backupPath = `${bmadPath}.backup-${timestamp}`;
  
  try {
    logger.info(`Creating backup: ${backupPath}`);
    
    // Check if source exists
    if (!await fileUtils.exists(bmadPath)) {
      throw new BackupError(`Source path does not exist: ${bmadPath}`);
    }
    
    // Copy entire _bmad/ to backup path
    await fileUtils.copy(bmadPath, backupPath);
    
    // Count files and calculate size
    const { files, size } = await getDirectoryStats(backupPath);
    
    // Create metadata file
    const metadata = {
      timestamp,
      created: new Date(timestamp).toISOString(),
      source: bmadPath,
      files,
      size,
      version: '1.2.0'
    };
    
    await fileUtils.writeFile(
      path.join(backupPath, '.backup-metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    const duration = Date.now() - startTime;
    
    logger.info(`✓ Backup created: ${files} files, ${formatSize(size)}, ${duration}ms`);
    
    return {
      success: true,
      backupPath,
      filesBackedUp: files,
      size,
      duration
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
 * @param {Object} options - Restore options
 * @returns {Promise<void>}
 */
async function restore(backupPath, targetPath, options = {}) {
  try {
    logger.info(`Restoring from backup: ${backupPath}`);
    
    // Verify backup exists
    if (!await fileUtils.exists(backupPath)) {
      throw new BackupError(`Backup not found: ${backupPath}`);
    }
    
    // Verify backup metadata
    const metadataPath = path.join(backupPath, '.backup-metadata.json');
    if (await fileUtils.exists(metadataPath)) {
      const metadata = await fileUtils.readJSON(metadataPath);
      logger.info(`Backup created: ${metadata.created}, ${metadata.files} files`);
    }
    
    // Create backup of current state before restoring (if exists)
    if (await fileUtils.exists(targetPath) && !options.skipCurrentBackup) {
      logger.info('Creating backup of current state before restore...');
      await backup(targetPath);
    }
    
    // Remove current installation
    if (await fileUtils.exists(targetPath)) {
      await fileUtils.remove(targetPath);
    }
    
    // Copy backup to target
    await fileUtils.copy(backupPath, targetPath);
    
    // Remove metadata file from restored directory
    const restoredMetadata = path.join(targetPath, '.backup-metadata.json');
    if (await fileUtils.exists(restoredMetadata)) {
      await fileUtils.remove(restoredMetadata);
    }
    
    logger.info('✓ Restore completed successfully');
  } catch (error) {
    throw new BackupError(`Failed to restore from ${backupPath}`, { cause: error });
  }
}

/**
 * List available backups
 * 
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<BackupInfo[]>} - Array of backup info objects
 */
async function listBackups(projectRoot) {
  try {
    const backups = [];
    const bmadPath = path.join(projectRoot, '_bmad');
    const parentDir = path.dirname(bmadPath);
    
    // Find all _bmad.backup-* directories
    const items = await fileUtils.readDir(parentDir);
    
    for (const item of items) {
      if (item.startsWith('_bmad.backup-')) {
        const backupPath = path.join(parentDir, item);
        const timestamp = parseInt(item.replace('_bmad.backup-', ''));
        
        // Read metadata if available
        const metadataPath = path.join(backupPath, '.backup-metadata.json');
        let metadata = { files: 0, size: 0 };
        
        if (await fileUtils.exists(metadataPath)) {
          metadata = await fileUtils.readJSON(metadataPath);
        } else {
          // Calculate if no metadata
          const stats = await getDirectoryStats(backupPath);
          metadata.files = stats.files;
          metadata.size = stats.size;
        }
        
        backups.push({
          path: backupPath,
          timestamp,
          created: new Date(timestamp),
          size: metadata.size,
          files: metadata.files
        });
      }
    }
    
    // Sort by timestamp (newest first)
    backups.sort((a, b) => b.timestamp - a.timestamp);
    
    return backups;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []; // No backups found
    }
    throw error;
  }
}

/**
 * Clean old backups (keep last N)
 * 
 * @param {string} projectRoot - Project root directory
 * @param {number} keep - Number of backups to keep
 * @returns {Promise<number>} - Number of backups deleted
 */
async function cleanOldBackups(projectRoot, keep = 3) {
  try {
    const backups = await listBackups(projectRoot);
    
    if (backups.length <= keep) {
      return 0; // Nothing to delete
    }
    
    // Delete oldest backups
    const toDelete = backups.slice(keep);
    let deleted = 0;
    
    for (const backup of toDelete) {
      try {
        await fileUtils.remove(backup.path);
        logger.info(`✓ Deleted old backup: ${path.basename(backup.path)}`);
        deleted++;
      } catch (error) {
        logger.warn(`Failed to delete backup ${backup.path}: ${error.message}`);
      }
    }
    
    return deleted;
  } catch (error) {
    throw new BackupError(`Failed to clean old backups: ${error.message}`);
  }
}

/**
 * Get backup size
 * 
 * @param {string} backupPath - Path to backup directory
 * @returns {Promise<number>} - Size in bytes
 */
async function getBackupSize(backupPath) {
  const stats = await getDirectoryStats(backupPath);
  return stats.size;
}

/**
 * Get directory statistics (files count and total size)
 * 
 * @param {string} dirPath - Directory path
 * @returns {Promise<{files: number, size: number}>}
 */
async function getDirectoryStats(dirPath) {
  let files = 0;
  let size = 0;
  
  async function traverse(currentPath) {
    const items = await fileUtils.readDir(currentPath);
    
    for (const item of items) {
      const itemPath = path.join(currentPath, item);
      const stats = await fs.stat(itemPath);
      
      if (stats.isDirectory()) {
        await traverse(itemPath);
      } else {
        files++;
        size += stats.size;
      }
    }
  }
  
  await traverse(dirPath);
  
  return { files, size };
}

/**
 * Format size in human-readable format
 * 
 * @param {number} bytes - Size in bytes
 * @returns {string}
 */
function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
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
  getDirectoryStats,
  formatSize,
  BackupError
};
