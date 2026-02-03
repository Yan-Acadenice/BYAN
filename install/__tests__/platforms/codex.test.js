/**
 * Codex Platform Tests
 * 
 * Tests for install/lib/platforms/codex.js
 */

const codex = require('../../lib/platforms/codex');
const fileUtils = require('../../lib/utils/file-utils');

// Mock fileUtils
jest.mock('../../lib/utils/file-utils');

describe('Codex Platform', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('detect() - Directory exists', () => {
    it('should return true when .codex/prompts/ directory exists', async () => {
      fileUtils.exists.mockResolvedValue(true);

      const result = await codex.detect();

      expect(result).toBe(true);
      expect(fileUtils.exists).toHaveBeenCalledWith('.codex/prompts');
    });
  });

  describe('detect() - Directory missing', () => {
    it('should return false when .codex/prompts/ directory does not exist', async () => {
      fileUtils.exists.mockResolvedValue(false);

      const result = await codex.detect();

      expect(result).toBe(false);
      expect(fileUtils.exists).toHaveBeenCalledWith('.codex/prompts');
    });
  });

  describe('getPath()', () => {
    it('should return .codex/prompts directory path', () => {
      expect(codex.getPath()).toBe('.codex/prompts');
    });
  });

  describe('name property', () => {
    it('should have correct platform name', () => {
      expect(codex.name).toBe('Codex');
    });
  });

  describe('install()', () => {
    const mockFileUtils = require('../../lib/utils/file-utils');
    
    beforeEach(() => {
      jest.clearAllMocks();
      mockFileUtils.ensureDir.mockResolvedValue();
      mockFileUtils.writeFile.mockResolvedValue();
    });

    it('should create .codex/prompts directory and install agents', async () => {
      const result = await codex.install('/project', ['agent1', 'agent2'], {});
      
      expect(mockFileUtils.ensureDir).toHaveBeenCalledWith('/project/.codex/prompts');
      expect(mockFileUtils.writeFile).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ success: true, installed: 2 });
    });

    it('should handle empty agent list', async () => {
      const result = await codex.install('/project', [], {});
      
      expect(mockFileUtils.ensureDir).toHaveBeenCalled();
      expect(mockFileUtils.writeFile).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, installed: 0 });
    });
  });
});
