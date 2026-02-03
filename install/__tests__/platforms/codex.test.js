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
});
