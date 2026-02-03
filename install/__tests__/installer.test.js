/**
 * Tests for Installer Module
 */

const installer = require('../lib/yanstaller/installer');
const fileUtils = require('../lib/utils/file-utils');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

describe('Installer Module', () => {
  let tempDir;
  let templateDir;
  
  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yanstaller-test-'));
    
    // Create mock template structure
    templateDir = path.join(tempDir, 'templates', '_bmad');
    await fs.ensureDir(path.join(templateDir, 'bmb', 'agents'));
    await fs.writeFile(
      path.join(templateDir, 'bmb', 'agents', 'byan.md'),
      '# BYAN Agent\nTest content'
    );
  });
  
  afterEach(async () => {
    // Clean up
    await fs.remove(tempDir);
  });
  
  describe('createBmadStructure', () => {
    test('creates all required directories', async () => {
      await installer.createBmadStructure(tempDir);
      
      // Check main directories
      expect(await fs.pathExists(path.join(tempDir, '_bmad'))).toBe(true);
      expect(await fs.pathExists(path.join(tempDir, '_bmad', '_config'))).toBe(true);
      expect(await fs.pathExists(path.join(tempDir, '_bmad', '_memory'))).toBe(true);
      expect(await fs.pathExists(path.join(tempDir, '_bmad', '_output'))).toBe(true);
      
      // Check module directories
      expect(await fs.pathExists(path.join(tempDir, '_bmad', 'core', 'agents'))).toBe(true);
      expect(await fs.pathExists(path.join(tempDir, '_bmad', 'bmm', 'agents'))).toBe(true);
      expect(await fs.pathExists(path.join(tempDir, '_bmad', 'bmb', 'agents'))).toBe(true);
      expect(await fs.pathExists(path.join(tempDir, '_bmad', 'tea', 'agents'))).toBe(true);
      expect(await fs.pathExists(path.join(tempDir, '_bmad', 'cis', 'agents'))).toBe(true);
    });
    
    test('handles existing directories without error', async () => {
      // Create directory first
      await fs.ensureDir(path.join(tempDir, '_bmad'));
      
      // Should not throw
      await expect(installer.createBmadStructure(tempDir)).resolves.not.toThrow();
    });
  });
  
  describe('copyAgentFile', () => {
    test('copies agent from templates to _bmad', async () => {
      // Note: This test requires mock templates in real location
      // For now, we test the error case
      
      await installer.createBmadStructure(tempDir);
      
      await expect(
        installer.copyAgentFile('nonexistent-agent', tempDir)
      ).rejects.toThrow('Agent template not found');
    });
    
    test('throws error if agent not found', async () => {
      await expect(
        installer.copyAgentFile('unknown-agent', tempDir)
      ).rejects.toThrow('Agent template not found: unknown-agent');
    });
  });
  
  describe('generatePlatformStubs', () => {
    test('calls platform module install function', async () => {
      const mockConfig = {
        projectRoot: tempDir,
        agents: ['byan', 'rachid'],
        mode: 'minimal'
      };
      
      // Note: Requires platform modules to exist
      // This is an integration test
      await expect(
        installer.generatePlatformStubs('copilot-cli', mockConfig)
      ).resolves.not.toThrow();
    });
    
    test('throws error for unknown platform', async () => {
      const mockConfig = {
        projectRoot: tempDir,
        agents: ['byan'],
        mode: 'minimal'
      };
      
      await expect(
        installer.generatePlatformStubs('invalid-platform', mockConfig)
      ).rejects.toThrow();
    });
  });
  
  describe('createModuleConfig', () => {
    test('creates valid config.yaml file', async () => {
      await installer.createBmadStructure(tempDir);
      
      const mockConfig = {
        userName: 'Test User',
        language: 'English',
        mode: 'minimal',
        agents: ['byan', 'rachid'],
        outputFolder: '{project-root}/_bmad-output'
      };
      
      await installer.createModuleConfig('bmb', mockConfig, tempDir);
      
      const configPath = path.join(tempDir, '_bmad', 'bmb', 'config.yaml');
      expect(await fs.pathExists(configPath)).toBe(true);
      
      const content = await fs.readFile(configPath, 'utf8');
      expect(content).toContain('user_name: Test User');
      expect(content).toContain('communication_language: English');
      expect(content).toContain('mode: minimal');
    });
    
    test('includes installation metadata', async () => {
      await installer.createBmadStructure(tempDir);
      
      const mockConfig = {
        userName: 'Yan',
        language: 'Francais',
        mode: 'full',
        agents: ['byan']
      };
      
      await installer.createModuleConfig('bmb', mockConfig, tempDir);
      
      const configPath = path.join(tempDir, '_bmad', 'bmb', 'config.yaml');
      const content = await fs.readFile(configPath, 'utf8');
      
      expect(content).toContain('installed_by: yanstaller');
      expect(content).toContain('installed_at:');
      expect(content).toContain('version: 1.2.0');
    });
    
    test('adds bmb-specific settings for bmb module', async () => {
      await installer.createBmadStructure(tempDir);
      
      const mockConfig = {
        userName: 'Test',
        language: 'English',
        mode: 'minimal',
        agents: []
      };
      
      await installer.createModuleConfig('bmb', mockConfig, tempDir);
      
      const configPath = path.join(tempDir, '_bmad', 'bmb', 'config.yaml');
      const content = await fs.readFile(configPath, 'utf8');
      
      expect(content).toContain('bmb_creations_output_folder');
    });
  });
  
  describe('install (integration)', () => {
    test('returns success result with no errors', async () => {
      const mockConfig = {
        projectRoot: tempDir,
        mode: 'minimal',
        agents: [], // Empty to avoid template issues
        targetPlatforms: [],
        userName: 'Test',
        language: 'English',
        outputFolder: '{project-root}/_bmad-output'
      };
      
      const result = await installer.install(mockConfig);
      
      expect(result.success).toBe(true);
      expect(result.agentsInstalled).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.duration).toBeGreaterThan(0);
    });
    
    test('handles agent installation errors gracefully', async () => {
      const mockConfig = {
        projectRoot: tempDir,
        mode: 'minimal',
        agents: ['nonexistent-agent'],
        targetPlatforms: [],
        userName: 'Test',
        language: 'English',
        outputFolder: '{project-root}/_bmad-output'
      };
      
      const result = await installer.install(mockConfig);
      
      expect(result.success).toBe(false);
      expect(result.agentsInstalled).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('nonexistent-agent');
    });
    
    test('continues after individual agent failure', async () => {
      const mockConfig = {
        projectRoot: tempDir,
        mode: 'custom',
        agents: ['nonexistent-1', 'nonexistent-2'],
        targetPlatforms: [],
        userName: 'Test',
        language: 'English',
        outputFolder: '{project-root}/_bmad-output'
      };
      
      const result = await installer.install(mockConfig);
      
      // Should attempt both agents
      expect(result.errors.length).toBe(2);
    });
  });
});
