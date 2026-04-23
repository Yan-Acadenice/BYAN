const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const {
  updateSettingsLocal,
  updateDotenv,
  readEnvToken,
} = require('../lib/env-config');

describe('env-config', () => {
  let tmpRoot;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-platform-env-'));
  });

  afterEach(async () => {
    await fs.remove(tmpRoot);
  });

  describe('updateSettingsLocal', () => {
    test('creates .claude/settings.local.json with env', async () => {
      const { path: filePath } = await updateSettingsLocal(tmpRoot, {
        BYAN_API_TOKEN: 'abc',
        BYAN_API_URL: 'http://localhost:3737',
      });
      const content = await fs.readJson(filePath);
      expect(content.env.BYAN_API_TOKEN).toBe('abc');
      expect(content.env.BYAN_API_URL).toBe('http://localhost:3737');
    });

    test('preserves existing unrelated settings', async () => {
      const filePath = path.join(tmpRoot, '.claude', 'settings.local.json');
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeJson(filePath, {
        env: { EXISTING: 'keep' },
        permissions: { allow: ['Read'] },
      });

      await updateSettingsLocal(tmpRoot, { BYAN_API_TOKEN: 'new' });

      const content = await fs.readJson(filePath);
      expect(content.env.EXISTING).toBe('keep');
      expect(content.env.BYAN_API_TOKEN).toBe('new');
      expect(content.permissions.allow).toEqual(['Read']);
    });

    test('returns object with path property', async () => {
      const result = await updateSettingsLocal(tmpRoot, { FOO: 'bar' });
      expect(result.path).toBe(path.join(tmpRoot, '.claude', 'settings.local.json'));
    });
  });

  describe('updateDotenv', () => {
    test('creates .env with BYAN_API_TOKEN and BYAN_API_URL', async () => {
      const { path: filePath } = await updateDotenv(tmpRoot, {
        BYAN_API_TOKEN: 'xyz',
        BYAN_API_URL: 'https://byan.example.com',
      });
      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toMatch(/BYAN_API_TOKEN=xyz/);
      expect(content).toMatch(/BYAN_API_URL=https:\/\/byan\.example\.com/);
    });

    test('replaces existing BYAN_API_TOKEN line instead of duplicating', async () => {
      const filePath = path.join(tmpRoot, '.env');
      await fs.writeFile(filePath, 'OTHER=kept\nBYAN_API_TOKEN=old\n', 'utf8');
      await updateDotenv(tmpRoot, { BYAN_API_TOKEN: 'new' });

      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toMatch(/OTHER=kept/);
      expect(content).toMatch(/BYAN_API_TOKEN=new/);
      expect(content.match(/BYAN_API_TOKEN=/g)).toHaveLength(1);
    });

    test('preserves comments and unrelated keys', async () => {
      const filePath = path.join(tmpRoot, '.env');
      await fs.writeFile(filePath, '# Header comment\nDB_URL=postgres://x\n', 'utf8');
      await updateDotenv(tmpRoot, { BYAN_API_TOKEN: 't' });

      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toMatch(/# Header comment/);
      expect(content).toMatch(/DB_URL=postgres:\/\/x/);
      expect(content).toMatch(/BYAN_API_TOKEN=t/);
    });

    test('returns object with path property', async () => {
      const result = await updateDotenv(tmpRoot, { FOO: 'bar' });
      expect(result.path).toBe(path.join(tmpRoot, '.env'));
    });
  });

  describe('readEnvToken', () => {
    test('returns null when neither source exists', async () => {
      expect(await readEnvToken(tmpRoot)).toBeNull();
    });

    test('reads BYAN_API_TOKEN from .env', async () => {
      await fs.writeFile(
        path.join(tmpRoot, '.env'),
        'OTHER=x\nBYAN_API_TOKEN=tok-from-dotenv\n',
        'utf8'
      );
      expect(await readEnvToken(tmpRoot)).toBe('tok-from-dotenv');
    });

    test('reads BYAN_API_TOKEN with surrounding double quotes', async () => {
      await fs.writeFile(
        path.join(tmpRoot, '.env'),
        'BYAN_API_TOKEN="quoted-token"\n',
        'utf8'
      );
      expect(await readEnvToken(tmpRoot)).toBe('quoted-token');
    });

    test('falls back to settings.local.json when .env missing', async () => {
      const settingsPath = path.join(tmpRoot, '.claude', 'settings.local.json');
      await fs.ensureDir(path.dirname(settingsPath));
      await fs.writeJson(settingsPath, {
        env: { BYAN_API_TOKEN: 'tok-from-settings' },
      });
      expect(await readEnvToken(tmpRoot)).toBe('tok-from-settings');
    });

    test('falls back to settings.local.json when .env has no token', async () => {
      await fs.writeFile(path.join(tmpRoot, '.env'), 'OTHER=x\n', 'utf8');
      const settingsPath = path.join(tmpRoot, '.claude', 'settings.local.json');
      await fs.ensureDir(path.dirname(settingsPath));
      await fs.writeJson(settingsPath, {
        env: { BYAN_API_TOKEN: 'tok-from-settings' },
      });
      expect(await readEnvToken(tmpRoot)).toBe('tok-from-settings');
    });

    test('.env takes precedence over settings.local.json', async () => {
      await fs.writeFile(
        path.join(tmpRoot, '.env'),
        'BYAN_API_TOKEN=from-dotenv\n',
        'utf8'
      );
      const settingsPath = path.join(tmpRoot, '.claude', 'settings.local.json');
      await fs.ensureDir(path.dirname(settingsPath));
      await fs.writeJson(settingsPath, {
        env: { BYAN_API_TOKEN: 'from-settings' },
      });
      expect(await readEnvToken(tmpRoot)).toBe('from-dotenv');
    });

    test('returns null when .env has empty BYAN_API_TOKEN= line', async () => {
      await fs.writeFile(path.join(tmpRoot, '.env'), 'BYAN_API_TOKEN=\n', 'utf8');
      expect(await readEnvToken(tmpRoot)).toBeNull();
    });

    test('returns null when settings.local.json is malformed', async () => {
      const settingsPath = path.join(tmpRoot, '.claude', 'settings.local.json');
      await fs.ensureDir(path.dirname(settingsPath));
      await fs.writeFile(settingsPath, '{not json', 'utf8');
      expect(await readEnvToken(tmpRoot)).toBeNull();
    });

    test('ignores comment lines in .env', async () => {
      await fs.writeFile(
        path.join(tmpRoot, '.env'),
        '# BYAN_API_TOKEN=commented-out\nOTHER=x\n',
        'utf8'
      );
      expect(await readEnvToken(tmpRoot)).toBeNull();
    });
  });
});
