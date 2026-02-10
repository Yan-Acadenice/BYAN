/**
 * Agent Launcher Tests
 * 
 * Tests native platform command generation and execution
 */

const agentLauncher = require('../../lib/yanstaller/agent-launcher');
const { execSync } = require('child_process');

jest.mock('child_process');

describe('agent-launcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('supportsNativeLaunch', () => {
    it('should check if platform has native command available', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'which claude') {
          return '/usr/bin/claude';
        }
        throw new Error('not found');
      });
      
      expect(agentLauncher.supportsNativeLaunch('claude')).toBe(true);
      expect(agentLauncher.supportsNativeLaunch('copilot-cli')).toBe(false);
    });
    
    it('should return false for unsupported platforms', () => {
      expect(agentLauncher.supportsNativeLaunch('unknown')).toBe(false);
    });
  });
  
  describe('getAvailablePlatforms', () => {
    it('should return list of platforms with available commands', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd.includes('claude')) {
          return '/usr/bin/claude';
        }
        throw new Error('not found');
      });
      
      const platforms = agentLauncher.getAvailablePlatforms();
      expect(platforms).toContain('claude');
      expect(platforms.length).toBeGreaterThan(0);
    });
  });
  
  describe('getLaunchInstructions', () => {
    it('should generate instructions for Claude platform', () => {
      const instructions = agentLauncher.getLaunchInstructions({
        agent: 'claude',
        platform: 'claude',
        prompt: 'create-mcp-server'
      });
      
      expect(instructions).toContain('claude');
      expect(instructions).toContain('--agent claude');
      expect(instructions).toContain('create-mcp-server');
    });
    
    it('should generate instructions for Copilot CLI', () => {
      const instructions = agentLauncher.getLaunchInstructions({
        agent: 'marc',
        platform: 'copilot-cli'
      });
      
      expect(instructions).toContain('gh copilot');
      expect(instructions).toContain('@bmad-agent-marc');
    });
    
    it('should handle unsupported platforms', () => {
      const instructions = agentLauncher.getLaunchInstructions({
        agent: 'test',
        platform: 'unknown'
      });
      
      expect(instructions).toContain('not yet supported');
    });
  });
  
  describe('launchWithPrompt', () => {
    it('should require prompt for non-interactive launch', async () => {
      await expect(
        agentLauncher.launchWithPrompt({
          agent: 'claude',
          platform: 'claude'
        })
      ).rejects.toThrow('Prompt required');
    });
    
    it('should build correct Claude command with --print flag', async () => {
      execSync.mockReturnValue('Agent output');
      
      // Mock command availability
      execSync.mockImplementation((cmd) => {
        if (cmd === 'which claude') return '/usr/bin/claude';
        if (cmd.includes('claude --print')) return 'Output';
        throw new Error('Unexpected command');
      });
      
      const result = await agentLauncher.launchWithPrompt({
        agent: 'claude',
        platform: 'claude',
        prompt: 'test prompt',
        model: 'sonnet'
      });
      
      expect(result.success).toBe(true);
      expect(result.method).toBe('native-print');
    });
    
    it('should handle command execution errors', async () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'which claude') return '/usr/bin/claude';
        throw new Error('Execution failed');
      });
      
      const result = await agentLauncher.launchWithPrompt({
        agent: 'claude',
        platform: 'claude',
        prompt: 'test'
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Execution failed');
    });
  });
  
  describe('Claude platform args generation', () => {
    it('should include agent flag', () => {
      const instructions = agentLauncher.getLaunchInstructions({
        agent: 'claude',
        platform: 'claude'
      });
      
      expect(instructions).toContain('--agent claude');
    });
    
    it('should include model flag when specified', () => {
      const instructions = agentLauncher.getLaunchInstructions({
        agent: 'claude',
        platform: 'claude',
        model: 'opus'
      });
      
      expect(instructions).toContain('--model opus');
    });
    
    it('should include prompt as argument', () => {
      const instructions = agentLauncher.getLaunchInstructions({
        agent: 'claude',
        platform: 'claude',
        prompt: 'create MCP server'
      });
      
      expect(instructions).toContain('create MCP server');
    });
  });
  
  describe('Copilot CLI args generation', () => {
    it('should use @agent syntax', () => {
      const instructions = agentLauncher.getLaunchInstructions({
        agent: 'marc',
        platform: 'copilot-cli'
      });
      
      expect(instructions).toContain('@bmad-agent-marc');
    });
    
    it('should include gh copilot command', () => {
      const instructions = agentLauncher.getLaunchInstructions({
        agent: 'marc',
        platform: 'copilot-cli'
      });
      
      expect(instructions).toContain('gh copilot');
    });
  });
});
