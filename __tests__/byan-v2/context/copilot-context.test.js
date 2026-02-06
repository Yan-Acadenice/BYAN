const getCopilotContext = require('../../../src/byan-v2/context/copilot-context');
const SessionState = require('../../../src/byan-v2/context/session-state');
const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('fs');
jest.mock('os');

describe('Copilot Context Integration', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('AC1: getCopilotContext() function', () => {
    test('should exist and be callable', () => {
      expect(typeof getCopilotContext).toBe('function');
    });

    test('should return object with required properties', () => {
      process.env.PWD = '/home/test/project';
      process.env.USER = 'testuser';
      process.env.GIT_BRANCH = 'main';
      
      const context = getCopilotContext();
      
      expect(context).toHaveProperty('projectRoot');
      expect(context).toHaveProperty('userName');
      expect(context).toHaveProperty('workingDir');
      expect(context).toHaveProperty('gitBranch');
    });

    test('should return object type', () => {
      const context = getCopilotContext();
      expect(typeof context).toBe('object');
      expect(context).not.toBeNull();
    });
  });

  describe('AC2: Access project-root variable', () => {
    test('should read projectRoot from PWD environment variable', () => {
      process.env.PWD = '/home/yan/conception';
      
      const context = getCopilotContext();
      
      expect(context.projectRoot).toBe('/home/yan/conception');
    });

    test('should return absolute path', () => {
      process.env.PWD = '/absolute/path/to/project';
      
      const context = getCopilotContext();
      
      expect(context.projectRoot).toMatch(/^\//);
    });

    test('should fallback to process.cwd() if PWD not set', () => {
      delete process.env.PWD;
      const expectedCwd = process.cwd();
      
      const context = getCopilotContext();
      
      expect(context.projectRoot).toBe(expectedCwd);
    });

    test('should handle GITHUB_WORKSPACE if available', () => {
      process.env.GITHUB_WORKSPACE = '/github/workspace/repo';
      
      const context = getCopilotContext();
      
      expect(context.projectRoot).toBe('/github/workspace/repo');
    });

    test('should prioritize GITHUB_WORKSPACE over PWD', () => {
      process.env.PWD = '/home/user/project';
      process.env.GITHUB_WORKSPACE = '/github/workspace/repo';
      
      const context = getCopilotContext();
      
      expect(context.projectRoot).toBe('/github/workspace/repo');
    });
  });

  describe('AC3: Access user_name from config', () => {
    test('should read userName from USER environment variable', () => {
      process.env.USER = 'yan';
      
      const context = getCopilotContext();
      
      expect(context.userName).toBe('yan');
    });

    test('should read from COPILOT_USER_NAME if available', () => {
      process.env.COPILOT_USER_NAME = 'copilot-user';
      
      const context = getCopilotContext();
      
      expect(context.userName).toBe('copilot-user');
    });

    test('should prioritize COPILOT_USER_NAME over USER', () => {
      process.env.USER = 'systemuser';
      process.env.COPILOT_USER_NAME = 'copilot-user';
      
      const context = getCopilotContext();
      
      expect(context.userName).toBe('copilot-user');
    });

    test('should fallback to os.userInfo().username if no env vars', () => {
      delete process.env.USER;
      delete process.env.COPILOT_USER_NAME;
      os.userInfo.mockReturnValue({ username: 'os-username' });
      
      const context = getCopilotContext();
      
      expect(context.userName).toBe('os-username');
    });

    test('should read from .github/copilot/config.yaml if exists', () => {
      process.env.PWD = '/home/yan/conception';
      const configPath = '/home/yan/conception/.github/copilot/config.yaml';
      const yamlContent = 'user_name: yan-from-config\nproject_name: test';
      
      fs.existsSync.mockImplementation((p) => p === configPath);
      fs.readFileSync.mockReturnValue(yamlContent);
      
      const context = getCopilotContext();
      
      expect(context.userName).toBe('yan-from-config');
    });

    test('should handle missing config.yaml gracefully', () => {
      process.env.PWD = '/home/yan/conception';
      process.env.USER = 'fallback-user';
      fs.existsSync.mockReturnValue(false);
      
      const context = getCopilotContext();
      
      expect(context.userName).toBe('fallback-user');
    });
  });

  describe('AC4: Merge with SessionState', () => {
    test('SessionState should have mergeContext method', () => {
      const sessionState = new SessionState();
      expect(typeof sessionState.mergeContext).toBe('function');
    });

    test('mergeContext should store context in sessionState.context', () => {
      const sessionState = new SessionState();
      const copilotContext = {
        projectRoot: '/home/test',
        userName: 'testuser',
        workingDir: '/home/test',
        gitBranch: 'main'
      };
      
      sessionState.mergeContext(copilotContext);
      
      expect(sessionState.context).toEqual(copilotContext);
    });

    test('should preserve existing SessionState data when merging', () => {
      const sessionState = new SessionState();
      sessionState.addQuestion('Test question');
      sessionState.addResponse('q1', 'Test response');
      
      const copilotContext = {
        projectRoot: '/home/test',
        userName: 'testuser',
        workingDir: '/home/test',
        gitBranch: 'main'
      };
      
      sessionState.mergeContext(copilotContext);
      
      expect(sessionState.questionHistory).toHaveLength(1);
      expect(sessionState.userResponses).toHaveLength(1);
      expect(sessionState.context).toEqual(copilotContext);
    });

    test('should allow context to be updated multiple times', () => {
      const sessionState = new SessionState();
      
      sessionState.mergeContext({ projectRoot: '/old/path' });
      expect(sessionState.context.projectRoot).toBe('/old/path');
      
      sessionState.mergeContext({ projectRoot: '/new/path' });
      expect(sessionState.context.projectRoot).toBe('/new/path');
    });
  });

  describe('AC5: Additional context properties', () => {
    test('should read workingDir from PWD', () => {
      process.env.PWD = '/home/user/current/dir';
      
      const context = getCopilotContext();
      
      expect(context.workingDir).toBe('/home/user/current/dir');
    });

    test('should read gitBranch from GIT_BRANCH env', () => {
      process.env.GIT_BRANCH = 'feature/test-branch';
      
      const context = getCopilotContext();
      
      expect(context.gitBranch).toBe('feature/test-branch');
    });

    test('should read gitBranch from GITHUB_REF_NAME', () => {
      process.env.GITHUB_REF_NAME = 'main';
      
      const context = getCopilotContext();
      
      expect(context.gitBranch).toBe('main');
    });

    test('should prioritize GITHUB_REF_NAME over GIT_BRANCH', () => {
      process.env.GIT_BRANCH = 'local-branch';
      process.env.GITHUB_REF_NAME = 'github-branch';
      
      const context = getCopilotContext();
      
      expect(context.gitBranch).toBe('github-branch');
    });

    test('should fallback to empty string if no git branch found', () => {
      delete process.env.GIT_BRANCH;
      delete process.env.GITHUB_REF_NAME;
      
      const context = getCopilotContext();
      
      expect(context.gitBranch).toBe('');
    });
  });

  describe('AC6: Integration tests', () => {
    test('should work end-to-end with SessionState', () => {
      process.env.PWD = '/home/yan/conception';
      process.env.USER = 'yan';
      process.env.GIT_BRANCH = 'feature/byan-v2';
      
      const context = getCopilotContext();
      const sessionState = new SessionState();
      sessionState.mergeContext(context);
      
      expect(sessionState.context.projectRoot).toBe('/home/yan/conception');
      expect(sessionState.context.userName).toBe('yan');
      expect(sessionState.context.gitBranch).toBe('feature/byan-v2');
    });

    test('should serialize context in toJSON()', () => {
      const sessionState = new SessionState();
      const context = {
        projectRoot: '/test',
        userName: 'test',
        workingDir: '/test',
        gitBranch: 'main'
      };
      
      sessionState.mergeContext(context);
      const json = sessionState.toJSON();
      
      expect(json.context).toEqual(context);
    });

    test('should restore context from fromJSON()', () => {
      const sessionState = new SessionState();
      sessionState.mergeContext({
        projectRoot: '/test',
        userName: 'test',
        workingDir: '/test',
        gitBranch: 'main'
      });
      
      const json = sessionState.toJSON();
      const restored = SessionState.fromJSON(json);
      
      expect(restored.context).toEqual(sessionState.context);
    });
  });

  describe('Edge Cases', () => {
    test('should handle undefined environment variables', () => {
      delete process.env.PWD;
      delete process.env.USER;
      delete process.env.GIT_BRANCH;
      os.userInfo.mockReturnValue({ username: 'default' });
      
      const context = getCopilotContext();
      
      expect(context.projectRoot).toBeDefined();
      expect(context.userName).toBe('default');
      expect(context.gitBranch).toBe('');
    });

    test('should handle empty string environment variables', () => {
      process.env.PWD = '';
      process.env.USER = '';
      
      const context = getCopilotContext();
      
      expect(context.projectRoot).toBeTruthy();
      expect(context.userName).toBeTruthy();
    });

    test('should not crash if os.userInfo() throws', () => {
      delete process.env.USER;
      delete process.env.COPILOT_USER_NAME;
      os.userInfo.mockImplementation(() => {
        throw new Error('Unable to get user info');
      });
      
      const context = getCopilotContext();
      
      expect(context.userName).toBe('unknown');
    });
  });
});
