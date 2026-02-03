/**
 * Tests for Validator Module
 */

const validator = require('../lib/yanstaller/validator');
const fileUtils = require('../lib/utils/file-utils');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

describe('Validator Module', () => {
  let tempDir;
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'validator-test-'));
  });
  
  afterEach(async () => {
    await fs.remove(tempDir);
  });
  
  describe('checkBmadStructure', () => {
    test('passes when all directories exist', async () => {
      // Create required structure
      const dirs = [
        '_bmad',
        '_bmad/_config',
        '_bmad/_memory',
        '_bmad/_output',
        '_bmad/core/agents',
        '_bmad/bmm/agents',
        '_bmad/bmb/agents',
        '_bmad/tea/agents',
        '_bmad/cis/agents'
      ];
      
      for (const dir of dirs) {
        await fs.ensureDir(path.join(tempDir, dir));
      }
      
      const config = { projectRoot: tempDir };
      const result = await validator.checkBmadStructure(config);
      
      expect(result.passed).toBe(true);
      expect(result.id).toBe('bmad-structure');
      expect(result.severity).toBe('critical');
    });
    
    test('fails when directories are missing', async () => {
      const config = { projectRoot: tempDir };
      const result = await validator.checkBmadStructure(config);
      
      expect(result.passed).toBe(false);
      expect(result.message).toContain('Missing directories');
      expect(result.severity).toBe('critical');
    });
  });
  
  describe('checkAgentFiles', () => {
    test('passes when no agents configured', async () => {
      const config = { projectRoot: tempDir, agents: [] };
      const result = await validator.checkAgentFiles(config);
      
      expect(result.passed).toBe(true);
      expect(result.message).toBe('No agents to check');
    });
    
    test('passes when all agents exist', async () => {
      await fs.ensureDir(path.join(tempDir, '_bmad/bmb/agents'));
      await fs.writeFile(path.join(tempDir, '_bmad/bmb/agents/byan.md'), '# BYAN');
      
      const config = {
        projectRoot: tempDir,
        agents: ['byan']
      };
      const result = await validator.checkAgentFiles(config);
      
      expect(result.passed).toBe(true);
    });
    
    test('fails when agents are missing', async () => {
      await fs.ensureDir(path.join(tempDir, '_bmad/bmb/agents'));
      
      const config = {
        projectRoot: tempDir,
        agents: ['byan', 'nonexistent']
      };
      const result = await validator.checkAgentFiles(config);
      
      expect(result.passed).toBe(false);
      expect(result.message).toContain('nonexistent');
    });
  });
  
  describe('checkStubsYamlFrontmatter', () => {
    test('passes when no platforms configured', async () => {
      const config = { projectRoot: tempDir, targetPlatforms: [] };
      const result = await validator.checkStubsYamlFrontmatter(config);
      
      expect(result.passed).toBe(true);
      expect(result.message).toBe('No platforms to check');
    });
    
    test('passes when copilot-cli stubs are valid', async () => {
      const stubsDir = path.join(tempDir, '.github/agents');
      await fs.ensureDir(stubsDir);
      await fs.writeFile(
        path.join(stubsDir, 'byan.md'),
        '---\nname: byan\n---\n\nAgent content'
      );
      
      const config = {
        projectRoot: tempDir,
        targetPlatforms: ['copilot-cli']
      };
      const result = await validator.checkStubsYamlFrontmatter(config);
      
      expect(result.passed).toBe(true);
    });
    
    test('fails when stubs have invalid frontmatter', async () => {
      const stubsDir = path.join(tempDir, '.github/agents');
      await fs.ensureDir(stubsDir);
      await fs.writeFile(
        path.join(stubsDir, 'invalid.md'),
        'No frontmatter here'
      );
      
      const config = {
        projectRoot: tempDir,
        targetPlatforms: ['copilot-cli']
      };
      const result = await validator.checkStubsYamlFrontmatter(config);
      
      expect(result.passed).toBe(false);
      expect(result.message).toContain('invalid.md');
    });
    
    test('passes when codex stubs are valid', async () => {
      const stubsDir = path.join(tempDir, '.codex/prompts');
      await fs.ensureDir(stubsDir);
      await fs.writeFile(
        path.join(stubsDir, 'byan.md'),
        '# Agent\n\n<agent-activation CRITICAL="TRUE">\nContent\n</agent-activation>'
      );
      
      const config = {
        projectRoot: tempDir,
        targetPlatforms: ['codex']
      };
      const result = await validator.checkStubsYamlFrontmatter(config);
      
      expect(result.passed).toBe(true);
    });
  });
  
  describe('checkConfigFiles', () => {
    test('passes when config file is valid', async () => {
      const configPath = path.join(tempDir, '_bmad/bmb/config.yaml');
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeFile(
        configPath,
        'user_name: Test\ncommunication_language: English\nmode: minimal'
      );
      
      const config = { projectRoot: tempDir };
      const result = await validator.checkConfigFiles(config);
      
      expect(result.passed).toBe(true);
    });
    
    test('fails when config file is missing', async () => {
      const config = { projectRoot: tempDir };
      const result = await validator.checkConfigFiles(config);
      
      expect(result.passed).toBe(false);
      expect(result.message).toContain('not found');
    });
    
    test('fails when config is missing required fields', async () => {
      const configPath = path.join(tempDir, '_bmad/bmb/config.yaml');
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeFile(configPath, 'mode: minimal'); // Missing user_name
      
      const config = { projectRoot: tempDir };
      const result = await validator.checkConfigFiles(config);
      
      expect(result.passed).toBe(false);
      expect(result.message).toContain('user_name');
    });
  });
  
  describe('checkPlatformDetection', () => {
    test('passes when no platforms configured', async () => {
      const config = { targetPlatforms: [] };
      const result = await validator.checkPlatformDetection(config);
      
      expect(result.passed).toBe(true);
      expect(result.message).toBe('No platforms configured');
    });
    
    test('checks platform detection without throwing', async () => {
      const config = { targetPlatforms: ['copilot-cli'] };
      const result = await validator.checkPlatformDetection(config);
      
      // Should return result without throwing
      expect(result).toHaveProperty('passed');
      expect(result.id).toBe('platform-detection');
    });
  });
  
  describe('checkFilePermissions', () => {
    test('passes when permissions are correct', async () => {
      await fs.ensureDir(path.join(tempDir, '_bmad/_config'));
      
      const config = { projectRoot: tempDir };
      const result = await validator.checkFilePermissions(config);
      
      expect(result.id).toBe('file-permissions');
      expect(result.severity).toBe('warning');
    });
  });
  
  describe('checkManifests', () => {
    test('passes when manifest files are valid', async () => {
      const manifestPath = path.join(tempDir, '_bmad/_config/agent-manifest.csv');
      await fs.ensureDir(path.dirname(manifestPath));
      await fs.writeFile(
        manifestPath,
        'name,module,description\nbyan,bmb,Builder agent'
      );
      
      const config = { projectRoot: tempDir };
      const result = await validator.checkManifests(config);
      
      expect(result.passed).toBe(true);
    });
    
    test('passes when manifests are missing (optional)', async () => {
      const config = { projectRoot: tempDir };
      const result = await validator.checkManifests(config);
      
      expect(result.passed).toBe(true);
    });
  });
  
  describe('checkWorkflows', () => {
    test('passes when workflows exist', async () => {
      await fs.ensureDir(path.join(tempDir, '_bmad/bmb/workflows/test-workflow'));
      await fs.writeFile(
        path.join(tempDir, '_bmad/bmb/workflows/test-workflow/workflow.md'),
        '# Workflow'
      );
      
      const config = { projectRoot: tempDir };
      const result = await validator.checkWorkflows(config);
      
      expect(result.passed).toBe(true);
    });
  });
  
  describe('checkTemplates', () => {
    test('returns result without throwing', async () => {
      const config = { projectRoot: tempDir };
      const result = await validator.checkTemplates(config);
      
      expect(result).toHaveProperty('passed');
      expect(result.id).toBe('templates');
    });
  });
  
  describe('checkDependencies', () => {
    test('passes when required dependencies are installed', async () => {
      const config = {};
      const result = await validator.checkDependencies(config);
      
      expect(result.passed).toBe(true);
      expect(result.id).toBe('dependencies');
    });
  });
  
  describe('validate (integration)', () => {
    test('runs all 10 checks', async () => {
      const config = {
        projectRoot: tempDir,
        agents: [],
        targetPlatforms: []
      };
      
      const result = await validator.validate(config);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result.checks).toHaveLength(10);
    });
    
    test('returns success false when critical checks fail', async () => {
      const config = {
        projectRoot: tempDir,
        agents: ['nonexistent'],
        targetPlatforms: []
      };
      
      const result = await validator.validate(config);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
    
    test('collects errors and warnings separately', async () => {
      const config = {
        projectRoot: tempDir,
        agents: [],
        targetPlatforms: []
      };
      
      const result = await validator.validate(config);
      
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });
});
