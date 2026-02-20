const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Backup - Safe backup and restore operations for BYAN updates
 * Creates timestamped backups and manages rollback functionality
 */
class Backup {
  constructor(installPath) {
    this.installPath = installPath;
    this.byanDir = path.join(installPath, '_byan');
    this.backupBaseDir = path.join(installPath, '_byan.backup');
  }

  /**
   * Create backup of _byan directory with timestamp
   * @returns {Promise<string>} Path to created backup
   */
  async create() {
    try {
      if (!fs.existsSync(this.byanDir)) {
        throw new Error('Directory _byan/ introuvable');
      }

      // Create backup directory with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + 
                       '_' + new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
      const backupPath = path.join(this.backupBaseDir, `backup-${timestamp}`);

      // Create backup base directory if not exists
      if (!fs.existsSync(this.backupBaseDir)) {
        fs.mkdirSync(this.backupBaseDir, { recursive: true });
      }

      // Copy _byan to backup location
      this._copyRecursive(this.byanDir, backupPath);

      // Save backup metadata
      const metadataPath = path.join(backupPath, '.backup-metadata.json');
      const metadata = {
        timestamp: new Date().toISOString(),
        originalPath: this.byanDir,
        backupPath: backupPath
      };
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      return backupPath;
    } catch (error) {
      throw new Error(`Erreur creation backup: ${error.message}`);
    }
  }

  /**
   * Restore from backup directory
   * @param {string} backupPath - Path to backup directory (optional, uses latest if not provided)
   * @returns {Promise<boolean>} Success status
   */
  async restore(backupPath = null) {
    try {
      // If no backup path provided, find latest
      if (!backupPath) {
        backupPath = await this.getLatestBackup();
      }

      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup introuvable: ${backupPath}`);
      }

      // Remove current _byan directory
      if (fs.existsSync(this.byanDir)) {
        this._removeRecursive(this.byanDir);
      }

      // Restore from backup
      this._copyRecursive(backupPath, this.byanDir);

      // Remove backup metadata file from restored directory
      const metadataPath = path.join(this.byanDir, '.backup-metadata.json');
      if (fs.existsSync(metadataPath)) {
        fs.unlinkSync(metadataPath);
      }

      return true;
    } catch (error) {
      throw new Error(`Erreur restoration backup: ${error.message}`);
    }
  }

  /**
   * Get latest backup path
   * @returns {Promise<string|null>} Latest backup path or null
   */
  async getLatestBackup() {
    if (!fs.existsSync(this.backupBaseDir)) {
      return null;
    }

    const backups = fs.readdirSync(this.backupBaseDir)
      .filter(name => name.startsWith('backup-'))
      .map(name => path.join(this.backupBaseDir, name))
      .filter(p => fs.statSync(p).isDirectory())
      .sort((a, b) => {
        const statA = fs.statSync(a);
        const statB = fs.statSync(b);
        return statB.mtime.getTime() - statA.mtime.getTime();
      });

    return backups.length > 0 ? backups[0] : null;
  }

  /**
   * List all available backups
   * @returns {Promise<Array>} List of backup info objects
   */
  async listBackups() {
    if (!fs.existsSync(this.backupBaseDir)) {
      return [];
    }

    const backups = fs.readdirSync(this.backupBaseDir)
      .filter(name => name.startsWith('backup-'))
      .map(name => {
        const backupPath = path.join(this.backupBaseDir, name);
        const metadataPath = path.join(backupPath, '.backup-metadata.json');
        
        let metadata = {};
        if (fs.existsSync(metadataPath)) {
          metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        }

        const stats = fs.statSync(backupPath);
        
        return {
          name,
          path: backupPath,
          timestamp: metadata.timestamp || stats.mtime.toISOString(),
          size: this._getDirectorySize(backupPath)
        };
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return backups;
  }

  /**
   * Copy directory recursively
   * @param {string} src - Source directory
   * @param {string} dest - Destination directory
   */
  _copyRecursive(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this._copyRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Remove directory recursively
   * @param {string} dirPath - Directory to remove
   */
  _removeRecursive(dirPath) {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  }

  /**
   * Get directory size in bytes
   * @param {string} dirPath - Directory path
   * @returns {number} Size in bytes
   */
  _getDirectorySize(dirPath) {
    let size = 0;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        size += this._getDirectorySize(entryPath);
      } else {
        size += fs.statSync(entryPath).size;
      }
    }

    return size;
  }
}

module.exports = Backup;
