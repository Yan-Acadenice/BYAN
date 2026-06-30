/**
 * Claude Code Platform Tests
 * 
 * Tests for install/lib/platforms/claude-code.js
 */

const claudeCode = require('../../lib/platforms/claude-code');
const fileUtils = require('../../lib/utils/file-utils');
const os = require('os');
const path = require('path');

// Mock dependencies
jest.mock('../../lib/utils/file-utils');
jest.mock('os');

describe('Claude Code Platform', () => {
  const mockHomedir = '/home/testuser';

  // Helper to mock platform
  function mockPlatform(platformName) {
    os.platform.mockReturnValue(platformName);
  }

  beforeEach(() => {
    os.homedir.mockReturnValue(mockHomedir);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('detect() - macOS', () => {
    it('should check correct path on macOS and return true if exists', async () => {
      os.platform.mockReturnValue('darwin');
      fileUtils.exists.mockResolvedValue(true);

      const result = await claudeCode.detect();

      expect(result).toBe(true);
      expect(fileUtils.exists).toHaveBeenCalledWith(
        path.join(mockHomedir, 'Library/Application Support/Claude/claude_desktop_config.json')
      );
    });

    it('should return false if config does not exist on macOS', async () => {
      os.platform.mockReturnValue('darwin');
      fileUtils.exists.mockResolvedValue(false);

      const result = await claudeCode.detect();

      expect(result).toBe(false);
    });
  });

  describe('detect() - Windows', () => {
    it('should check correct path on Windows and return true if exists', async () => {
      os.platform.mockReturnValue('win32');
      fileUtils.exists.mockResolvedValue(true);

      const result = await claudeCode.detect();

      expect(result).toBe(true);
      expect(fileUtils.exists).toHaveBeenCalledWith(
        path.join(mockHomedir, 'AppData/Roaming/Claude/claude_desktop_config.json')
      );
    });

    it('should return false if config does not exist on Windows', async () => {
      os.platform.mockReturnValue('win32');
      fileUtils.exists.mockResolvedValue(false);

      const result = await claudeCode.detect();

      expect(result).toBe(false);
    });
  });

  describe('detect() - Linux', () => {
    it('should check correct path on Linux and return true if exists', async () => {
      os.platform.mockReturnValue('linux');
      fileUtils.exists.mockResolvedValue(true);

      const result = await claudeCode.detect();

      expect(result).toBe(true);
      expect(fileUtils.exists).toHaveBeenCalledWith(
        path.join(mockHomedir, '.config/Claude/claude_desktop_config.json')
      );
    });

    it('should return false if config does not exist on Linux', async () => {
      os.platform.mockReturnValue('linux');
      fileUtils.exists.mockResolvedValue(false);

      const result = await claudeCode.detect();

      expect(result).toBe(false);
    });
  });

  describe('detect() - Unknown OS', () => {
    it('should return false for unsupported platform', async () => {
      os.platform.mockReturnValue('freebsd');

      const result = await claudeCode.detect();

      expect(result).toBe(false);
      expect(fileUtils.exists).not.toHaveBeenCalled();
    });
  });

  describe('getPath()', () => {
    it('should return correct path for macOS', () => {
      os.platform.mockReturnValue('darwin');

      const result = claudeCode.getPath();

      expect(result).toBe(
        path.join(mockHomedir, 'Library/Application Support/Claude/claude_desktop_config.json')
      );
    });

    it('should return correct path for Windows', () => {
      os.platform.mockReturnValue('win32');

      const result = claudeCode.getPath();

      expect(result).toBe(
        path.join(mockHomedir, 'AppData/Roaming/Claude/claude_desktop_config.json')
      );
    });

    it('should return correct path for Linux', () => {
      os.platform.mockReturnValue('linux');

      const result = claudeCode.getPath();

      expect(result).toBe(
        path.join(mockHomedir, '.config/Claude/claude_desktop_config.json')
      );
    });

    it('should return "unknown" for unsupported platform', () => {
      os.platform.mockReturnValue('freebsd');

      const result = claudeCode.getPath();

      expect(result).toBe('unknown');
    });
  });

  describe('name property', () => {
    it('should have correct platform name', () => {
      expect(claudeCode.name).toBe('Claude Code');
    });
  });

  describe('install()', () => {
    it('should return success for supported platforms', async () => {
      mockPlatform('darwin');

      // Mock file operations for direct MCP install. The probe now targets the
      // REAL server at its repo-relative path (_byan/mcp/byan-mcp-server/server.js),
      // not the old fictional 'byan-mcp-server.js' filename.
      fileUtils.exists = jest.fn()
        .mockImplementation((p) => {
          if (p.includes('claude_desktop_config.json')) return Promise.resolve(true);
          if (p.includes(path.join('_byan', 'mcp', 'byan-mcp-server', 'server.js'))) return Promise.resolve(true);
          return Promise.resolve(false);
        });
      fileUtils.copy = jest.fn().mockResolvedValue(undefined);
      fileUtils.readJson = jest.fn().mockResolvedValue({ mcpServers: {} });
      fileUtils.writeJson = jest.fn().mockResolvedValue(undefined);

      const result = await claudeCode.install('/project', ['agent1', 'agent2'], {}, { useAgent: false });

      expect(result).toEqual({
        success: true,
        installed: 2,
        method: 'direct-mcp'
      });
    });

    it('installDirectMCP merges byan + inert byan-channel with RELATIVE paths and PRESERVES siblings', async () => {
      mockPlatform('linux');

      fileUtils.exists = jest.fn().mockImplementation((p) => {
        if (p.includes('claude_desktop_config.json')) return Promise.resolve(true);
        if (p.includes(path.join('_byan', 'mcp', 'byan-mcp-server', 'server.js'))) return Promise.resolve(true);
        return Promise.resolve(false);
      });
      fileUtils.copy = jest.fn().mockResolvedValue(undefined);
      // A PRE-EXISTING unrelated MCP server must survive the merge (non-destructive).
      fileUtils.readJson = jest.fn().mockResolvedValue({
        mcpServers: { autre: { command: 'python', args: ['autre.py'] } },
      });
      let written;
      fileUtils.writeJson = jest.fn().mockImplementation((_p, data) => {
        written = data;
        return Promise.resolve(undefined);
      });

      await claudeCode.install('/project', ['agent1'], {}, { useAgent: false });

      // Both byan entries present.
      expect(written.mcpServers.byan).toBeDefined();
      expect(written.mcpServers['byan-channel']).toBeDefined();
      // Pre-existing sibling preserved (merge, not overwrite).
      expect(written.mcpServers.autre.command).toBe('python');

      // Relative paths — never absolute, never a /home/ leak.
      const byanArg = written.mcpServers.byan.args[0];
      const chanArg = written.mcpServers['byan-channel'].args[0];
      expect(byanArg).toBe('_byan/mcp/byan-mcp-server/server.js');
      expect(chanArg).toBe('_byan/mcp/byan-mcp-server/channel-entry.js');
      expect(path.isAbsolute(byanArg)).toBe(false);
      expect(path.isAbsolute(chanArg)).toBe(false);

      // No secret, no absolute path anywhere in the serialized config.
      const raw = JSON.stringify(written);
      expect(raw).not.toMatch(/\/home\//);
      expect(raw).not.toMatch(/byan_[a-f0-9]{20,}/i);
      // Channel is INERT: no auto-activation flags written.
      expect(raw).not.toContain('channelsEnabled');
      expect(raw).not.toContain('allowedChannelPlugins');
      expect(raw).not.toContain('dangerously-load');
      // Channel env stays empty (server resolves its own config).
      expect(written.mcpServers['byan-channel'].env).toEqual({});
    });

    it('should throw error for unsupported platform', async () => {
      mockPlatform('freebsd');
      
      await expect(
        claudeCode.install('/project', ['agent1'], {})
      ).rejects.toThrow('Unsupported platform: freebsd');
    });
  });
});
