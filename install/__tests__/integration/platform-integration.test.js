/**
 * Platform Integration Tests
 * 
 * Tests platform selector integration with installer flow
 */

const platformSelector = require('../../lib/yanstaller/platform-selector');

describe('Platform Integration', () => {
  describe('Platform Selector Flow', () => {
    it('should identify Claude as having native integration', () => {
      expect(platformSelector.hasNativeIntegration('claude')).toBe(true);
    });
    
    it('should return claude specialist for Claude platform', () => {
      expect(platformSelector.getSpecialist('claude')).toBe('claude');
    });
    
    it('should have correct platform info for Claude', () => {
      const info = platformSelector.PLATFORM_INFO['claude'];
      
      expect(info).toBeDefined();
      expect(info.displayName).toBe('Claude Code');
      expect(info.native).toBe(true);
      expect(info.specialist).toBe('claude');
      expect(info.icon).toBe('🎭');
    });
  });
  
  describe('Multi-Platform Selection', () => {
    it('should support multiple platforms with different specialists', () => {
      const codexSpecialist = platformSelector.getSpecialist('codex');
      const claudeSpecialist = platformSelector.getSpecialist('claude');

      expect(codexSpecialist).toBe('codex');
      expect(claudeSpecialist).toBe('claude');
      expect(codexSpecialist).not.toBe(claudeSpecialist);
    });

    it('should identify Claude and Codex as native platforms', () => {
      expect(platformSelector.hasNativeIntegration('claude')).toBe(true);
      expect(platformSelector.hasNativeIntegration('codex')).toBe(true);
      expect(platformSelector.hasNativeIntegration('unknown')).toBe(false);
    });
  });
});
