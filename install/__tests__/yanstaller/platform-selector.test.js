/**
 * Platform Selector Tests
 * 
 * @group unit
 */

const platformSelector = require('../../lib/yanstaller/platform-selector');

describe('platform-selector', () => {
  describe('getSpecialist', () => {
    it('should return claude for claude platform', () => {
      expect(platformSelector.getSpecialist('claude')).toBe('claude');
    });

    it('should return codex for codex platform', () => {
      expect(platformSelector.getSpecialist('codex')).toBe('codex');
    });

    it('should return null for unknown platform', () => {
      expect(platformSelector.getSpecialist('unknown')).toBeNull();
    });
  });

  describe('hasNativeIntegration', () => {
    it('should return true for claude', () => {
      expect(platformSelector.hasNativeIntegration('claude')).toBe(true);
    });

    it('should return true for codex', () => {
      expect(platformSelector.hasNativeIntegration('codex')).toBe(true);
    });

    it('should return false for unknown platform', () => {
      expect(platformSelector.hasNativeIntegration('unknown')).toBe(false);
    });
  });

  describe('PLATFORM_INFO', () => {
    it('should have correct structure for all platforms', () => {
      const info = platformSelector.PLATFORM_INFO;

      expect(info['codex']).toMatchObject({
        displayName: expect.any(String),
        native: true,
        specialist: 'codex',
        icon: expect.any(String)
      });

      expect(info['claude']).toMatchObject({
        displayName: expect.any(String),
        native: true,
        specialist: 'claude',
        icon: expect.any(String)
      });
    });
  });
});
