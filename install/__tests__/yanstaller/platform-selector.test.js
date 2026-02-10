/**
 * Platform Selector Tests
 * 
 * @group unit
 */

const platformSelector = require('../../lib/yanstaller/platform-selector');

describe('platform-selector', () => {
  describe('getSpecialist', () => {
    it('should return marc for copilot-cli', () => {
      expect(platformSelector.getSpecialist('copilot-cli')).toBe('marc');
    });
    
    it('should return claude for claude platform', () => {
      expect(platformSelector.getSpecialist('claude')).toBe('claude');
    });
    
    it('should return null for platforms without specialist', () => {
      expect(platformSelector.getSpecialist('vscode')).toBeNull();
    });
    
    it('should return null for unknown platform', () => {
      expect(platformSelector.getSpecialist('unknown')).toBeNull();
    });
  });
  
  describe('hasNativeIntegration', () => {
    it('should return true for copilot-cli', () => {
      expect(platformSelector.hasNativeIntegration('copilot-cli')).toBe(true);
    });
    
    it('should return true for claude', () => {
      expect(platformSelector.hasNativeIntegration('claude')).toBe(true);
    });
    
    it('should return true for codex', () => {
      expect(platformSelector.hasNativeIntegration('codex')).toBe(true);
    });
    
    it('should return false for vscode', () => {
      expect(platformSelector.hasNativeIntegration('vscode')).toBe(false);
    });
  });
  
  describe('PLATFORM_INFO', () => {
    it('should have correct structure for all platforms', () => {
      const info = platformSelector.PLATFORM_INFO;
      
      expect(info['copilot-cli']).toMatchObject({
        displayName: expect.any(String),
        native: true,
        specialist: 'marc',
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
