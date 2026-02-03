/**
 * Detection Flow Integration Tests
 * 
 * End-to-end integration tests for YANSTALLER Phase 1 Detection.
 * These tests run on real environment (not fully mocked).
 * 
 * Tests verify:
 * - Full detection flow returns valid structure
 * - Detection handles missing platforms gracefully
 * - Detection performance is acceptable (< 5s with timeouts)
 */

const detector = require('../../lib/yanstaller/detector');
const osDetector = require('../../lib/utils/os-detector');
const nodeDetector = require('../../lib/utils/node-detector');
const gitDetector = require('../../lib/utils/git-detector');

describe('Detection Flow Integration', () => {
  describe('Full detection', () => {
    it('should return complete detection structure with real environment', async () => {
      const result = await detector.detect();
      
      // Validate structure
      expect(result).toHaveProperty('os');
      expect(result).toHaveProperty('osVersion');
      expect(result).toHaveProperty('nodeVersion');
      expect(result).toHaveProperty('hasGit');
      expect(result).toHaveProperty('gitVersion');
      expect(result).toHaveProperty('platforms');
      
      // Validate OS detection
      expect(result.os).toBe(osDetector.detect().name);
      expect(typeof result.osVersion).toBe('string');
      expect(result.osVersion.length).toBeGreaterThan(0);
      
      // Validate Node detection
      expect(typeof result.nodeVersion).toBe('string');
      expect(result.nodeVersion).toMatch(/^\d+\.\d+\.\d+$/);
      
      // Validate Git detection
      expect(typeof result.hasGit).toBe('boolean');
      if (result.hasGit) {
        expect(typeof result.gitVersion).toBe('string');
        expect(result.gitVersion.length).toBeGreaterThan(0);
      }
      
      // Validate platforms (array of 4)
      expect(Array.isArray(result.platforms)).toBe(true);
      expect(result.platforms).toHaveLength(4);
      
      // Each platform has required structure
      result.platforms.forEach(platform => {
        expect(platform).toHaveProperty('name');
        expect(platform).toHaveProperty('detected');
        expect(typeof platform.detected).toBe('boolean');
        
        if (platform.detected) {
          expect(platform).toHaveProperty('path');
          expect(typeof platform.path).toBe('string');
        }
      });
    });

    it('should detect platforms based on current directory structure', async () => {
      const result = await detector.detect();
      
      // Count detected platforms
      const detectedCount = result.platforms.filter(p => p.detected).length;
      
      // Platform detection depends on CWD and environment
      // At minimum, structure should be valid
      expect(detectedCount).toBeGreaterThanOrEqual(0);
      expect(detectedCount).toBeLessThanOrEqual(4);
    });
  });

  describe('Performance', () => {
    it('should complete detection in under 5 seconds (with timeout protection)', async () => {
      const startTime = Date.now();
      
      await detector.detect();
      
      const duration = Date.now() - startTime;
      
      // With 10s timeout per platform, worst case is ~10s
      // Normal case should be < 5s
      expect(duration).toBeLessThan(5000);
    }, 6000); // Test timeout 6s (allows 5s + overhead)
  });

  describe('Node version validation', () => {
    it('should validate current Node version meets requirement', () => {
      const currentVersion = nodeDetector.detect();
      const requirement = '18.0.0';
      
      const isValid = detector.isNodeVersionValid(currentVersion, requirement);
      
      // Current environment runs Node >= 18
      expect(isValid).toBe(true);
    });

    it('should reject old Node versions', () => {
      const isValid = detector.isNodeVersionValid('16.0.0', '18.0.0');
      
      expect(isValid).toBe(false);
    });
  });

  describe('Platform detection details', () => {
    it('should return valid structure for copilot-cli detection', async () => {
      const platformInfo = await detector.detectPlatform('copilot-cli');
      
      expect(platformInfo.name).toBe('copilot-cli');
      expect(typeof platformInfo.detected).toBe('boolean');
      
      // Path present only if detected
      if (platformInfo.detected) {
        expect(platformInfo.path).toBe('.github/agents');
      }
    });

    it('should detect vscode platform (delegates to copilot-cli)', async () => {
      const platformInfo = await detector.detectPlatform('vscode');
      
      expect(platformInfo.name).toBe('vscode');
      // VSCode uses same path as copilot-cli
      expect(typeof platformInfo.detected).toBe('boolean');
    });

    it('should handle unknown platform gracefully', async () => {
      await expect(
        detector.detectPlatform('unknown-platform')
      ).rejects.toThrow('Unknown platform: unknown-platform');
    });
  });

  describe('Resilience', () => {
    it('should handle all platforms gracefully even if none detected', async () => {
      // This test validates structure even if detection returns false
      const result = await detector.detect();
      
      // All 4 platforms should be checked
      const platformNames = result.platforms.map(p => p.name).sort();
      expect(platformNames).toEqual(['claude', 'codex', 'copilot-cli', 'vscode']);
      
      // Each platform has valid structure
      result.platforms.forEach(platform => {
        expect(platform).toHaveProperty('name');
        expect(platform).toHaveProperty('detected');
        expect(typeof platform.detected).toBe('boolean');
      });
    });
  });
});
