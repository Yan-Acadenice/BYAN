/**
 * Tests for Recommender Module
 */

const recommender = require('../lib/yanstaller/recommender');
const fileUtils = require('../lib/utils/file-utils');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

// Mock detection result
const mockDetection = {
  os: 'linux',
  osVersion: '22.04',
  nodeVersion: '20.11.0',
  hasGit: true,
  gitVersion: '2.43.0',
  platforms: [
    { name: 'copilot-cli', detected: true },
    { name: 'vscode', detected: false },
    { name: 'claude', detected: false },
    { name: 'codex', detected: false }
  ]
};

describe('Recommender Module', () => {
  let tempDir;
  
  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yanstaller-test-'));
  });
  
  afterEach(async () => {
    // Clean up
    await fs.remove(tempDir);
  });
  
  describe('analyzePackageJson', () => {
    test('detects React frontend project', async () => {
      const packageJson = {
        dependencies: {
          'react': '^18.2.0',
          'react-dom': '^18.2.0'
        }
      };
      const pkgPath = path.join(tempDir, 'package.json');
      await fs.writeJSON(pkgPath, packageJson);
      
      const result = await recommender.analyzePackageJson(pkgPath);
      
      expect(result.isFrontend).toBe(true);
      expect(result.isBackend).toBe(false);
      expect(result.framework).toBe('React');
    });
    
    test('detects Express backend project', async () => {
      const packageJson = {
        dependencies: {
          'express': '^4.18.0'
        }
      };
      const pkgPath = path.join(tempDir, 'package.json');
      await fs.writeJSON(pkgPath, packageJson);
      
      const result = await recommender.analyzePackageJson(pkgPath);
      
      expect(result.isFrontend).toBe(false);
      expect(result.isBackend).toBe(true);
      expect(result.framework).toBe('Express');
    });
    
    test('detects fullstack project (React + Express)', async () => {
      const packageJson = {
        dependencies: {
          'react': '^18.2.0',
          'express': '^4.18.0'
        }
      };
      const pkgPath = path.join(tempDir, 'package.json');
      await fs.writeJSON(pkgPath, packageJson);
      
      const result = await recommender.analyzePackageJson(pkgPath);
      
      expect(result.isFrontend).toBe(true);
      expect(result.isBackend).toBe(true);
      expect(result.framework).toBe('React'); // First detected
    });
    
    test('handles missing package.json', async () => {
      const pkgPath = path.join(tempDir, 'nonexistent.json');
      
      const result = await recommender.analyzePackageJson(pkgPath);
      
      expect(result.isFrontend).toBe(false);
      expect(result.isBackend).toBe(false);
      expect(result.framework).toBe('unknown');
    });
  });
  
  describe('detectProjectType', () => {
    test('returns frontend for frontend-only project', () => {
      const analysis = {
        isFrontend: true,
        isBackend: false,
        deps: { 'react': '^18.0.0' }
      };
      
      const type = recommender.detectProjectType(analysis);
      
      expect(type).toBe('frontend');
    });
    
    test('returns backend for backend-only project', () => {
      const analysis = {
        isFrontend: false,
        isBackend: true,
        deps: { 'express': '^4.0.0' }
      };
      
      const type = recommender.detectProjectType(analysis);
      
      expect(type).toBe('backend');
    });
    
    test('returns fullstack for combined project', () => {
      const analysis = {
        isFrontend: true,
        isBackend: true,
        deps: { 'react': '^18.0.0', 'express': '^4.0.0' }
      };
      
      const type = recommender.detectProjectType(analysis);
      
      expect(type).toBe('fullstack');
    });
    
    test('returns library for build tool project', () => {
      const analysis = {
        isFrontend: false,
        isBackend: false,
        deps: { 'typescript': '^5.0.0', 'rollup': '^3.0.0' }
      };
      
      const type = recommender.detectProjectType(analysis);
      
      expect(type).toBe('library');
    });
    
    test('returns unknown for empty project', () => {
      const analysis = {
        isFrontend: false,
        isBackend: false,
        deps: {}
      };
      
      const type = recommender.detectProjectType(analysis);
      
      expect(type).toBe('unknown');
    });
  });
  
  describe('detectFramework', () => {
    test('detects React', () => {
      const deps = { 'react': '^18.0.0' };
      expect(recommender.detectFramework(deps)).toBe('React');
    });
    
    test('detects Next.js', () => {
      const deps = { 'next': '^14.0.0' };
      expect(recommender.detectFramework(deps)).toBe('Next.js');
    });
    
    test('detects Vue', () => {
      const deps = { 'vue': '^3.0.0' };
      expect(recommender.detectFramework(deps)).toBe('Vue');
    });
    
    test('detects Express', () => {
      const deps = { 'express': '^4.0.0' };
      expect(recommender.detectFramework(deps)).toBe('Express');
    });
    
    test('returns unknown for no frameworks', () => {
      const deps = { 'lodash': '^4.0.0' };
      expect(recommender.detectFramework(deps)).toBe('unknown');
    });
  });
  
  describe('getRecommendedAgents', () => {
    test('recommends UX designer for frontend projects', () => {
      const agents = recommender.getRecommendedAgents('frontend', mockDetection.platforms);
      
      expect(agents).toContain('ux-designer');
      expect(agents).toContain('byan');
      expect(agents).toContain('dev');
      expect(agents).toContain('quinn');
    });
    
    test('recommends architect for backend projects', () => {
      const agents = recommender.getRecommendedAgents('backend', mockDetection.platforms);
      
      expect(agents).toContain('architect');
      expect(agents).toContain('dev');
      expect(agents).toContain('quinn');
    });
    
    test('recommends full suite for fullstack projects', () => {
      const agents = recommender.getRecommendedAgents('fullstack', mockDetection.platforms);
      
      expect(agents).toContain('architect');
      expect(agents).toContain('ux-designer');
      expect(agents).toContain('dev');
      expect(agents).toContain('quinn');
      expect(agents).toContain('pm');
    });
    
    test('includes MARC when Copilot CLI detected', () => {
      const agents = recommender.getRecommendedAgents('backend', mockDetection.platforms);
      
      expect(agents).toContain('marc');
    });
    
    test('excludes MARC when Copilot CLI not detected', () => {
      const noCopilotPlatforms = [
        { name: 'copilot-cli', detected: false },
        { name: 'vscode', detected: true }
      ];
      
      const agents = recommender.getRecommendedAgents('backend', noCopilotPlatforms);
      
      expect(agents).not.toContain('marc');
    });
  });
  
  describe('getAgentList', () => {
    test('returns minimal agents for minimal mode', () => {
      const agents = recommender.getAgentList('minimal');
      
      expect(agents).toHaveLength(5);
      expect(agents).toContain('byan');
      expect(agents).toContain('rachid');
      expect(agents).toContain('marc');
      expect(agents).toContain('patnote');
      expect(agents).toContain('carmack');
    });
    
    test('returns all 25 agents for full mode', () => {
      const agents = recommender.getAgentList('full');
      
      expect(agents.length).toBeGreaterThan(20);
      expect(agents).toContain('byan');
      expect(agents).toContain('analyst');
      expect(agents).toContain('architect');
      expect(agents).toContain('tea');
    });
    
    test('returns custom agents for custom mode', () => {
      const custom = ['byan', 'dev', 'quinn'];
      const agents = recommender.getAgentList('custom', custom);
      
      expect(agents).toEqual(custom);
    });
    
    test('defaults to minimal for unknown mode', () => {
      const agents = recommender.getAgentList('invalid');
      
      expect(agents).toHaveLength(5);
    });
  });
  
  describe('generateRationale', () => {
    test('generates rationale for frontend project', () => {
      const agents = ['byan', 'rachid', 'ux-designer', 'dev'];
      const rationale = recommender.generateRationale('frontend', 'React', agents, mockDetection);
      
      expect(rationale).toContain('Frontend project');
      expect(rationale).toContain('React');
      expect(rationale).toContain('UX design');
    });
    
    test('generates rationale for backend project', () => {
      const agents = ['byan', 'architect', 'dev'];
      const rationale = recommender.generateRationale('backend', 'Express', agents, mockDetection);
      
      expect(rationale).toContain('Backend project');
      expect(rationale).toContain('Express');
      expect(rationale).toContain('architecture');
    });
    
    test('mentions MARC when Copilot CLI detected', () => {
      const agents = ['byan', 'marc'];
      const rationale = recommender.generateRationale('backend', 'unknown', agents, mockDetection);
      
      expect(rationale).toContain('MARC');
      expect(rationale).toContain('Copilot CLI');
    });
  });
});
