/**
 * Claude Code Platform Tests
 * 
 * Tests for install/lib/platforms/claude-code.js
 */

const claudeCode = require('../../lib/platforms/claude-code');
const fileUtils = require('../../lib/utils/file-utils');
const os = require('os');
const path = require('path');

// Mock dependencies
jest.mock('../../lib/utils/file-utils');
jest.mock('os');

describe('Claude Code Platform', () => {
  const mockHomedir = '/home/testuser';

  beforeEach(() => {
    os.homedir.mockReturnValue(mockHomedir);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('detect() - macOS', () => {
    it('should check correct path on macOS and return true if exists', async () => {
      os.platform.mockReturnValue('darwin');
      fileUtils.exists.mockResolvedValue(true);

      const result = await claudeCode.detect();

      expect(result).toBe(true);
      expect(fileUtils.exists).toHaveBeenCalledWith(
        path.join(mockHomedir, 'Library/Application Support/Claude/claude_desktop_config.json')
      );
    });

    it('should return false if config does not exist on macOS', async () => {
      os.platform.mockReturnValue('darwin');
      fileUtils.exists.mockResolvedValue(false);

      const result = await claudeCode.detect();

      expect(result).toBe(false);
    });
  });

  describe('detect() - Windows', () => {
    it('should check correct path on Windows and return true if exists', async () => {
      os.platform.mockReturnValue('win32');
      fileUtils.exists.mockResolvedValue(true);

      const result = await claudeCode.detect();

      expect(result).toBe(true);
      expect(fileUtils.exists).toHaveBeenCalledWith(
        path.join(mockHomedir, 'AppData/Roaming/Claude/claude_desktop_config.json')
      );
    });

    it('should return false if config does not exist on Windows', async () => {
      os.platform.mockReturnValue('win32');
      fileUtils.exists.mockResolvedValue(false);

      const result = await claudeCode.detect();

      expect(result).toBe(false);
    });
  });

  describe('detect() - Linux', () => {
    it('should check correct path on Linux and return true if exists', async () => {
      os.platform.mockReturnValue('linux');
      fileUtils.exists.mockResolvedValue(true);

      const result = await claudeCode.detect();

      expect(result).toBe(true);
      expect(fileUtils.exists).toHaveBeenCalledWith(
        path.join(mockHomedir, '.config/Claude/claude_desktop_config.json')
      );
    });

    it('should return false if config does not exist on Linux', async () => {
      os.platform.mockReturnValue('linux');
      fileUtils.exists.mockResolvedValue(false);

      const result = await claudeCode.detect();

      expect(result).toBe(false);
    });
  });

  describe('detect() - Unknown OS', () => {
    it('should return false for unsupported platform', async () => {
      os.platform.mockReturnValue('freebsd');

      const result = await claudeCode.detect();

      expect(result).toBe(false);
      expect(fileUtils.exists).not.toHaveBeenCalled();
    });
  });

  describe('getPath()', () => {
    it('should return correct path for macOS', () => {
      os.platform.mockReturnValue('darwin');

      const result = claudeCode.getPath();

      expect(result).toBe(
        path.join(mockHomedir, 'Library/Application Support/Claude/claude_desktop_config.json')
      );
    });

    it('should return correct path for Windows', () => {
      os.platform.mockReturnValue('win32');

      const result = claudeCode.getPath();

      expect(result).toBe(
        path.join(mockHomedir, 'AppData/Roaming/Claude/claude_desktop_config.json')
      );
    });

    it('should return correct path for Linux', () => {
      os.platform.mockReturnValue('linux');

      const result = claudeCode.getPath();

      expect(result).toBe(
        path.join(mockHomedir, '.config/Claude/claude_desktop_config.json')
      );
    });

    it('should return "unknown" for unsupported platform', () => {
      os.platform.mockReturnValue('freebsd');

      const result = claudeCode.getPath();

      expect(result).toBe('unknown');
    });
  });

  describe('name property', () => {
    it('should have correct platform name', () => {
      expect(claudeCode.name).toBe('Claude Code');
    });
  });
});
