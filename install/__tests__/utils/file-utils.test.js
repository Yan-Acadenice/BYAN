/**
 * File Utils Tests
 * 
 * Tests for install/lib/utils/file-utils.js
 */

const fileUtils = require('../../lib/utils/file-utils');
const fs = require('fs-extra');
const path = require('path');

jest.mock('fs-extra');

describe('File Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exists()', () => {
    it('should return true when path exists', async () => {
      fs.pathExists.mockResolvedValue(true);
      
      const result = await fileUtils.exists('/some/path');
      
      expect(result).toBe(true);
      expect(fs.pathExists).toHaveBeenCalledWith('/some/path');
    });

    it('should return false when path does not exist', async () => {
      fs.pathExists.mockResolvedValue(false);
      
      const result = await fileUtils.exists('/missing/path');
      
      expect(result).toBe(false);
    });
  });

  describe('readFile()', () => {
    it('should read file content as UTF-8', async () => {
      fs.readFile.mockResolvedValue('file content');
      
      const result = await fileUtils.readFile('/path/file.txt');
      
      expect(result).toBe('file content');
      expect(fs.readFile).toHaveBeenCalledWith('/path/file.txt', 'utf8');
    });
  });

  describe('writeFile()', () => {
    it('should write file content as UTF-8', async () => {
      fs.writeFile.mockResolvedValue();
      
      await fileUtils.writeFile('/path/file.txt', 'content');
      
      expect(fs.writeFile).toHaveBeenCalledWith('/path/file.txt', 'content', 'utf8');
    });
  });

  describe('ensureDir()', () => {
    it('should create directory if not exists', async () => {
      fs.ensureDir.mockResolvedValue();
      
      await fileUtils.ensureDir('/some/dir');
      
      expect(fs.ensureDir).toHaveBeenCalledWith('/some/dir');
    });
  });

  describe('copy()', () => {
    it('should copy source to destination', async () => {
      fs.copy.mockResolvedValue();
      
      await fileUtils.copy('/src', '/dest');
      
      expect(fs.copy).toHaveBeenCalledWith('/src', '/dest');
    });
  });

  describe('remove()', () => {
    it('should remove path', async () => {
      fs.remove.mockResolvedValue();
      
      await fileUtils.remove('/path');
      
      expect(fs.remove).toHaveBeenCalledWith('/path');
    });
  });
});
