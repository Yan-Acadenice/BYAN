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
const { mcpConfig: { TOKEN_PLACEHOLDER } } = require('byan-platform-config');

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
// Test 3 — byan entry already has placeholder + clean URL → already-ok
// ──────────────────────────────────────────────────────────────────────────────
test('returns already-ok if byan entry has no BYAN_API_TOKEN (token belongs in .env / settings.local.json)', async () => {
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
  const result = await runMigration(dir);
  expect(result.migrated).toBe(false);
  expect(result.reason).toBe('already-ok');
  await fs.remove(dir);
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 4 — needs token but .env + settings.local.json both empty → no-token-available
// ──────────────────────────────────────────────────────────────────────────────
test('returns already-ok if .mcp.json has no BYAN_API_TOKEN (token absence is now the desired state)', async () => {
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
  const result = await runMigration(dir);
  expect(result.migrated).toBe(false);
  expect(result.reason).toBe('already-ok');
  await fs.remove(dir);
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 5 — migrates successfully: token from .env
// ──────────────────────────────────────────────────────────────────────────────
test('with token already absent in .mcp.json + .env populated: no-op (already-ok), .env preserved untouched', async () => {
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
  expect(result.migrated).toBe(false);
  expect(result.reason).toBe('already-ok');

  const dotenvAfter = await fs.readFile(path.join(dir, '.env'), 'utf8');
  expect(dotenvAfter).toBe('BYAN_API_TOKEN=byan_from_dotenv\n');
  await fs.remove(dir);
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 6 — migrates successfully: token from .claude/settings.local.json fallback
// ──────────────────────────────────────────────────────────────────────────────
test('with token in settings.local.json + absent from .mcp.json: no-op (already-ok), settings preserved', async () => {
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
  await writeSettingsLocal(dir, { env: { BYAN_API_TOKEN: 'byan_from_settings' } });

  const result = await runMigration(dir);
  expect(result.migrated).toBe(false);
  expect(result.reason).toBe('already-ok');
  const settings = await fs.readJson(path.join(dir, '.claude', 'settings.local.json'));
  expect(settings.env.BYAN_API_TOKEN).toBe('byan_from_settings');
  await fs.remove(dir);
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 7 — strips /api suffix from BYAN_API_URL
// ──────────────────────────────────────────────────────────────────────────────
test('strips /api suffix and extracts clear token to .env (token removed from .mcp.json)', async () => {
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
  // Portable: migration strips BYAN_API_URL and the token from .mcp.json.
  expect(written.mcpServers.byan.env?.BYAN_API_URL).toBeUndefined();
  expect(written.mcpServers.byan.env?.BYAN_API_TOKEN).toBeUndefined();
  const dotenvContent = await fs.readFile(path.join(dir, '.env'), 'utf8');
  expect(dotenvContent).toContain('BYAN_API_TOKEN=byan_tok');
  const raw = await fs.readFile(path.join(dir, '.mcp.json'), 'utf8');
  expect(raw).not.toContain('byan_tok');
  await fs.remove(dir);
});

test('extracts clear token from .mcp.json into .env and removes it from .mcp.json (security migration)', async () => {
  const dir = await makeTmp();
  await writeMcp(dir, {
    mcpServers: {
      byan: {
        command: 'node',
        args:    ['_byan/mcp/byan-mcp-server/server.js'],
        env:     { BYAN_API_URL: 'https://api.byan.io', BYAN_API_TOKEN: 'byan_leaked_in_clear' },
      },
    },
  });

  const result = await runMigration(dir);
  expect(result.migrated).toBe(true);
  expect(result.reason).toBe('healed');
  expect(result.changes.some((c) => /extracted/i.test(c))).toBe(true);

  const written = await readMcp(dir);
  expect(written.mcpServers.byan.env?.BYAN_API_TOKEN).toBeUndefined();

  const raw = await fs.readFile(path.join(dir, '.mcp.json'), 'utf8');
  expect(raw).not.toContain('byan_leaked_in_clear');

  const dotenvContent = await fs.readFile(path.join(dir, '.env'), 'utf8');
  expect(dotenvContent).toContain('BYAN_API_TOKEN=byan_leaked_in_clear');
  await fs.remove(dir);
});

test('removes ${BYAN_API_TOKEN} placeholder from .mcp.json (no value to extract)', async () => {
  const dir = await makeTmp();
  await writeMcp(dir, {
    mcpServers: {
      byan: {
        command: 'node',
        args:    ['_byan/mcp/byan-mcp-server/server.js'],
        env:     { BYAN_API_URL: 'https://api.byan.io', BYAN_API_TOKEN: TOKEN_PLACEHOLDER },
      },
    },
  });

  const result = await runMigration(dir);
  expect(result.migrated).toBe(true);
  expect(result.reason).toBe('healed');

  const written = await readMcp(dir);
  expect(written.mcpServers.byan.env?.BYAN_API_TOKEN).toBeUndefined();
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
  // .env must NOT have been touched on dry-run either
  const dotenvAfter = await fs.readFile(path.join(dir, '.env'), 'utf8');
  expect(dotenvAfter).toBe('BYAN_API_TOKEN=byan_dryrun_tok\n');
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
