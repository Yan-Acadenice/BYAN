/**
 * Tests for Platform Modules
 */

const copilotCli = require('../lib/platforms/copilot-cli');
const vscode = require('../lib/platforms/vscode');
const claudeCode = require('../lib/platforms/claude-code');
const codex = require('../lib/platforms/codex');
const fileUtils = require('../lib/utils/file-utils');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

describe('Platform Modules', () => {
  let tempDir;
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'platform-test-'));
  });
  
  afterEach(async () => {
    await fs.remove(tempDir);
  });
  
  describe('Copilot CLI Platform', () => {
    test('has correct name', () => {
      expect(copilotCli.name).toBe('GitHub Copilot CLI');
    });
    
    test('detect returns boolean or object', async () => {
      const result = await copilotCli.detect();
      expect(typeof result === 'boolean' || typeof result === 'object').toBe(true);
    });
    
    test('install creates .github/agents directory', async () => {
      const agents = ['byan', 'rachid'];
      const config = { mode: 'minimal' };
      
      const result = await copilotCli.install(tempDir, agents, config);
      
      expect(result.success).toBe(true);
      expect(result.installed).toBe(2);
      expect(await fs.pathExists(path.join(tempDir, '.github/agents'))).toBe(true);
    });
    
    test('generateStub creates valid stub file', async () => {
      const agents = ['test-agent'];
      const config = { mode: 'minimal' };
      
      await copilotCli.install(tempDir, agents, config);
      
      const stubPath = path.join(tempDir, '.github/agents/test-agent.md');
      expect(await fs.pathExists(stubPath)).toBe(true);
      
      const content = await fs.readFile(stubPath, 'utf8');
      expect(content).toContain('---');
      expect(content).toContain('name: test-agent');
      expect(content).toContain('<agent-activation');
      expect(content).toContain('LOAD the FULL agent file');
    });
    
    test('getPath returns correct stub directory', () => {
      expect(copilotCli.getPath()).toBe('.github/agents');
    });
  });
  
  describe('VSCode Platform', () => {
    test('has correct name', () => {
      expect(vscode.name).toBe('VSCode Copilot Extension');
    });
    
    test('detect delegates to copilot-cli', async () => {
      const result = await vscode.detect();
      expect(typeof result === 'boolean' || typeof result === 'object').toBe(true);
    });
    
    test('install creates same format as copilot-cli', async () => {
      const agents = ['byan'];
      const config = { mode: 'minimal' };
      
      const result = await vscode.install(tempDir, agents, config);
      
      expect(result.success).toBe(true);
      expect(result.installed).toBe(1);
      expect(await fs.pathExists(path.join(tempDir, '.github/agents'))).toBe(true);
    });
    
    test('getPath returns same as copilot-cli', () => {
      expect(vscode.getPath()).toBe(copilotCli.getPath());
    });
  });
  
  describe('Codex Platform', () => {
    test('has correct name', () => {
      expect(codex.name).toBe('Codex');
    });
    
    test('detect checks for .codex/prompts directory', async () => {
      // Should be false initially
      let result = await codex.detect();
      expect(result).toBe(false);
      
      // Create directory
      await fs.ensureDir('.codex/prompts');
      
      // Should be true now
      result = await codex.detect();
      expect(result).toBe(true);
      
      // Cleanup
      await fs.remove('.codex');
    });
    
    test('install creates .codex/prompts directory', async () => {
      const agents = ['byan'];
      const config = { mode: 'minimal' };
      
      const result = await codex.install(tempDir, agents, config);
      
      expect(result.success).toBe(true);
      expect(result.installed).toBe(1);
      expect(await fs.pathExists(path.join(tempDir, '.codex/prompts'))).toBe(true);
    });
    
    test('generatePrompt creates valid prompt file', async () => {
      const agents = ['test-agent'];
      const config = { mode: 'minimal' };
      
      await codex.install(tempDir, agents, config);
      
      const promptPath = path.join(tempDir, '.codex/prompts/test-agent.md');
      expect(await fs.pathExists(promptPath)).toBe(true);
      
      const content = await fs.readFile(promptPath, 'utf8');
      expect(content).toContain('# test-agent Agent');
      expect(content).toContain('<agent-activation');
      expect(content).toContain('LOAD the FULL agent file');
    });
    
    test('getPath returns correct prompts directory', () => {
      expect(codex.getPath()).toBe('.codex/prompts');
    });
  });
  
  describe('Claude Code Platform', () => {
    test('has correct name', () => {
      expect(claudeCode.name).toBe('Claude Code');
    });
    
    test('getConfigPath returns correct path for platform', () => {
      const configPath = claudeCode.getPath();
      expect(configPath).toBeTruthy();
      
      // Should contain Claude in path
      expect(configPath.toLowerCase()).toContain('claude');
    });
    
    test('detect checks for config file', async () => {
      const result = await claudeCode.detect();
      expect(typeof result).toBe('boolean');
    });
    
    test('install creates MCP server config', async () => {
      const agents = ['byan', 'rachid'];
      const config = { mode: 'minimal' };
      
      // Mock config path to temp directory
      const mockConfigPath = path.join(tempDir, 'claude_desktop_config.json');
      claudeCode.getPath = () => mockConfigPath;
      
      const result = await claudeCode.install(tempDir, agents, config);
      
      expect(result.success).toBe(true);
      expect(result.installed).toBe(2);
    });
    
    test('install updates existing config without overwrite', async () => {
      const mockConfigPath = path.join(tempDir, 'claude_desktop_config.json');
      
      // Create existing config
      const existingConfig = {
        otherSetting: 'value',
        mcpServers: {
          existingServer: {
            command: 'test'
          }
        }
      };
      await fs.ensureDir(path.dirname(mockConfigPath));
      await fs.writeFile(mockConfigPath, JSON.stringify(existingConfig, null, 2));
      
      // Mock getPath
      const originalGetPath = claudeCode.getPath;
      claudeCode.getPath = () => mockConfigPath;
      
      const agents = ['byan'];
      const config = { mode: 'minimal' };
      
      await claudeCode.install(tempDir, agents, config);
      
      const updatedContent = await fs.readFile(mockConfigPath, 'utf8');
      const updatedConfig = JSON.parse(updatedContent);
      
      // Should preserve existing settings
      expect(updatedConfig.otherSetting).toBe('value');
      expect(updatedConfig.mcpServers.existingServer).toBeDefined();
      
      // Should add BYAN server
      expect(updatedConfig.mcpServers.byan).toBeDefined();
      expect(updatedConfig.mcpServers.byan.command).toBe('npx');
      expect(updatedConfig.mcpServers.byan.args).toContain('@byan/mcp-server');
      
      // Restore original function
      claudeCode.getPath = originalGetPath;
    });
  });
  
  describe('Platform Integration', () => {
    test('all platforms have required exports', () => {
      const platforms = [copilotCli, vscode, claudeCode, codex];
      
      platforms.forEach(platform => {
        expect(platform.name).toBeTruthy();
        expect(typeof platform.detect).toBe('function');
        expect(typeof platform.install).toBe('function');
        expect(typeof platform.getPath).toBe('function');
      });
    });
    
    test('all platforms return consistent install result', async () => {
      const platforms = [copilotCli, vscode, codex];
      const agents = ['test'];
      const config = { mode: 'minimal' };
      
      for (const platform of platforms) {
        const result = await platform.install(tempDir, agents, config);
        
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('installed');
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.installed).toBe('number');
      }
    });
  });
});
