/**
 * Git Detector Tests
 * 
 * Tests for install/lib/utils/git-detector.js
 */

const gitDetector = require('../../lib/utils/git-detector');
const { execSync } = require('child_process');

// Mock child_process
jest.mock('child_process');

describe('Git Detector', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('detect() - Git installed', () => {
    it('should detect Git and extract version when installed', async () => {
      // Mock successful git command
      execSync.mockReturnValue('git version 2.34.1\n');

      const result = await gitDetector.detect();

      expect(result).toEqual({
        installed: true,
        version: '2.34.1'
      });

      expect(execSync).toHaveBeenCalledWith('git --version', { encoding: 'utf8' });
    });

    it('should handle different Git version formats', async () => {
      // Test various git version output formats
      execSync.mockReturnValue('git version 2.40.0');

      const result = await gitDetector.detect();

      expect(result.installed).toBe(true);
      expect(result.version).toBe('2.40.0');
    });
  });

  describe('detect() - Git not installed', () => {
    it('should return installed: false when Git command fails', async () => {
      // Mock command failure (Git not installed)
      execSync.mockImplementation(() => {
        throw new Error('command not found: git');
      });

      const result = await gitDetector.detect();

      expect(result).toEqual({
        installed: false,
        version: null
      });
    });
  });

  describe('detect() - Error handling', () => {
    it('should handle malformed git version output gracefully', async () => {
      // Mock unexpected output format
      execSync.mockReturnValue('some weird output without version');

      const result = await gitDetector.detect();

      expect(result.installed).toBe(true);
      expect(result.version).toBeNull(); // Version extraction failed but Git exists
    });

    it('should handle empty output', async () => {
      execSync.mockReturnValue('');

      const result = await gitDetector.detect();

      expect(result.installed).toBe(true);
      expect(result.version).toBeNull();
    });
  });
});
