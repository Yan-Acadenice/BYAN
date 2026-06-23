/**
 * env-writer.js + mcp-renderer.js — wraps byan-platform-config.
 *
 * Covers C8 (per-OS idempotent env writes, distinct win/linux/mac backend)
 * and C9 (.mcp.json validate-or-die: never write a broken file).
 *
 * All writes target os.tmpdir() — the real repo is never touched.
 * The fake token is a SHAPE fixture, never a real secret (see MEMORY:
 * feedback_no_real_tokens_in_tests).
 */

const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const childProcess = require('child_process');

const {
  writeProjectEnv,
  writeSettingsLocalEnv,
  writeUserEnvVar,
  USER_ENV_MARKER,
} = require('../lib/env-writer');
const {
  renderMcp,
  previewMcp,
  validateApiUrl,
  McpUrlError,
} = require('../lib/mcp-renderer');
const { mcpConfig } = require('byan-platform-config');

// Shape-only fixture. NOT a real token: 'byan_' + 64 zeroes.
const FAKE_TOKEN = 'byan_' + '0'.repeat(64);

describe('env-writer + mcp-renderer (install-core)', () => {
  let tmpRoot;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-install-core-'));
  });

  afterEach(async () => {
    await fs.remove(tmpRoot);
    jest.restoreAllMocks();
  });

  describe('mcp-renderer — validate-or-die (C9)', () => {
    test('renderMcp validates the url but writes a portable byan entry (no config env, no token)', async () => {
      const { path: filePath } = await renderMcp(tmpRoot, {
        apiUrl: 'http://localhost:3737/api',
      });
      const written = await fs.readJson(filePath);
      // Portable config (commit 793badb): the server self-resolves, so .mcp.json
      // carries neither BYAN_API_URL nor a token.
      expect(written.mcpServers.byan).toBeDefined();
      expect(written.mcpServers.byan.env?.BYAN_API_URL).toBeUndefined();
      expect(written.mcpServers.byan.env?.BYAN_API_TOKEN).toBeUndefined();
    });

    test('written .mcp.json parses back to a valid object', async () => {
      const { path: filePath } = await renderMcp(tmpRoot, {
        apiUrl: 'https://byan-api.stark.a3n.fr',
      });
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      expect(parsed.mcpServers).toBeDefined();
      expect(parsed.mcpServers.byan).toBeDefined();
    });

    test('renderMcp throws McpUrlError on garbage url BEFORE any write', async () => {
      await expect(
        renderMcp(tmpRoot, { apiUrl: 'not a url' })
      ).rejects.toThrow(McpUrlError);
      // The validate-or-die guarantee: no broken file landed on disk.
      expect(await fs.pathExists(path.join(tmpRoot, '.mcp.json'))).toBe(false);
    });

    test('renderMcp throws McpUrlError on non-http(s) protocol (ftp)', async () => {
      await expect(
        renderMcp(tmpRoot, { apiUrl: 'ftp://example.com' })
      ).rejects.toThrow(McpUrlError);
      expect(await fs.pathExists(path.join(tmpRoot, '.mcp.json'))).toBe(false);
    });

    test('renderMcp throws McpUrlError on empty/undefined url', async () => {
      await expect(renderMcp(tmpRoot, { apiUrl: '' })).rejects.toThrow(McpUrlError);
      await expect(renderMcp(tmpRoot, {})).rejects.toThrow(McpUrlError);
      expect(await fs.pathExists(path.join(tmpRoot, '.mcp.json'))).toBe(false);
    });

    test('validateApiUrl returns the clean (suffix-stripped) url on valid input', () => {
      expect(validateApiUrl('http://localhost:3737/api/v1')).toBe('http://localhost:3737');
      expect(validateApiUrl('https://byan.example.com')).toBe('https://byan.example.com');
    });

    test('validateApiUrl throws McpUrlError on invalid input', () => {
      expect(() => validateApiUrl('::::')).toThrow(McpUrlError);
      expect(() => validateApiUrl(null)).toThrow(McpUrlError);
    });

    test('previewMcp returns merged object WITHOUT writing a file', () => {
      const preview = previewMcp(tmpRoot, { apiUrl: 'http://localhost:3737' });
      expect(preview.mcpServers.byan).toBeDefined();
      // Portable: no BYAN_API_URL persisted in the preview either.
      expect(preview.mcpServers.byan.env?.BYAN_API_URL).toBeUndefined();
      // No disk side-effect from a preview.
      expect(fs.existsSync(path.join(tmpRoot, '.mcp.json'))).toBe(false);
    });

    test('previewMcp also validates the url (throws on garbage)', () => {
      expect(() => previewMcp(tmpRoot, { apiUrl: 'nonsense' })).toThrow(McpUrlError);
    });

    test('the byan entry written equals mcpConfig.mergeByanEntry output (wrap not reimplement)', async () => {
      const { path: filePath } = await renderMcp(tmpRoot, {
        apiUrl: 'http://localhost:3737',
      });
      const written = await fs.readJson(filePath);
      const expected = mcpConfig.mergeByanEntry({}, { apiUrl: 'http://localhost:3737' });
      expect(written.mcpServers.byan).toEqual(expected.mcpServers.byan);
    });
  });

  describe('env-writer — project .env idempotency (C8)', () => {
    test('writeProjectEnv delegates to envConfig.updateDotenv (key present)', async () => {
      const { path: filePath } = await writeProjectEnv(tmpRoot, {
        BYAN_API_TOKEN: FAKE_TOKEN,
        BYAN_API_URL: 'http://localhost:3737',
      });
      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toMatch(/BYAN_API_TOKEN=byan_0{64}/);
      expect(content).toMatch(/BYAN_API_URL=http:\/\/localhost:3737/);
    });

    test('re-run with same vars does not duplicate the key (idempotent)', async () => {
      await writeProjectEnv(tmpRoot, { BYAN_API_TOKEN: FAKE_TOKEN });
      await writeProjectEnv(tmpRoot, { BYAN_API_TOKEN: FAKE_TOKEN });
      const content = await fs.readFile(path.join(tmpRoot, '.env'), 'utf8');
      expect(content.match(/BYAN_API_TOKEN=/g)).toHaveLength(1);
    });

    test('preserves a pre-existing comment line', async () => {
      await fs.writeFile(path.join(tmpRoot, '.env'), '# do not touch me\nFOO=bar\n', 'utf8');
      await writeProjectEnv(tmpRoot, { BYAN_API_TOKEN: FAKE_TOKEN });
      const content = await fs.readFile(path.join(tmpRoot, '.env'), 'utf8');
      expect(content).toMatch(/# do not touch me/);
      expect(content).toMatch(/FOO=bar/);
    });

    test('does not return or log the secret value', async () => {
      const result = await writeProjectEnv(tmpRoot, { BYAN_API_TOKEN: FAKE_TOKEN });
      expect(JSON.stringify(result)).not.toContain(FAKE_TOKEN);
    });
  });

  describe('env-writer — settings.local.json (C8)', () => {
    test('writeSettingsLocalEnv merges env, preserving unrelated permissions key', async () => {
      const settingsPath = path.join(tmpRoot, '.claude', 'settings.local.json');
      await fs.ensureDir(path.dirname(settingsPath));
      await fs.writeJson(settingsPath, { permissions: { allow: ['Read'] } });

      await writeSettingsLocalEnv(tmpRoot, {
        BYAN_API_TOKEN: FAKE_TOKEN,
        BYAN_API_URL: 'http://localhost:3737',
      });

      const content = await fs.readJson(settingsPath);
      expect(content.permissions.allow).toEqual(['Read']);
      expect(content.env.BYAN_API_TOKEN).toBe(FAKE_TOKEN);
      expect(content.env.BYAN_API_URL).toBe('http://localhost:3737');
    });

    test('does not return the secret value', async () => {
      const result = await writeSettingsLocalEnv(tmpRoot, { BYAN_API_TOKEN: FAKE_TOKEN });
      expect(JSON.stringify(result)).not.toContain(FAKE_TOKEN);
    });
  });

  describe('env-writer — writeUserEnvVar per-OS backend (C8)', () => {
    test('linux: appends an idempotent marker block to the target profile', async () => {
      const profile = path.join(tmpRoot, '.bashrc');
      await fs.writeFile(profile, '# my existing rc\nexport PATH=$PATH:/foo\n', 'utf8');

      const r1 = await writeUserEnvVar('BYAN_API_URL', 'http://localhost:3737', {
        platform: 'linux',
        profilePath: profile,
      });
      expect(r1.scope).toBe('user');
      expect(r1.backend).toBe('profile');

      const content = await fs.readFile(profile, 'utf8');
      expect(content).toMatch(/# my existing rc/);
      expect(content).toContain(USER_ENV_MARKER.begin);
      expect(content).toContain(USER_ENV_MARKER.end);
      expect(content).toMatch(/export BYAN_API_URL="http:\/\/localhost:3737"/);
    });

    test('linux: re-run produces exactly ONE marker block (idempotent), value updated', async () => {
      const profile = path.join(tmpRoot, '.bashrc');
      await writeUserEnvVar('BYAN_API_URL', 'http://old:1', { platform: 'linux', profilePath: profile });
      await writeUserEnvVar('BYAN_API_URL', 'http://new:2', { platform: 'linux', profilePath: profile });

      const content = await fs.readFile(profile, 'utf8');
      const begins = content.match(new RegExp(escapeRe(USER_ENV_MARKER.begin), 'g')) || [];
      expect(begins).toHaveLength(1);
      expect(content).toMatch(/export BYAN_API_URL="http:\/\/new:2"/);
      expect(content).not.toMatch(/http:\/\/old:1/);
    });

    test('mac (darwin): uses the profile backend, idempotent marker block', async () => {
      const profile = path.join(tmpRoot, '.zshrc');
      await writeUserEnvVar('BYAN_API_URL', 'http://localhost:3737', { platform: 'darwin', profilePath: profile });
      await writeUserEnvVar('BYAN_API_URL', 'http://localhost:3737', { platform: 'darwin', profilePath: profile });

      const content = await fs.readFile(profile, 'utf8');
      const begins = content.match(new RegExp(escapeRe(USER_ENV_MARKER.begin), 'g')) || [];
      expect(begins).toHaveLength(1);
    });

    test('windows (win32): calls execFileSync("setx", [key, val]) exactly once, no profile write', async () => {
      const spy = jest.spyOn(childProcess, 'execFileSync').mockImplementation(() => Buffer.from(''));
      const r = await writeUserEnvVar('BYAN_API_URL', 'http://localhost:3737', { platform: 'win32' });

      expect(r.scope).toBe('user');
      expect(r.backend).toBe('setx');
      expect(spy).toHaveBeenCalledTimes(1);
      const [bin, args] = spy.mock.calls[0];
      expect(bin).toBe('setx');
      expect(args).toEqual(['BYAN_API_URL', 'http://localhost:3737']);
    });

    test('windows: re-run still calls setx (setx is itself idempotent at the OS level)', async () => {
      const spy = jest.spyOn(childProcess, 'execFileSync').mockImplementation(() => Buffer.from(''));
      await writeUserEnvVar('BYAN_API_URL', 'a', { platform: 'win32' });
      await writeUserEnvVar('BYAN_API_URL', 'b', { platform: 'win32' });
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.calls[1][1]).toEqual(['BYAN_API_URL', 'b']);
    });

    test('writeUserEnvVar does not leak the secret value in its return object', async () => {
      jest.spyOn(childProcess, 'execFileSync').mockImplementation(() => Buffer.from(''));
      const r = await writeUserEnvVar('BYAN_API_TOKEN', FAKE_TOKEN, { platform: 'win32' });
      expect(JSON.stringify(r)).not.toContain(FAKE_TOKEN);
    });

    test('rejects a missing key or value (programmer error)', async () => {
      await expect(writeUserEnvVar('', 'v', { platform: 'linux', profilePath: path.join(tmpRoot, '.x') })).rejects.toThrow();
      await expect(writeUserEnvVar('K', undefined, { platform: 'linux', profilePath: path.join(tmpRoot, '.x') })).rejects.toThrow();
    });
  });
});

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
