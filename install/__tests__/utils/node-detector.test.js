/**
 * Node Detector Tests
 * 
 * Tests for install/lib/utils/node-detector.js
 */

const nodeDetector = require('../../lib/utils/node-detector');

describe('Node Detector', () => {
  describe('detect()', () => {
    it('should detect Node.js version without v prefix', () => {
      const result = nodeDetector.detect();
      
      expect(typeof result).toBe('string');
      expect(result).not.toMatch(/^v/); // No 'v' prefix
      expect(result).toMatch(/^\d+\.\d+\.\d+/); // Semver format
    });
  });

  describe('compareVersions()', () => {
    it('should return 0 for equal versions', () => {
      expect(nodeDetector.compareVersions('18.0.0', '18.0.0')).toBe(0);
      expect(nodeDetector.compareVersions('20.5.1', '20.5.1')).toBe(0);
    });

    it('should return 1 when first version is greater', () => {
      expect(nodeDetector.compareVersions('19.0.0', '18.0.0')).toBe(1);
      expect(nodeDetector.compareVersions('18.1.0', '18.0.0')).toBe(1);
      expect(nodeDetector.compareVersions('18.0.1', '18.0.0')).toBe(1);
    });

    it('should return -1 when first version is less', () => {
      expect(nodeDetector.compareVersions('18.0.0', '19.0.0')).toBe(-1);
      expect(nodeDetector.compareVersions('18.0.0', '18.1.0')).toBe(-1);
      expect(nodeDetector.compareVersions('18.0.0', '18.0.1')).toBe(-1);
    });

    it('should handle version suffixes correctly by stripping them', () => {
      // These should all compare equal after suffix removal
      expect(nodeDetector.compareVersions('18.0.0-beta', '18.0.0')).toBe(0);
      expect(nodeDetector.compareVersions('18.0.0', '18.0.0-beta')).toBe(0);
      expect(nodeDetector.compareVersions('18.0.0-rc1', '18.0.0-beta')).toBe(0);
      
      // These should compare correctly after suffix removal
      expect(nodeDetector.compareVersions('19.0.0-beta', '18.0.0')).toBe(1);
      expect(nodeDetector.compareVersions('18.0.0-rc1', '19.0.0')).toBe(-1);
    });
  });

  describe('meetsRequirement()', () => {
    it('should return true when current version meets requirement', () => {
      expect(nodeDetector.meetsRequirement('18.0.0', '18.0.0')).toBe(true);
      expect(nodeDetector.meetsRequirement('19.0.0', '18.0.0')).toBe(true);
      expect(nodeDetector.meetsRequirement('18.1.0', '18.0.0')).toBe(true);
    });

    it('should return false when current version does not meet requirement', () => {
      expect(nodeDetector.meetsRequirement('17.9.9', '18.0.0')).toBe(false);
      expect(nodeDetector.meetsRequirement('16.0.0', '18.0.0')).toBe(false);
    });

    it('should handle version suffixes correctly', () => {
      // 18.0.0-beta should still meet 18.0.0 requirement (same base version)
      expect(nodeDetector.meetsRequirement('18.0.0-beta', '18.0.0')).toBe(true);
      expect(nodeDetector.meetsRequirement('19.0.0-rc1', '18.0.0')).toBe(true);
      
      // 17.9.9-beta should not meet 18.0.0 requirement
      expect(nodeDetector.meetsRequirement('17.9.9-beta', '18.0.0')).toBe(false);
    });
  });
});
