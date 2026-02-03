/**
 * Integration Tests for YANSTALLER
 * 
 * Tests the complete flow: Detect → Recommend → Install → Validate
 */

const detector = require('../lib/yanstaller/detector');
const recommender = require('../lib/yanstaller/recommender');
const installer = require('../lib/yanstaller/installer');
const validator = require('../lib/yanstaller/validator');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

describe('YANSTALLER Integration Tests', () => {
  let tempDir;
  let mockPackageJson;
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yanstaller-integration-'));
    
    // Create mock package.json
    mockPackageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        'react': '^18.0.0',
        'express': '^4.18.0'
      },
      devDependencies: {
        'jest': '^29.0.0',
        'typescript': '^5.0.0'
      }
    };
    
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(mockPackageJson, null, 2)
    );
  });
  
  afterEach(async () => {
    await fs.remove(tempDir);
  });
  
  describe('Full Installation Flow', () => {
    test('completes detect → recommend → install → validate flow', async () => {
      // Step 1: Detection
      const detectionResult = await detector.detect();
      
      expect(detectionResult).toHaveProperty('os');
      expect(detectionResult).toHaveProperty('node');
      expect(detectionResult).toHaveProperty('platforms');
      expect(detectionResult.node.detected).toBe(true);
      
      // Step 2: Recommendation
      const recommendation = await recommender.recommend({
        projectRoot: tempDir,
        detectPlatforms: false // Skip platform detection in tests
      });
      
      expect(recommendation).toHaveProperty('agents');
      expect(recommendation).toHaveProperty('projectType');
      expect(recommendation).toHaveProperty('rationale');
      expect(Array.isArray(recommendation.agents)).toBe(true);
      
      // Should recommend full stack agents for React + Express
      expect(recommendation.projectType).toBe('fullstack');
      expect(recommendation.agents.length).toBeGreaterThan(0);
      
      // Step 3: Installation
      const installConfig = {
        projectRoot: tempDir,
        mode: 'minimal',
        agents: recommendation.agents.slice(0, 2), // Install first 2 agents only
        targetPlatforms: [],
        userName: 'TestUser',
        language: 'English',
        outputFolder: '{project-root}/_bmad-output'
      };
      
      const installResult = await installer.install(installConfig);
      
      expect(installResult).toHaveProperty('success');
      expect(installResult).toHaveProperty('agentsInstalled');
      expect(installResult).toHaveProperty('duration');
      
      // Step 4: Validation
      const validationResult = await validator.validate(installConfig);
      
      expect(validationResult).toHaveProperty('success');
      expect(validationResult).toHaveProperty('checks');
      expect(validationResult.checks).toHaveLength(10);
      
      // At least some checks should pass (structure, dependencies)
      const passedChecks = validationResult.checks.filter(c => c.passed);
      expect(passedChecks.length).toBeGreaterThan(0);
    }, 30000); // 30s timeout for full flow
    
    test('handles errors gracefully in flow', async () => {
      // Corrupt package.json
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        'INVALID JSON'
      );
      
      // Recommendation should handle gracefully
      const recommendation = await recommender.recommend({
        projectRoot: tempDir,
        detectPlatforms: false
      });
      
      // Should still return result with defaults
      expect(recommendation).toHaveProperty('agents');
      expect(recommendation).toHaveProperty('projectType');
    });
  });
  
  describe('Detect → Recommend Integration', () => {
    test('uses platform detection in recommendations', async () => {
      const detectionResult = await detector.detect();
      
      // Pass detected platforms to recommender
      const recommendation = await recommender.recommend({
        projectRoot: tempDir,
        detectedPlatforms: detectionResult.platforms
      });
      
      expect(recommendation).toHaveProperty('agents');
      
      // If Copilot CLI detected, should recommend MARC
      const copilotDetected = detectionResult.platforms.some(
        p => p.name === 'GitHub Copilot CLI' && p.detected
      );
      
      if (copilotDetected) {
        expect(recommendation.agents).toContain('marc');
      }
    });
    
    test('recommends appropriate agents based on project type', async () => {
      // Frontend-only project
      const frontendPackage = {
        name: 'frontend-project',
        dependencies: {
          'react': '^18.0.0',
          'vue': '^3.0.0'
        }
      };
      
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(frontendPackage, null, 2)
      );
      
      const recommendation = await recommender.recommend({
        projectRoot: tempDir,
        detectPlatforms: false
      });
      
      expect(recommendation.projectType).toBe('frontend');
      
      // Should include UX designer for frontend
      expect(recommendation.agents).toContain('ux-designer');
    });
  });
  
  describe('Recommend → Install Integration', () => {
    test('installs all recommended agents', async () => {
      const recommendation = await recommender.recommend({
        projectRoot: tempDir,
        detectPlatforms: false
      });
      
      const installConfig = {
        projectRoot: tempDir,
        mode: 'recommended',
        agents: recommendation.agents,
        targetPlatforms: [],
        userName: 'TestUser',
        language: 'English'
      };
      
      const installResult = await installer.install(installConfig);
      
      // Installation may fail for missing templates, but should not throw
      expect(installResult).toHaveProperty('success');
      expect(installResult).toHaveProperty('agentsInstalled');
    });
  });
  
  describe('Install → Validate Integration', () => {
    test('validation catches installation issues', async () => {
      // Install with non-existent agents
      const installConfig = {
        projectRoot: tempDir,
        mode: 'custom',
        agents: ['nonexistent-agent'],
        targetPlatforms: [],
        userName: 'TestUser',
        language: 'English'
      };
      
      await installer.install(installConfig);
      
      // Validation should detect missing agents
      const validationResult = await validator.validate(installConfig);
      
      expect(validationResult.success).toBe(false);
      
      // Should have agent files check failure
      const agentCheck = validationResult.checks.find(c => c.id === 'agent-files');
      expect(agentCheck).toBeDefined();
      expect(agentCheck.passed).toBe(false);
    });
    
    test('validation passes for successful installation', async () => {
      // Create minimal valid structure manually
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
      
      // Create config
      await fs.writeFile(
        path.join(tempDir, '_bmad/bmb/config.yaml'),
        'user_name: Test\ncommunication_language: English\nmode: minimal'
      );
      
      const installConfig = {
        projectRoot: tempDir,
        mode: 'minimal',
        agents: [],
        targetPlatforms: []
      };
      
      const validationResult = await validator.validate(installConfig);
      
      // Structure and config checks should pass
      const structureCheck = validationResult.checks.find(c => c.id === 'bmad-structure');
      const configCheck = validationResult.checks.find(c => c.id === 'config-files');
      
      expect(structureCheck.passed).toBe(true);
      expect(configCheck.passed).toBe(true);
    });
  });
  
  describe('Error Propagation', () => {
    test('detector errors do not stop recommendation', async () => {
      // Even if detection fails, recommendation should work
      const recommendation = await recommender.recommend({
        projectRoot: tempDir,
        detectPlatforms: false,
        detectedPlatforms: [] // Empty platforms
      });
      
      expect(recommendation).toHaveProperty('agents');
      expect(recommendation.agents.length).toBeGreaterThan(0);
    });
    
    test('installation errors are captured in validation', async () => {
      const installConfig = {
        projectRoot: tempDir,
        mode: 'custom',
        agents: ['invalid1', 'invalid2'],
        targetPlatforms: []
      };
      
      const installResult = await installer.install(installConfig);
      
      // Installation should complete but with errors
      expect(installResult).toHaveProperty('errors');
      expect(installResult.errors.length).toBeGreaterThan(0);
      
      // Validation should detect these issues
      const validationResult = await validator.validate(installConfig);
      expect(validationResult.success).toBe(false);
    });
  });
  
  describe('Performance', () => {
    test('full flow completes within reasonable time', async () => {
      const startTime = Date.now();
      
      // Run full flow
      await detector.detect();
      
      const recommendation = await recommender.recommend({
        projectRoot: tempDir,
        detectPlatforms: false
      });
      
      const installConfig = {
        projectRoot: tempDir,
        mode: 'minimal',
        agents: recommendation.agents.slice(0, 1),
        targetPlatforms: []
      };
      
      await installer.install(installConfig);
      await validator.validate(installConfig);
      
      const duration = Date.now() - startTime;
      
      // Should complete in under 10 seconds
      expect(duration).toBeLessThan(10000);
    });
  });
});
