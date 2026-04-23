'use strict';

/**
 * Tests for update-byan-agent/lib/migrate-mcp-config.js
 *
 * Uses tmp directories for isolation. Each test sets up the minimal filesystem
 * state it needs and verifies the return value + written files.
 */

const os   = require('os');
const path = require('path');
const fs   = require('fs-extra');

// Module under test (loaded once; all I/O goes to tmpdir per test)
const { runMigration } = require('../lib/migrate-mcp-config');

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

async function makeTmp() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-test-'));
  return dir;
}

async function writeMcp(dir, content) {
  await fs.writeJson(path.join(dir, '.mcp.json'), content, { spaces: 2 });
}

async function readMcp(dir) {
  return fs.readJson(path.join(dir, '.mcp.json'));
}

async function writeDotenv(dir, content) {
  await fs.writeFile(path.join(dir, '.env'), content, 'utf8');
}

async function writeSettingsLocal(dir, content) {
  const p = path.join(dir, '.claude', 'settings.local.json');
  await fs.ensureDir(path.dirname(p));
  await fs.writeJson(p, content, { spaces: 2 });
}

// ──────────────────────────────────────────────────────────────────────────────
// Test 1 — no .mcp.json → no-mcp-json
// ──────────────────────────────────────────────────────────────────────────────
test('returns no-mcp-json if file missing', async () => {
  const dir = await makeTmp();
  const result = await runMigration(dir);
  expect(result.migrated).toBe(false);
  expect(result.reason).toBe('no-mcp-json');
  await fs.remove(dir);
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 2 — .mcp.json exists but has no byan entry → no-byan-server
// ──────────────────────────────────────────────────────────────────────────────
test('returns no-byan-server if .mcp.json has other servers but no byan entry', async () => {
  const dir = await makeTmp();
  await writeMcp(dir, {
    mcpServers: {
      other: { command: 'node', args: ['other.js'], env: {} },
    },
  });
  const result = await runMigration(dir);
  expect(result.migrated).toBe(false);
  expect(result.reason).toBe('no-byan-server');
  await fs.remove(dir);
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 3 — byan entry already has token and URL without /api suffix → already-ok
// ──────────────────────────────────────────────────────────────────────────────
test('returns already-ok if byan entry has token and no /api suffix', async () => {
  const dir = await makeTmp();
  await writeMcp(dir, {
    mcpServers: {
      byan: {
        command: 'node',
        args:    ['_byan/mcp/byan-mcp-server/server.js'],
        env:     { BYAN_API_URL: 'https://api.byan.io', BYAN_API_TOKEN: 'byan_tok' },
      },
    },
  });
  const result = await runMigration(dir);
  expect(result.migrated).toBe(false);
  expect(result.reason).toBe('already-ok');
  await fs.remove(dir);
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 4 — needs token but .env + settings.local.json both empty → no-token-available
// ──────────────────────────────────────────────────────────────────────────────
test('returns no-token-available if .mcp.json needs token but sources are empty', async () => {
  const dir = await makeTmp();
  await writeMcp(dir, {
    mcpServers: {
      byan: {
        command: 'node',
        args:    ['_byan/mcp/byan-mcp-server/server.js'],
        env:     { BYAN_API_URL: 'https://api.byan.io' },
        // no BYAN_API_TOKEN
      },
    },
  });
  // no .env, no settings.local.json
  const result = await runMigration(dir);
  expect(result.migrated).toBe(false);
  expect(result.reason).toBe('no-token-available');
  expect(typeof result.hint).toBe('string');
  expect(result.hint.length).toBeGreaterThan(0);
  await fs.remove(dir);
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 5 — migrates successfully: token from .env
// ──────────────────────────────────────────────────────────────────────────────
test('migrates: token from .env → .mcp.json env.BYAN_API_TOKEN', async () => {
  const dir = await makeTmp();
  await writeMcp(dir, {
    mcpServers: {
      byan: {
        command: 'node',
        args:    ['_byan/mcp/byan-mcp-server/server.js'],
        env:     { BYAN_API_URL: 'https://api.byan.io' },
      },
    },
  });
  await writeDotenv(dir, 'BYAN_API_TOKEN=byan_from_dotenv\n');

  const result = await runMigration(dir);
  expect(result.migrated).toBe(true);
  expect(result.reason).toBe('healed');
  expect(result.changes.length).toBeGreaterThanOrEqual(1);

  const written = await readMcp(dir);
  expect(written.mcpServers.byan.env.BYAN_API_TOKEN).toBe('byan_from_dotenv');
  await fs.remove(dir);
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 6 — migrates successfully: token from .claude/settings.local.json fallback
// ──────────────────────────────────────────────────────────────────────────────
test('migrates: token from settings.local.json fallback', async () => {
  const dir = await makeTmp();
  await writeMcp(dir, {
    mcpServers: {
      byan: {
        command: 'node',
        args:    ['_byan/mcp/byan-mcp-server/server.js'],
        env:     { BYAN_API_URL: 'https://api.byan.io' },
      },
    },
  });
  // no .env, token in settings.local.json
  await writeSettingsLocal(dir, { env: { BYAN_API_TOKEN: 'byan_from_settings' } });

  const result = await runMigration(dir);
  expect(result.migrated).toBe(true);
  expect(result.reason).toBe('healed');

  const written = await readMcp(dir);
  expect(written.mcpServers.byan.env.BYAN_API_TOKEN).toBe('byan_from_settings');
  await fs.remove(dir);
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 7 — strips /api suffix from BYAN_API_URL
// ──────────────────────────────────────────────────────────────────────────────
test('strips /api suffix from BYAN_API_URL', async () => {
  const dir = await makeTmp();
  await writeMcp(dir, {
    mcpServers: {
      byan: {
        command: 'node',
        args:    ['_byan/mcp/byan-mcp-server/server.js'],
        env:     { BYAN_API_URL: 'https://api.byan.io/api', BYAN_API_TOKEN: 'byan_tok' },
      },
    },
  });

  const result = await runMigration(dir);
  expect(result.migrated).toBe(true);

  const written = await readMcp(dir);
  expect(written.mcpServers.byan.env.BYAN_API_URL).toBe('https://api.byan.io');
  expect(written.mcpServers.byan.env.BYAN_API_TOKEN).toBe('byan_tok');
  await fs.remove(dir);
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 8 — dry-run doesn't write but returns changes
// ──────────────────────────────────────────────────────────────────────────────
test('dry-run: does not write .mcp.json but returns changes', async () => {
  const dir = await makeTmp();
  const originalMcp = {
    mcpServers: {
      byan: {
        command: 'node',
        args:    ['_byan/mcp/byan-mcp-server/server.js'],
        env:     { BYAN_API_URL: 'https://api.byan.io/api' },
      },
    },
  };
  await writeMcp(dir, originalMcp);
  await writeDotenv(dir, 'BYAN_API_TOKEN=byan_dryrun_tok\n');

  const result = await runMigration(dir, { dryRun: true });
  expect(result.migrated).toBe(false);
  expect(result.reason).toBe('dry-run');
  expect(Array.isArray(result.changes)).toBe(true);
  expect(result.changes.length).toBeGreaterThan(0);

  // File must be unchanged
  const afterMcp = await readMcp(dir);
  expect(afterMcp.mcpServers.byan.env.BYAN_API_URL).toBe('https://api.byan.io/api');
  expect(afterMcp.mcpServers.byan.env.BYAN_API_TOKEN).toBeUndefined();
  await fs.remove(dir);
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 9 — preserves other mcpServers entries
// ──────────────────────────────────────────────────────────────────────────────
test('preserves other mcpServers entries after migration', async () => {
  const dir = await makeTmp();
  await writeMcp(dir, {
    mcpServers: {
      other:   { command: 'node', args: ['other.js'], env: { FOO: 'bar' } },
      another: { command: 'python', args: ['run.py'] },
      byan: {
        command: 'node',
        args:    ['_byan/mcp/byan-mcp-server/server.js'],
        env:     { BYAN_API_URL: 'https://api.byan.io' },
      },
    },
  });
  await writeDotenv(dir, 'BYAN_API_TOKEN=byan_tok\n');

  await runMigration(dir);

  const written = await readMcp(dir);
  expect(written.mcpServers.other).toBeDefined();
  expect(written.mcpServers.other.env.FOO).toBe('bar');
  expect(written.mcpServers.another).toBeDefined();
  await fs.remove(dir);
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 10 — preserves byan entry command/args
// ──────────────────────────────────────────────────────────────────────────────
test('preserves byan entry command and args after migration', async () => {
  const dir = await makeTmp();
  await writeMcp(dir, {
    mcpServers: {
      byan: {
        command: 'node',
        args:    ['custom/path/server.js'],
        env:     { BYAN_API_URL: 'https://api.byan.io' },
      },
    },
  });
  await writeDotenv(dir, 'BYAN_API_TOKEN=byan_tok\n');

  await runMigration(dir);

  const written = await readMcp(dir);
  expect(written.mcpServers.byan.command).toBe('node');
  expect(written.mcpServers.byan.args).toEqual(['custom/path/server.js']);
  await fs.remove(dir);
});
