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
      const copilotSpecialist = platformSelector.getSpecialist('copilot-cli');
      const claudeSpecialist = platformSelector.getSpecialist('claude');
      
      expect(copilotSpecialist).toBe('marc');
      expect(claudeSpecialist).toBe('claude');
      expect(copilotSpecialist).not.toBe(claudeSpecialist);
    });
    
    it('should identify both Copilot and Claude as native platforms', () => {
      expect(platformSelector.hasNativeIntegration('copilot-cli')).toBe(true);
      expect(platformSelector.hasNativeIntegration('claude')).toBe(true);
      expect(platformSelector.hasNativeIntegration('codex')).toBe(false);
      expect(platformSelector.hasNativeIntegration('vscode')).toBe(false);
    });
  });
});
