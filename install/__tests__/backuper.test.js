/**
 * Tests for Backuper Module
 */

const backuper = require('../lib/yanstaller/backuper');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

describe('Backuper Module', () => {
  let tempDir;
  let bmadPath;
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backuper-test-'));
    bmadPath = path.join(tempDir, '_bmad');
    
    // Create mock _bmad structure
    await fs.ensureDir(path.join(bmadPath, '_config'));
    await fs.ensureDir(path.join(bmadPath, 'bmb/agents'));
    await fs.writeFile(path.join(bmadPath, 'bmb/config.yaml'), 'user_name: Test');
    await fs.writeFile(path.join(bmadPath, 'bmb/agents/test.md'), '# Test Agent');
  });
  
  afterEach(async () => {
    await fs.remove(tempDir);
  });
  
  describe('backup', () => {
    test('creates backup with timestamp', async () => {
      const result = await backuper.backup(bmadPath);
      
      expect(result.success).toBe(true);
      expect(result.backupPath).toContain('.backup-');
      expect(result.filesBackedUp).toBeGreaterThan(0);
      expect(result.size).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);
      
      // Verify backup exists
      expect(await fs.pathExists(result.backupPath)).toBe(true);
    });
    
    test('backup contains all files', async () => {
      const result = await backuper.backup(bmadPath);
      
      // Check files exist in backup
      expect(await fs.pathExists(path.join(result.backupPath, '_config'))).toBe(true);
      expect(await fs.pathExists(path.join(result.backupPath, 'bmb/config.yaml'))).toBe(true);
      expect(await fs.pathExists(path.join(result.backupPath, 'bmb/agents/test.md'))).toBe(true);
    });
    
    test('creates metadata file', async () => {
      const result = await backuper.backup(bmadPath);
      
      const metadataPath = path.join(result.backupPath, '.backup-metadata.json');
      expect(await fs.pathExists(metadataPath)).toBe(true);
      
      const metadata = await fs.readJSON(metadataPath);
      expect(metadata).toHaveProperty('timestamp');
      expect(metadata).toHaveProperty('created');
      expect(metadata).toHaveProperty('files');
      expect(metadata).toHaveProperty('size');
      expect(metadata.version).toBe('1.2.0');
    });
    
    test('throws error if source does not exist', async () => {
      await expect(
        backuper.backup(path.join(tempDir, 'nonexistent'))
      ).rejects.toThrow('does not exist');
    });
  });
  
  describe('restore', () => {
    test('restores from backup', async () => {
      // Create backup
      const backupResult = await backuper.backup(bmadPath);
      
      // Modify original
      await fs.writeFile(path.join(bmadPath, 'bmb/config.yaml'), 'modified: true');
      
      // Restore
      await backuper.restore(backupResult.backupPath, bmadPath, { skipCurrentBackup: true });
      
      // Verify restored
      const content = await fs.readFile(path.join(bmadPath, 'bmb/config.yaml'), 'utf8');
      expect(content).toBe('user_name: Test');
    });
    
    test('creates backup of current state before restore', async () => {
      const backupResult = await backuper.backup(bmadPath);
      
      // Count backups before
      const backupsBefore = await backuper.listBackups(tempDir);
      
      // Restore (should create backup of current)
      await backuper.restore(backupResult.backupPath, bmadPath);
      
      // Should have 2 backups now
      const backupsAfter = await backuper.listBackups(tempDir);
      expect(backupsAfter.length).toBe(backupsBefore.length + 1);
    });
    
    test('removes metadata file from restored directory', async () => {
      const backupResult = await backuper.backup(bmadPath);
      
      await backuper.restore(backupResult.backupPath, bmadPath, { skipCurrentBackup: true });
      
      // Metadata should not exist in restored directory
      const metadataPath = path.join(bmadPath, '.backup-metadata.json');
      expect(await fs.pathExists(metadataPath)).toBe(false);
    });
    
    test('throws error if backup does not exist', async () => {
      await expect(
        backuper.restore(path.join(tempDir, 'nonexistent'), bmadPath)
      ).rejects.toThrow('not found');
    });
  });
  
  describe('listBackups', () => {
    test('returns empty array when no backups', async () => {
      const backups = await backuper.listBackups(tempDir);
      expect(backups).toEqual([]);
    });
    
    test('lists all backups with metadata', async () => {
      // Create multiple backups
      await backuper.backup(bmadPath);
      await new Promise(r => setTimeout(r, 10)); // Small delay for different timestamp
      await backuper.backup(bmadPath);
      
      const backups = await backuper.listBackups(tempDir);
      
      expect(backups.length).toBe(2);
      backups.forEach(backup => {
        expect(backup).toHaveProperty('path');
        expect(backup).toHaveProperty('timestamp');
        expect(backup).toHaveProperty('created');
        expect(backup).toHaveProperty('size');
        expect(backup).toHaveProperty('files');
      });
    });
    
    test('sorts backups by timestamp (newest first)', async () => {
      await backuper.backup(bmadPath);
      await new Promise(r => setTimeout(r, 10));
      await backuper.backup(bmadPath);
      
      const backups = await backuper.listBackups(tempDir);
      
      // First should be newest
      expect(backups[0].timestamp).toBeGreaterThan(backups[1].timestamp);
    });
  });
  
  describe('cleanOldBackups', () => {
    test('keeps specified number of backups', async () => {
      // Create 5 backups
      for (let i = 0; i < 5; i++) {
        await backuper.backup(bmadPath);
        await new Promise(r => setTimeout(r, 10));
      }
      
      // Clean, keep only 3
      const deleted = await backuper.cleanOldBackups(tempDir, 3);
      
      expect(deleted).toBe(2);
      
      const remaining = await backuper.listBackups(tempDir);
      expect(remaining.length).toBe(3);
    });
    
    test('returns 0 if already within limit', async () => {
      await backuper.backup(bmadPath);
      
      const deleted = await backuper.cleanOldBackups(tempDir, 3);
      
      expect(deleted).toBe(0);
    });
    
    test('deletes oldest backups first', async () => {
      // Create 3 backups
      await backuper.backup(bmadPath);
      await new Promise(r => setTimeout(r, 10));
      await backuper.backup(bmadPath);
      await new Promise(r => setTimeout(r, 10));
      const newestResult = await backuper.backup(bmadPath);
      
      // Clean, keep only 1
      await backuper.cleanOldBackups(tempDir, 1);
      
      const remaining = await backuper.listBackups(tempDir);
      expect(remaining.length).toBe(1);
      expect(remaining[0].path).toBe(newestResult.backupPath);
    });
  });
  
  describe('getBackupSize', () => {
    test('returns backup size in bytes', async () => {
      const backupResult = await backuper.backup(bmadPath);
      
      const size = await backuper.getBackupSize(backupResult.backupPath);
      
      expect(size).toBeGreaterThan(0);
      expect(size).toBe(backupResult.size);
    });
  });
  
  describe('getDirectoryStats', () => {
    test('calculates files count and total size', async () => {
      const stats = await backuper.getDirectoryStats(bmadPath);
      
      expect(stats.files).toBeGreaterThan(0);
      expect(stats.size).toBeGreaterThan(0);
    });
    
    test('includes subdirectories recursively', async () => {
      // Add more nested files
      await fs.ensureDir(path.join(bmadPath, 'deep/nested/path'));
      await fs.writeFile(path.join(bmadPath, 'deep/nested/path/file.txt'), 'content');
      
      const stats = await backuper.getDirectoryStats(bmadPath);
      
      expect(stats.files).toBeGreaterThan(2); // At least config + test + new file
    });
  });
  
  describe('formatSize', () => {
    test('formats bytes', () => {
      expect(backuper.formatSize(500)).toBe('500.00 B');
    });
    
    test('formats kilobytes', () => {
      expect(backuper.formatSize(1024)).toBe('1.00 KB');
      expect(backuper.formatSize(2048)).toBe('2.00 KB');
    });
    
    test('formats megabytes', () => {
      expect(backuper.formatSize(1024 * 1024)).toBe('1.00 MB');
    });
    
    test('formats gigabytes', () => {
      expect(backuper.formatSize(1024 * 1024 * 1024)).toBe('1.00 GB');
    });
  });
  
  describe('BackupError', () => {
    test('is thrown with message and cause', async () => {
      try {
        await backuper.backup(path.join(tempDir, 'nonexistent'));
        fail('Should have thrown');
      } catch (error) {
        expect(error.name).toBe('BackupError');
        expect(error.message).toContain('Failed to backup');
        expect(error.cause).toBeDefined();
      }
    });
  });
});
