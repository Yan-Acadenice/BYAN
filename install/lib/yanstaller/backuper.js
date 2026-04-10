/**
 * BACKUPER Module
 *
 * Backs up and restores _byan/ directory with timestamp-based snapshots.
 *
 * @module yanstaller/backuper
 */

const fs = require('fs-extra');
const path = require('path');

const BACKUP_PREFIX = '_byan.backup-';

/**
 * @typedef {Object} BackupResult
 * @property {boolean} success
 * @property {string} backupPath - Path to backup directory
 * @property {number} filesBackedUp
 * @property {number} size - Backup size in bytes
 */

/**
 * Recursively count files and total size in a directory.
 *
 * @param {string} dir - Directory to measure
 * @returns {Promise<{count: number, size: number}>}
 */
async function measureDir(dir) {
  let count = 0;
  let size = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await measureDir(fullPath);
      count += sub.count;
      size += sub.size;
    } else if (entry.isFile()) {
      const stat = await fs.stat(fullPath);
      count++;
      size += stat.size;
    }
  }

  return { count, size };
}

/**
 * Backup _byan/ directory to a timestamped snapshot.
 *
 * @param {string} byanPath - Absolute path to _byan/ directory
 * @returns {Promise<BackupResult>}
 */
async function backup(byanPath) {
  if (!await fs.pathExists(byanPath)) {
    throw new BackupError(`Source directory does not exist: ${byanPath}`);
  }

  const timestamp = Date.now();
  const backupPath = path.join(path.dirname(byanPath), `${BACKUP_PREFIX}${timestamp}`);

  try {
    await fs.copy(byanPath, backupPath);
    const { count, size } = await measureDir(backupPath);

    return {
      success: true,
      backupPath,
      filesBackedUp: count,
      size
    };
  } catch (error) {
    throw new BackupError(`Failed to backup ${byanPath}`, { cause: error });
  }
}

/**
 * Restore from a backup, replacing the current _byan/ directory.
 *
 * @param {string} backupPath - Absolute path to the backup directory
 * @param {string} targetPath - Absolute path to restore into (e.g., _byan/)
 * @returns {Promise<void>}
 */
async function restore(backupPath, targetPath) {
  if (!await fs.pathExists(backupPath)) {
    throw new BackupError(`Backup not found: ${backupPath}`);
  }

  await fs.remove(targetPath);
  await fs.copy(backupPath, targetPath);
}

/**
 * List available backup directories sorted by timestamp (newest first).
 *
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<string[]>} Absolute paths to backup directories
 */
async function listBackups(projectRoot) {
  if (!await fs.pathExists(projectRoot)) return [];

  const entries = await fs.readdir(projectRoot, { withFileTypes: true });
  const backups = entries
    .filter(e => e.isDirectory() && e.name.startsWith(BACKUP_PREFIX))
    .map(e => ({
      name: e.name,
      timestamp: parseInt(e.name.slice(BACKUP_PREFIX.length), 10),
      path: path.join(projectRoot, e.name)
    }))
    .filter(b => !isNaN(b.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp);

  return backups.map(b => b.path);
}

/**
 * Prune old backups, keeping only the N most recent.
 *
 * @param {string} projectRoot - Project root directory
 * @param {number} [maxBackups=3] - Number of backups to keep
 * @returns {Promise<number>} Number of backups deleted
 */
async function pruneBackups(projectRoot, maxBackups = 3) {
  const all = await listBackups(projectRoot);

  if (all.length <= maxBackups) return 0;

  const toDelete = all.slice(maxBackups);
  for (const backupPath of toDelete) {
    await fs.remove(backupPath);
  }

  return toDelete.length;
}

/**
 * Get total size of a backup directory in bytes.
 *
 * @param {string} backupPath - Absolute path to backup directory
 * @returns {Promise<number>} Size in bytes
 */
async function getBackupSize(backupPath) {
  if (!await fs.pathExists(backupPath)) return 0;
  const { size } = await measureDir(backupPath);
  return size;
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
  pruneBackups,
  getBackupSize,
  BackupError,
  BACKUP_PREFIX
};
