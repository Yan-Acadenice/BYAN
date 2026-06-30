const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const {
  ensureMcpConfig,
  readMcpConfig,
  mergeByanEntry,
  addMcpEntry,
  removeMcpEntry,
  looksLikeSecret,
  TOKEN_PLACEHOLDER,
} = require('../lib/mcp-config');

describe('mcp-config', () => {
  let tmpRoot;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-platform-mcp-'));
  });

  afterEach(async () => {
    await fs.remove(tmpRoot);
  });

  describe('ensureMcpConfig', () => {
    test('creates .mcp.json with the byan server (command/args, NO config env)', async () => {
      const { path: filePath } = await ensureMcpConfig(tmpRoot, {
        apiUrl: 'http://host.example.com',
      });
      const content = await fs.readJson(filePath);
      expect(content.mcpServers.byan.command).toBe('node');
      expect(content.mcpServers.byan.args[0]).toBe('_byan/mcp/byan-mcp-server/server.js');
      // The MCP server resolves its own config (env -> ~/.byan/credentials.json
      // -> localhost), so .mcp.json carries no byan config env.
      expect(content.mcpServers.byan.env).toBeUndefined();
    });

    test('preserves other MCP servers in existing config', async () => {
      const filePath = path.join(tmpRoot, '.mcp.json');
      await fs.writeJson(filePath, {
        mcpServers: { other: { command: 'python', args: ['other.py'] } },
      });

      await ensureMcpConfig(tmpRoot, { apiUrl: 'http://localhost:3737' });

      const content = await fs.readJson(filePath);
      expect(content.mcpServers.other.command).toBe('python');
      expect(content.mcpServers.byan).toBeDefined();
    });

    test('idempotent: re-running leaves the byan entry env-free', async () => {
      await ensureMcpConfig(tmpRoot, { apiUrl: 'http://old:3000' });
      await ensureMcpConfig(tmpRoot, { apiUrl: 'http://new:3737' });

      const content = await fs.readJson(path.join(tmpRoot, '.mcp.json'));
      expect(content.mcpServers.byan.env).toBeUndefined();
    });

    test('NEVER writes BYAN_API_TOKEN into .mcp.json even if a token is supplied', async () => {
      const { path: filePath } = await ensureMcpConfig(tmpRoot, {
        apiUrl: 'http://localhost:3737',
        token: 'my-secret-token',
      });
      const raw = await fs.readFile(filePath, 'utf8');
      expect(raw).not.toContain('my-secret-token');
      expect(raw).not.toContain(TOKEN_PLACEHOLDER);
    });

    test('writes no BYAN_API_URL into .mcp.json even when apiUrl carries a /api suffix', async () => {
      const { path: filePath } = await ensureMcpConfig(tmpRoot, {
        apiUrl: 'http://localhost:3737/api',
      });
      const raw = await fs.readFile(filePath, 'utf8');
      expect(raw).not.toContain('BYAN_API_URL');
    });

    test('preserves other mcpServers entries on merge', async () => {
      const filePath = path.join(tmpRoot, '.mcp.json');
      await fs.writeJson(filePath, {
        mcpServers: { foo: { command: 'foo-cmd', args: ['foo.js'] } },
      });
      await ensureMcpConfig(tmpRoot, { apiUrl: 'http://localhost:3737', token: 'tok' });
      const content = await fs.readJson(filePath);
      expect(content.mcpServers.foo.command).toBe('foo-cmd');
      expect(content.mcpServers.byan).toBeDefined();
    });

    test('preserves byan command, NORMALIZES a stale absolute path to canonical relative, strips BYAN_API_URL/TOKEN', async () => {
      const filePath = path.join(tmpRoot, '.mcp.json');
      await fs.writeJson(filePath, {
        mcpServers: {
          byan: {
            command: 'custom-node',
            args: ['/absolute/path/server.js'],
            env: { BYAN_API_URL: 'http://old:3737', BYAN_API_TOKEN: 'leaked_in_clear' },
          },
        },
      });
      await ensureMcpConfig(tmpRoot, { apiUrl: 'http://new:3737', token: 'tok' });
      const content = await fs.readJson(filePath);
      // command is F1-orthogonal (interpreter, not a path) -> a user choice survives.
      expect(content.mcpServers.byan.command).toBe('custom-node');
      // F1: a stale absolute path is normalized to the canonical relative one,
      // portable across a moved / npm-shipped repo.
      expect(content.mcpServers.byan.args[0]).toBe('_byan/mcp/byan-mcp-server/server.js');
      expect(path.isAbsolute(content.mcpServers.byan.args[0])).toBe(false);
      // Both stale byan keys stripped -> env empty -> omitted entirely.
      expect(content.mcpServers.byan.env).toBeUndefined();
      const raw = await fs.readFile(filePath, 'utf8');
      expect(raw).not.toContain('leaked_in_clear');
      expect(raw).not.toContain('http://old:3737');
      expect(raw).not.toContain('/absolute/path');
    });

    test('returns an object with path property', async () => {
      const result = await ensureMcpConfig(tmpRoot, { apiUrl: 'http://x:1' });
      expect(typeof result).toBe('object');
      expect(result.path).toBe(path.join(tmpRoot, '.mcp.json'));
    });
  });

  describe('readMcpConfig', () => {
    test('returns null when .mcp.json is missing', async () => {
      expect(await readMcpConfig(tmpRoot)).toBeNull();
    });

    test('returns parsed config when .mcp.json exists', async () => {
      await fs.writeJson(path.join(tmpRoot, '.mcp.json'), {
        mcpServers: { byan: { command: 'node' } },
      });
      const cfg = await readMcpConfig(tmpRoot);
      expect(cfg.mcpServers.byan.command).toBe('node');
    });

    test('returns null when .mcp.json is malformed', async () => {
      await fs.writeFile(path.join(tmpRoot, '.mcp.json'), '{not json', 'utf8');
      expect(await readMcpConfig(tmpRoot)).toBeNull();
    });
  });

  describe('mergeByanEntry (pure)', () => {
    test('returns a new object, does not mutate input', () => {
      const input = { mcpServers: { other: { command: 'x' } } };
      const frozen = JSON.parse(JSON.stringify(input));
      const result = mergeByanEntry(input, { apiUrl: 'http://x:1' });
      expect(result).not.toBe(input);
      expect(input).toEqual(frozen);
      expect(result.mcpServers.other.command).toBe('x');
      expect(result.mcpServers.byan).toBeDefined();
    });

    test('writes NO config env into the byan entry (server resolves its own config), even with /api + token', () => {
      const result = mergeByanEntry({}, { apiUrl: 'http://localhost:3737/api', token: 'byan_abc' });
      expect(result.mcpServers.byan.env).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain('byan_abc');
      expect(JSON.stringify(result)).not.toContain('BYAN_API_URL');
      expect(JSON.stringify(result)).not.toContain(TOKEN_PLACEHOLDER);
    });

    test('preserves a non-byan env key (e.g. a Leantime ref) while stripping byan keys', () => {
      const input = {
        mcpServers: {
          byan: {
            command: 'node',
            args: ['s.js'],
            env: { LEANTIME_API_URL: '${LEANTIME_API_URL}', BYAN_API_URL: 'http://old' },
          },
        },
      };
      const result = mergeByanEntry(input, { apiUrl: 'http://x:1' });
      expect(result.mcpServers.byan.env.LEANTIME_API_URL).toBe('${LEANTIME_API_URL}');
      expect(result.mcpServers.byan.env.BYAN_API_URL).toBeUndefined();
    });

    test('handles empty input config', () => {
      const result = mergeByanEntry({}, { apiUrl: 'http://x:1' });
      expect(result.mcpServers.byan.command).toBe('node');
      expect(result.mcpServers.byan.args).toEqual(['_byan/mcp/byan-mcp-server/server.js']);
    });

    test('handles null/undefined input config gracefully', () => {
      const r1 = mergeByanEntry(null, { apiUrl: 'http://x:1' });
      const r2 = mergeByanEntry(undefined, { apiUrl: 'http://x:1' });
      expect(r1.mcpServers.byan).toBeDefined();
      expect(r2.mcpServers.byan).toBeDefined();
    });

    test('preserves an existing command but normalizes args to the canonical relative path', () => {
      const input = {
        mcpServers: {
          byan: { command: 'custom', args: ['/abs/server.js'], env: {} },
        },
      };
      const result = mergeByanEntry(input, { apiUrl: 'http://x:1', token: 't' });
      expect(result.mcpServers.byan.command).toBe('custom');
      expect(result.mcpServers.byan.args).toEqual(['_byan/mcp/byan-mcp-server/server.js']);
      expect(path.isAbsolute(result.mcpServers.byan.args[0])).toBe(false);
    });

    test('writes an INERT byan-channel entry: relative path, empty env, no secret', () => {
      const result = mergeByanEntry(
        { mcpServers: { autre: { command: 'python', args: ['a.py'] } } },
        { apiUrl: 'http://localhost:3737', token: 'byan_' + '0'.repeat(64) }
      );
      const chan = result.mcpServers['byan-channel'];
      expect(chan.command).toBe('node');
      expect(chan.args).toEqual(['_byan/mcp/byan-mcp-server/channel-entry.js']);
      expect(path.isAbsolute(chan.args[0])).toBe(false);
      expect(chan.env).toEqual({});
      // Sibling preserved (non-destructive merge).
      expect(result.mcpServers.autre.command).toBe('python');
      // No secret, no auto-activation flags, no absolute /home/ leak.
      const raw = JSON.stringify(result);
      expect(raw).not.toMatch(/byan_0{20,}/);
      expect(raw).not.toContain('channelsEnabled');
      expect(raw).not.toContain('allowedChannelPlugins');
      expect(raw).not.toContain('dangerously-load');
      expect(raw).not.toMatch(/\/home\//);
    });

    test('normalizes an existing byan-channel entry to the canonical relative path + empty env (idempotent)', () => {
      const input = {
        mcpServers: {
          'byan-channel': { command: 'node', args: ['custom/channel.js'], env: { X: '1' } },
        },
      };
      const result = mergeByanEntry(input, { apiUrl: 'http://x:1' });
      // The channel entry is BYAN-owned: args forced to canonical relative, env
      // forced empty (config comes from resolve-config.js, never tracked env).
      expect(result.mcpServers['byan-channel'].args).toEqual(['_byan/mcp/byan-mcp-server/channel-entry.js']);
      expect(result.mcpServers['byan-channel'].env).toEqual({});
      // Idempotent: a second merge yields the exact same entry.
      const again = mergeByanEntry(result, { apiUrl: 'http://x:1' });
      expect(again.mcpServers['byan-channel']).toEqual(result.mcpServers['byan-channel']);
    });
  });

  describe('mergeChannelEntry (pure)', () => {
    test('adds an inert byan-channel without touching byan or siblings', () => {
      const { mergeChannelEntry } = require('../lib/mcp-config');
      const input = { mcpServers: { byan: { command: 'node', args: ['s.js'] }, foo: { command: 'x' } } };
      const result = mergeChannelEntry(input);
      expect(result.mcpServers['byan-channel'].args).toEqual(['_byan/mcp/byan-mcp-server/channel-entry.js']);
      expect(result.mcpServers['byan-channel'].env).toEqual({});
      expect(result.mcpServers.byan.args).toEqual(['s.js']);
      expect(result.mcpServers.foo.command).toBe('x');
    });

    test('handles null/empty input gracefully', () => {
      const { mergeChannelEntry } = require('../lib/mcp-config');
      expect(mergeChannelEntry(null).mcpServers['byan-channel']).toBeDefined();
      expect(mergeChannelEntry({}).mcpServers['byan-channel'].command).toBe('node');
    });
  });

  describe('addMcpEntry / removeMcpEntry', () => {
    test('addMcpEntry creates .mcp.json with the new server entry', async () => {
      const { path: filePath } = await addMcpEntry(tmpRoot, 'gdrive', {
        command: 'npx',
        args: ['-y', 'google-workspace-mcp', 'serve'],
      });
      const cfg = await fs.readJson(filePath);
      expect(cfg.mcpServers.gdrive.command).toBe('npx');
      expect(cfg.mcpServers.gdrive.args).toEqual(['-y', 'google-workspace-mcp', 'serve']);
    });

    test('addMcpEntry preserves existing byan entry', async () => {
      await ensureMcpConfig(tmpRoot, { apiUrl: 'http://localhost:3737' });
      await addMcpEntry(tmpRoot, 'gdrive', {
        command: 'npx',
        args: ['-y', 'google-workspace-mcp', 'serve'],
      });
      const cfg = await fs.readJson(path.join(tmpRoot, '.mcp.json'));
      expect(cfg.mcpServers.byan).toBeDefined();
      expect(cfg.mcpServers.gdrive).toBeDefined();
    });

    test('addMcpEntry replaces an existing entry of the same name', async () => {
      await addMcpEntry(tmpRoot, 'gdrive', { command: 'old' });
      await addMcpEntry(tmpRoot, 'gdrive', { command: 'new' });
      const cfg = await fs.readJson(path.join(tmpRoot, '.mcp.json'));
      expect(cfg.mcpServers.gdrive.command).toBe('new');
    });

    // Test fixtures below match the regex shapes from mcp-config.js but are
    // composed entirely of repeated chars so they match no real token. Do not
    // replace with real-looking tokens — GitHub Push Protection will block.
    test('addMcpEntry refuses to write a value that looks like a byan token', async () => {
      const fakeByan = 'byan_' + '0'.repeat(64);
      await expect(
        addMcpEntry(tmpRoot, 'evil', {
          command: 'node',
          env: { LEAK: fakeByan },
        })
      ).rejects.toThrow(/looks like a secret/i);
    });

    test('addMcpEntry refuses to write a value that looks like a GitHub PAT', async () => {
      const fakeGhp = 'ghp_' + 'A'.repeat(36);
      await expect(
        addMcpEntry(tmpRoot, 'evil', {
          command: 'node',
          env: { GITHUB_TOKEN: fakeGhp },
        })
      ).rejects.toThrow(/looks like a secret/i);
    });

    test('addMcpEntry refuses to write a value that looks like a Google API key', async () => {
      const fakeGoogle = 'AIza' + 'A'.repeat(35);
      await expect(
        addMcpEntry(tmpRoot, 'evil', {
          command: 'node',
          env: { GOOGLE_KEY: fakeGoogle },
        })
      ).rejects.toThrow(/looks like a secret/i);
    });

    test('addMcpEntry accepts ${VAR} placeholders without error', async () => {
      await addMcpEntry(tmpRoot, 'gdrive', {
        command: 'npx',
        args: ['-y', 'google-workspace-mcp', 'serve'],
        env: { GOOGLE_MCP_READ_ONLY: 'true', SOME_REF: '${MY_VAR}' },
      });
      const cfg = await fs.readJson(path.join(tmpRoot, '.mcp.json'));
      expect(cfg.mcpServers.gdrive.env.SOME_REF).toBe('${MY_VAR}');
    });

    test('addMcpEntry rejects empty/invalid name', async () => {
      await expect(addMcpEntry(tmpRoot, '', { command: 'x' })).rejects.toThrow(/name/i);
      await expect(addMcpEntry(tmpRoot, 'x', null)).rejects.toThrow(/entry/i);
    });

    test('removeMcpEntry strips the entry and reports removal', async () => {
      await addMcpEntry(tmpRoot, 'gdrive', { command: 'x' });
      const r1 = await removeMcpEntry(tmpRoot, 'gdrive');
      expect(r1.removed).toBe(true);
      const cfg = await fs.readJson(path.join(tmpRoot, '.mcp.json'));
      expect(cfg.mcpServers.gdrive).toBeUndefined();
    });

    test('removeMcpEntry is a no-op when the entry does not exist', async () => {
      await ensureMcpConfig(tmpRoot, { apiUrl: 'http://x:1' });
      const r = await removeMcpEntry(tmpRoot, 'never-was-there');
      expect(r.removed).toBe(false);
    });
  });

  describe('looksLikeSecret', () => {
    // All fixtures here match shape only; chars are repeated so no real token
    // ships in tests / git history.
    test('detects byan tokens', () => {
      expect(looksLikeSecret('byan_' + '0'.repeat(64))).toBe(true);
    });
    test('detects GitHub tokens', () => {
      expect(looksLikeSecret('ghp_' + 'A'.repeat(36))).toBe(true);
      expect(looksLikeSecret('gho_' + 'B'.repeat(36))).toBe(true);
    });
    test('detects Google API keys', () => {
      expect(looksLikeSecret('AIza' + 'C'.repeat(35))).toBe(true);
    });
    test('does NOT flag env-var placeholders', () => {
      expect(looksLikeSecret('${MY_VAR}')).toBe(false);
      expect(looksLikeSecret('${BYAN_API_TOKEN}')).toBe(false);
    });
    test('does NOT flag ordinary config strings', () => {
      expect(looksLikeSecret('http://localhost:3737')).toBe(false);
      expect(looksLikeSecret('npx')).toBe(false);
      expect(looksLikeSecret('')).toBe(false);
      expect(looksLikeSecret(undefined)).toBe(false);
      expect(looksLikeSecret(null)).toBe(false);
    });
  });
});
