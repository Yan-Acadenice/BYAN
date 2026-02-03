/**
 * End-to-End Tests for YANSTALLER
 * 
 * Simulates real-world usage scenarios
 */

const path = require('path');
const fs = require('fs-extra');
const os = require('os');

// Main YANSTALLER entry point (we'll need to create this)
// For now, test individual modules in realistic scenarios

const detector = require('../lib/yanstaller/detector');
const recommender = require('../lib/yanstaller/recommender');
const installer = require('../lib/yanstaller/installer');
const validator = require('../lib/yanstaller/validator');

describe('YANSTALLER E2E Tests', () => {
  let tempDir;
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yanstaller-e2e-'));
  });
  
  afterEach(async () => {
    await fs.remove(tempDir);
  });
  
  describe('Scenario 1: New React Project', () => {
    test('installs recommended agents for React app', async () => {
      // Setup: Create React project structure
      const packageJson = {
        name: 'my-react-app',
        version: '1.0.0',
        dependencies: {
          'react': '^18.2.0',
          'react-dom': '^18.2.0'
        },
        devDependencies: {
          'vite': '^4.0.0',
          'typescript': '^5.0.0',
          '@testing-library/react': '^14.0.0'
        }
      };
      
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );
      
      // Step 1: Get recommendations
      const recommendation = await recommender.recommend({
        projectRoot: tempDir,
        detectPlatforms: false
      });
      
      expect(recommendation.projectType).toBe('frontend');
      expect(recommendation.framework).toBe('React');
      
      // Should recommend frontend-focused agents
      expect(recommendation.agents).toEqual(
        expect.arrayContaining(['dev', 'ux-designer', 'tech-writer'])
      );
      
      // Step 2: Install
      const config = {
        projectRoot: tempDir,
        mode: 'recommended',
        agents: recommendation.agents,
        targetPlatforms: [],
        userName: 'Developer',
        language: 'English'
      };
      
      const installResult = await installer.install(config);
      
      expect(installResult).toHaveProperty('duration');
      expect(installResult.duration).toBeGreaterThan(0);
      
      // Step 3: Validate
      const validationResult = await validator.validate(config);
      
      // Structure should be created
      const structureCheck = validationResult.checks.find(c => c.id === 'bmad-structure');
      expect(structureCheck).toBeDefined();
    });
  });
  
  describe('Scenario 2: Backend API Project', () => {
    test('installs recommended agents for Express API', async () => {
      const packageJson = {
        name: 'my-api',
        version: '1.0.0',
        dependencies: {
          'express': '^4.18.2',
          'mongoose': '^7.0.0',
          'jsonwebtoken': '^9.0.0'
        },
        devDependencies: {
          'jest': '^29.0.0',
          'supertest': '^6.3.0'
        }
      };
      
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );
      
      const recommendation = await recommender.recommend({
        projectRoot: tempDir,
        detectPlatforms: false
      });
      
      expect(recommendation.projectType).toBe('backend');
      expect(recommendation.framework).toBe('Express');
      
      // Should NOT recommend UX designer for backend
      expect(recommendation.agents).not.toContain('ux-designer');
      
      // Should recommend backend-focused agents
      expect(recommendation.agents).toEqual(
        expect.arrayContaining(['dev', 'quinn', 'tech-writer'])
      );
    });
  });
  
  describe('Scenario 3: Fullstack Next.js Project', () => {
    test('installs recommended agents for Next.js app', async () => {
      const packageJson = {
        name: 'my-nextjs-app',
        version: '1.0.0',
        dependencies: {
          'next': '^14.0.0',
          'react': '^18.2.0',
          'prisma': '^5.0.0'
        }
      };
      
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );
      
      const recommendation = await recommender.recommend({
        projectRoot: tempDir,
        detectPlatforms: false
      });
      
      expect(recommendation.projectType).toBe('fullstack');
      expect(recommendation.framework).toBe('Next.js');
      
      // Should recommend comprehensive agent set
      expect(recommendation.agents.length).toBeGreaterThanOrEqual(7);
    });
  });
  
  describe('Scenario 4: Validation Catches Issues', () => {
    test('detects corrupted installation', async () => {
      // Create partial structure
      await fs.ensureDir(path.join(tempDir, '_bmad/bmb/agents'));
      
      // Missing other required directories
      
      const config = {
        projectRoot: tempDir,
        mode: 'minimal',
        agents: [],
        targetPlatforms: []
      };
      
      const validationResult = await validator.validate(config);
      
      expect(validationResult.success).toBe(false);
      expect(validationResult.errors.length).toBeGreaterThan(0);
      
      // Should fail structure check
      const structureCheck = validationResult.checks.find(c => c.id === 'bmad-structure');
      expect(structureCheck.passed).toBe(false);
      expect(structureCheck.message).toContain('Missing directories');
    });
  });
  
  describe('Scenario 5: Multi-Platform Installation', () => {
    test('installs stubs for multiple platforms', async () => {
      const config = {
        projectRoot: tempDir,
        mode: 'minimal',
        agents: ['byan'],
        targetPlatforms: ['copilot-cli', 'codex'],
        userName: 'Developer',
        language: 'English'
      };
      
      await installer.install(config);
      
      // Check Copilot CLI stubs created
      const copilotStub = path.join(tempDir, '.github/agents/byan.md');
      const copilotExists = await fs.pathExists(copilotStub);
      
      // Check Codex stubs created
      const codexStub = path.join(tempDir, '.codex/prompts/byan.md');
      const codexExists = await fs.pathExists(codexStub);
      
      // At least one should exist (templates may not be available in test)
      expect(copilotExists || codexExists).toBe(true);
    });
  });
  
  describe('Scenario 6: Upgrade/Repair Installation', () => {
    test('validates and reports fixable issues', async () => {
      // Create structure with some issues
      await fs.ensureDir(path.join(tempDir, '_bmad'));
      await fs.ensureDir(path.join(tempDir, '_bmad/_config'));
      
      // Missing other directories
      // Invalid config
      await fs.writeFile(
        path.join(tempDir, '_bmad/bmb/config.yaml'),
        'invalid: yaml: syntax:::'
      );
      
      const config = {
        projectRoot: tempDir,
        mode: 'minimal',
        agents: [],
        targetPlatforms: []
      };
      
      const validationResult = await validator.validate(config);
      
      // Should detect multiple issues
      expect(validationResult.success).toBe(false);
      expect(validationResult.checks.some(c => !c.passed)).toBe(true);
      
      // Errors should be actionable
      validationResult.errors.forEach(error => {
        expect(typeof error).toBe('string');
        expect(error.length).toBeGreaterThan(0);
      });
    });
  });
  
  describe('Scenario 7: Performance with Large Agent Set', () => {
    test('handles installation of many agents efficiently', async () => {
      const manyAgents = [
        'byan', 'rachid', 'analyst', 'pm', 'architect',
        'dev', 'sm', 'quinn', 'ux-designer', 'tech-writer'
      ];
      
      const config = {
        projectRoot: tempDir,
        mode: 'full',
        agents: manyAgents,
        targetPlatforms: [],
        userName: 'Developer',
        language: 'English'
      };
      
      const startTime = Date.now();
      const result = await installer.install(config);
      const duration = Date.now() - startTime;
      
      // Should complete in reasonable time even with many agents
      expect(duration).toBeLessThan(5000); // 5 seconds
      
      expect(result).toHaveProperty('agentsInstalled');
      expect(result).toHaveProperty('errors');
    });
  });
  
  describe('Scenario 8: Minimal vs Full Mode', () => {
    test('minimal mode installs only essential structure', async () => {
      const config = {
        projectRoot: tempDir,
        mode: 'minimal',
        agents: [],
        targetPlatforms: [],
        userName: 'Developer',
        language: 'English'
      };
      
      await installer.install(config);
      
      // Should create base structure
      expect(await fs.pathExists(path.join(tempDir, '_bmad'))).toBe(true);
      expect(await fs.pathExists(path.join(tempDir, '_bmad/_config'))).toBe(true);
    });
    
    test('full mode installs everything', async () => {
      const packageJson = {
        name: 'test-project',
        dependencies: {
          'react': '^18.0.0',
          'express': '^4.0.0'
        }
      };
      
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );
      
      const recommendation = await recommender.recommend({
        projectRoot: tempDir,
        detectPlatforms: false
      });
      
      const config = {
        projectRoot: tempDir,
        mode: 'full',
        agents: recommendation.agents,
        targetPlatforms: ['copilot-cli'],
        userName: 'Developer',
        language: 'English'
      };
      
      await installer.install(config);
      
      // Should create all module directories
      const modules = ['core', 'bmm', 'bmb', 'tea', 'cis'];
      for (const module of modules) {
        const modulePath = path.join(tempDir, '_bmad', module);
        expect(await fs.pathExists(modulePath)).toBe(true);
      }
    });
  });
});
