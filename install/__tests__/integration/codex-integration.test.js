/**
 * Codex Launcher Tests
 * 
 * Tests Codex skill command generation
 */

const agentLauncher = require('../../lib/yanstaller/agent-launcher');

describe('Codex platform launcher', () => {
  describe('getLaunchInstructions for Codex', () => {
    it('should use "skill" terminology not "agent"', () => {
      const instructions = agentLauncher.getLaunchInstructions({
        agent: 'byan',
        platform: 'codex',
        prompt: 'create agent'
      });
      
      expect(instructions).toContain('codex skill');
      expect(instructions).toContain('bmad-byan');
    });
    
    it('should include prompt as positional argument', () => {
      const instructions = agentLauncher.getLaunchInstructions({
        agent: 'pm',
        platform: 'codex',
        prompt: 'validate requirements'
      });
      
      expect(instructions).toContain('codex skill bmad-pm validate requirements');
    });
    
    it('should work without prompt', () => {
      const instructions = agentLauncher.getLaunchInstructions({
        agent: 'architect',
        platform: 'codex'
      });
      
      expect(instructions).toContain('codex skill bmad-architect');
      expect(instructions).not.toContain('undefined');
    });
  });
  
  describe('hasNativeIntegration for Codex', () => {
    const platformSelector = require('../../lib/yanstaller/platform-selector');
    
    it('should now return true for Codex', () => {
      expect(platformSelector.hasNativeIntegration('codex')).toBe(true);
    });
    
    it('should have codex specialist defined', () => {
      expect(platformSelector.getSpecialist('codex')).toBe('codex');
    });
  });
  
  describe('PLATFORM_INFO for Codex', () => {
    const platformSelector = require('../../lib/yanstaller/platform-selector');
    
    it('should have native set to true', () => {
      const info = platformSelector.PLATFORM_INFO['codex'];
      expect(info.native).toBe(true);
    });
    
    it('should have correct specialist', () => {
      const info = platformSelector.PLATFORM_INFO['codex'];
      expect(info.specialist).toBe('codex');
    });
    
    it('should have display name', () => {
      const info = platformSelector.PLATFORM_INFO['codex'];
      expect(info.displayName).toBe('OpenCode/Codex');
    });
  });
});
