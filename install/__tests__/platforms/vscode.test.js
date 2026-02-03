/**
 * VSCode Platform Tests
 * 
 * Tests for install/lib/platforms/vscode.js
 */

const vscode = require('../../lib/platforms/vscode');
const copilotCli = require('../../lib/platforms/copilot-cli');

// Mock copilot-cli module
jest.mock('../../lib/platforms/copilot-cli');

describe('VSCode Platform', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('detect()', () => {
    it('should call copilot-cli.detect() and return its result', async () => {
      // Mock copilot-cli.detect to return true
      copilotCli.detect.mockResolvedValue(true);

      const result = await vscode.detect();

      expect(result).toBe(true);
      expect(copilotCli.detect).toHaveBeenCalledTimes(1);
    });

    it('should return false when copilot-cli.detect returns false', async () => {
      copilotCli.detect.mockResolvedValue(false);

      const result = await vscode.detect();

      expect(result).toBe(false);
      expect(copilotCli.detect).toHaveBeenCalledTimes(1);
    });
  });

  describe('install()', () => {
    it('should call copilot-cli.install with same arguments', async () => {
      const mockResult = { success: true, installed: 5 };
      copilotCli.install.mockResolvedValue(mockResult);

      const result = await vscode.install('/project', ['agent1', 'agent2'], {});

      expect(result).toEqual(mockResult);
      expect(copilotCli.install).toHaveBeenCalledWith('/project', ['agent1', 'agent2'], {});
    });
  });

  describe('getPath()', () => {
    it('should call copilot-cli.getPath and return its result', () => {
      copilotCli.getPath.mockReturnValue('.github/agents');

      const result = vscode.getPath();

      expect(result).toBe('.github/agents');
      expect(copilotCli.getPath).toHaveBeenCalledTimes(1);
    });
  });

  describe('name property', () => {
    it('should have correct platform name', () => {
      expect(vscode.name).toBe('VSCode Copilot Extension');
    });
  });
});
