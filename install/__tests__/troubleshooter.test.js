/**
 * Tests for Troubleshooter Module
 */

const troubleshooter = require('../lib/yanstaller/troubleshooter');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

describe('Troubleshooter Module', () => {
  let tempDir;
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'troubleshooter-test-'));
  });
  
  afterEach(async () => {
    await fs.remove(tempDir);
  });
  
  describe('diagnose', () => {
    test('diagnoses Node version error', async () => {
      const error = new Error('Node version 14.0.0 is not supported');
      const diagnostic = await troubleshooter.diagnose(error, {});
      
      expect(diagnostic.errorCode).toBe('NODE_VERSION');
      expect(diagnostic.severity).toBe('critical');
      expect(diagnostic.canAutoFix).toBe(false);
      expect(diagnostic.solution).toContain('Node.js');
    });
    
    test('diagnoses permission error', async () => {
      const error = new Error('EACCES: permission denied');
      const diagnostic = await troubleshooter.diagnose(error, { projectRoot: tempDir });
      
      expect(diagnostic.errorCode).toBe('PERMISSION');
      expect(diagnostic.canAutoFix).toBe(true);
      expect(diagnostic.autoFix).toBeDefined();
    });
    
    test('diagnoses not found error', async () => {
      const error = new Error('ENOENT: no such file or directory');
      const diagnostic = await troubleshooter.diagnose(error, { projectRoot: tempDir });
      
      expect(diagnostic.errorCode).toBe('NOT_FOUND');
      expect(diagnostic.canAutoFix).toBe(true);
    });
    
    test('diagnoses Git missing error', async () => {
      const error = new Error('git command not found');
      const diagnostic = await troubleshooter.diagnose(error, {});
      
      expect(diagnostic.errorCode).toBe('GIT_MISSING');
      expect(diagnostic.solution).toContain('git-scm.com');
    });
    
    test('diagnoses disk space error', async () => {
      const error = new Error('ENOSPC: no space left on device');
      const diagnostic = await troubleshooter.diagnose(error, {});
      
      expect(diagnostic.errorCode).toBe('DISK_SPACE');
      expect(diagnostic.severity).toBe('critical');
    });
    
    test('diagnoses network error', async () => {
      const error = new Error('ETIMEDOUT: network timeout');
      const diagnostic = await troubleshooter.diagnose(error, {});
      
      expect(diagnostic.errorCode).toBe('NETWORK');
      expect(diagnostic.solution).toContain('connection');
    });
    
    test('diagnoses corrupted file error', async () => {
      const error = new Error('YAML parse error: invalid format');
      const diagnostic = await troubleshooter.diagnose(error, { projectRoot: tempDir });
      
      expect(diagnostic.errorCode).toBe('CORRUPTED');
      expect(diagnostic.canAutoFix).toBe(true);
    });
    
    test('diagnoses missing dependency error', async () => {
      const error = new Error('Cannot find module "nonexistent-package"');
      const diagnostic = await troubleshooter.diagnose(error, { projectRoot: tempDir });
      
      expect(diagnostic.errorCode).toBe('MISSING_DEP');
      expect(diagnostic.solution).toContain('npm install');
    });
    
    test('handles unknown error gracefully', async () => {
      const error = new Error('Some weird unknown error');
      const diagnostic = await troubleshooter.diagnose(error, {});
      
      expect(diagnostic.errorCode).toBe('UNKNOWN');
      expect(diagnostic.canAutoFix).toBe(false);
    });
  });
  
  describe('suggestNodeUpgrade', () => {
    test('provides platform-specific instructions', () => {
      const instructions = troubleshooter.suggestNodeUpgrade('14.0.0', '16.0.0');
      
      expect(instructions).toContain('14.0.0');
      expect(instructions).toContain('16.0.0');
      
      // Should contain platform-specific command
      const platform = os.platform();
      if (platform === 'win32') {
        expect(instructions).toContain('winget');
      } else if (platform === 'darwin') {
        expect(instructions).toContain('brew');
      } else if (platform === 'linux') {
        expect(instructions).toContain('nvm');
      }
    });
  });
  
  describe('checkCommonIssues', () => {
    test('returns array of detected issues', async () => {
      const issues = await troubleshooter.checkCommonIssues({ projectRoot: tempDir });
      
      expect(Array.isArray(issues)).toBe(true);
      // May or may not have issues depending on environment
    });
    
    test('detects missing dependencies', async () => {
      // This test assumes fs-extra, js-yaml, chalk are installed
      const issues = await troubleshooter.checkCommonIssues({});
      
      // Should not complain about installed deps
      expect(issues.every(i => !i.includes('fs-extra'))).toBe(true);
    });
  });
  
  describe('fixPermissions', () => {
    test('attempts to fix permissions without throwing', async () => {
      await fs.ensureDir(path.join(tempDir, 'testdir'));
      
      // Should not throw
      await expect(
        troubleshooter.fixPermissions(path.join(tempDir, 'testdir'))
      ).resolves.not.toThrow();
    });
  });
  
  describe('repairStructure', () => {
    test('recreates _bmad directory structure', async () => {
      await troubleshooter.repairStructure(tempDir);
      
      // Should create base directories
      expect(await fs.pathExists(path.join(tempDir, '_bmad'))).toBe(true);
      expect(await fs.pathExists(path.join(tempDir, '_bmad/_config'))).toBe(true);
    });
  });
  
  describe('resetConfig', () => {
    test('creates default config file', async () => {
      await fs.ensureDir(path.join(tempDir, '_bmad/bmb'));
      
      await troubleshooter.resetConfig(tempDir);
      
      const configPath = path.join(tempDir, '_bmad/bmb/config.yaml');
      expect(await fs.pathExists(configPath)).toBe(true);
      
      const content = await fs.readFile(configPath, 'utf8');
      expect(content).toContain('user_name');
    });
  });
  
  describe('troubleshoot (integration)', () => {
    test('returns success when no issues found', async () => {
      // Create valid structure
      await fs.ensureDir(path.join(tempDir, '_bmad/_config'));
      await fs.ensureDir(path.join(tempDir, '_bmad/bmb'));
      await fs.writeFile(
        path.join(tempDir, '_bmad/bmb/config.yaml'),
        'user_name: Test\ncommunication_language: English'
      );
      
      const config = {
        projectRoot: tempDir,
        agents: [],
        targetPlatforms: []
      };
      
      const result = await troubleshooter.troubleshoot(config);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('diagnostics');
      expect(result).toHaveProperty('fixed');
      expect(result).toHaveProperty('pending');
    });
    
    test('attempts to fix detected issues', async () => {
      // Create incomplete structure (missing directories)
      await fs.ensureDir(path.join(tempDir, '_bmad'));
      
      const config = {
        projectRoot: tempDir,
        agents: [],
        targetPlatforms: []
      };
      
      const result = await troubleshooter.troubleshoot(config);
      
      // Should detect issues
      expect(result.diagnostics.length).toBeGreaterThan(0);
      
      // May have fixed some issues
      expect(Array.isArray(result.fixed)).toBe(true);
      expect(Array.isArray(result.pending)).toBe(true);
    });
  });
});
