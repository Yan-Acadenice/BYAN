/**
 * Detector Tests
 * 
 * Tests for install/lib/yanstaller/detector.js
 */

const detector = require('../../lib/yanstaller/detector');
const osDetector = require('../../lib/utils/os-detector');
const nodeDetector = require('../../lib/utils/node-detector');
const gitDetector = require('../../lib/utils/git-detector');
const platforms = require('../../lib/platforms');
const logger = require('../../lib/utils/logger');

// Mock all dependencies
jest.mock('../../lib/utils/os-detector');
jest.mock('../../lib/utils/node-detector');
jest.mock('../../lib/utils/git-detector');
jest.mock('../../lib/platforms');
jest.mock('../../lib/utils/logger');

describe('Detector Module', () => {
  beforeEach(() => {
    // Setup default mocks
    osDetector.detect.mockReturnValue({
      name: 'linux',
      version: '22.04',
      platform: 'linux'
    });
    
    nodeDetector.detect.mockReturnValue('18.19.0');
    nodeDetector.meetsRequirement.mockReturnValue(true);
    
    gitDetector.detect.mockResolvedValue({
      installed: true,
      version: '2.43.0'
    });
    
    // Mock platforms object with all 4 platforms
    platforms['copilot-cli'] = {
      detect: jest.fn().mockResolvedValue(true),
      getPath: jest.fn().mockReturnValue('.github/agents')
    };
    
    platforms['vscode'] = {
      detect: jest.fn().mockResolvedValue(true),
      getPath: jest.fn().mockReturnValue('.github/agents')
    };
    
    platforms['claude'] = {
      detect: jest.fn().mockResolvedValue(false),
      getPath: jest.fn().mockReturnValue('~/.config/Claude/claude_desktop_config.json')
    };
    
    platforms['codex'] = {
      detect: jest.fn().mockResolvedValue(false),
      getPath: jest.fn().mockReturnValue('.codex/prompts')
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('detect()', () => {
    it('should detect full environment with parallel execution', async () => {
      const result = await detector.detect();

      expect(result).toEqual({
        os: 'linux',
        osVersion: '22.04',
        nodeVersion: '18.19.0',
        hasGit: true,
        gitVersion: '2.43.0',
        platforms: [
          { name: 'copilot-cli', detected: true, path: '.github/agents' },
          { name: 'vscode', detected: true, path: '.github/agents' },
          { name: 'claude', detected: false, path: undefined },
          { name: 'codex', detected: false, path: undefined }
        ]
      });

      // Verify all detectors were called
      expect(osDetector.detect).toHaveBeenCalledTimes(1);
      expect(nodeDetector.detect).toHaveBeenCalledTimes(1);
      expect(gitDetector.detect).toHaveBeenCalledTimes(1);
      expect(platforms['copilot-cli'].detect).toHaveBeenCalledTimes(1);
    });

    it('should handle Git not installed', async () => {
      gitDetector.detect.mockResolvedValue({
        installed: false,
        version: null
      });

      const result = await detector.detect();

      expect(result.hasGit).toBe(false);
      expect(result.gitVersion).toBeNull();
    });

    it('should log warning when all platforms fail detection', async () => {
      // Mock all platforms as not detected
      platforms['copilot-cli'].detect.mockResolvedValue(false);
      platforms['vscode'].detect.mockResolvedValue(false);
      platforms['claude'].detect.mockResolvedValue(false);
      platforms['codex'].detect.mockResolvedValue(false);

      await detector.detect();

      // Should NOT log warning if no errors (just not detected)
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should log warning with error details when all platforms fail with errors', async () => {
      // Mock all platforms with errors
      platforms['copilot-cli'].detect.mockRejectedValue(new Error('Command not found'));
      platforms['vscode'].detect.mockRejectedValue(new Error('Not installed'));
      platforms['claude'].detect.mockRejectedValue(new Error('Config missing'));
      platforms['codex'].detect.mockRejectedValue(new Error('Directory missing'));

      const result = await detector.detect();

      // Should log warning per platform AND summary
      expect(logger.warn).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('0/4 platforms detected'));
      
      // All platforms should be marked as not detected
      expect(result.platforms.every(p => !p.detected)).toBe(true);
    });
  });

  describe('detectPlatform()', () => {
    it('should detect platform successfully', async () => {
      const result = await detector.detectPlatform('copilot-cli');

      expect(result).toEqual({
        name: 'copilot-cli',
        detected: true,
        path: '.github/agents'
      });
    });

    it('should handle platform not detected', async () => {
      platforms['codex'].detect.mockResolvedValue(false);

      const result = await detector.detectPlatform('codex');

      expect(result).toEqual({
        name: 'codex',
        detected: false,
        path: undefined
      });
    });

    it('should throw error for unknown platform', async () => {
      await expect(detector.detectPlatform('unknown')).rejects.toThrow('Unknown platform: unknown');
    });

    it('should handle platform detection error gracefully', async () => {
      platforms['copilot-cli'].detect.mockRejectedValue(new Error('Detection failed'));

      const result = await detector.detectPlatform('copilot-cli');

      expect(result).toEqual({
        name: 'copilot-cli',
        detected: false,
        error: 'Detection failed'
      });
      
      expect(logger.warn).toHaveBeenCalledWith('Platform copilot-cli detection failed: Detection failed');
    });

    it('should handle timeout response format from platform detector', async () => {
      // Mock timeout response
      platforms['copilot-cli'].detect.mockResolvedValue({
        detected: false,
        error: 'Detection timeout after 10s'
      });

      const result = await detector.detectPlatform('copilot-cli');

      expect(result).toEqual({
        name: 'copilot-cli',
        detected: false,
        error: 'Detection timeout after 10s'
      });
      
      expect(logger.warn).toHaveBeenCalledWith('Platform copilot-cli detection failed: Detection timeout after 10s');
    });
  });

  describe('isNodeVersionValid()', () => {
    it('should delegate to nodeDetector.meetsRequirement', () => {
      nodeDetector.meetsRequirement.mockReturnValue(true);

      const result = detector.isNodeVersionValid('18.19.0', '18.0.0');

      expect(result).toBe(true);
      expect(nodeDetector.meetsRequirement).toHaveBeenCalledWith('18.19.0', '18.0.0');
    });

    it('should return false when version does not meet requirement', () => {
      nodeDetector.meetsRequirement.mockReturnValue(false);

      const result = detector.isNodeVersionValid('16.0.0', '18.0.0');

      expect(result).toBe(false);
    });
  });
});
