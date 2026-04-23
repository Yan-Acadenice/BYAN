'use strict';

/**
 * E2E integration tests — install-to-update platform-config flow.
 *
 * Proves that a "pre-fix" install (token missing from .mcp.json, URL has /api
 * suffix) self-heals after running update-byan-agent migration, already-correct
 * configs are no-op, missing-token fails gracefully, dry-run reports without
 * writing, and the round-trip install→repair path agrees on schema.
 *
 * Requires W3 to have committed update-byan-agent/lib/migrate-mcp-config.js.
 * Interface contract: (projectRoot, { dryRun?, verbose? }) →
 *   Promise<{ migrated: bool, reason: string, changes?: any[], hint?: string }>
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const fsExtra = require('fs-extra');

// Real code paths — no stubs.
const { ensureMcpConfig, readMcpConfig } = require('../install/packages/platform-config').mcpConfig;
const { runMigration } = require('../update-byan-agent/lib/migrate-mcp-config');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'byan-e2e-'));
}

async function writeMcpJson(dir, data) {
  await fsExtra.writeJson(path.join(dir, '.mcp.json'), data, { spaces: 2 });
}

async function readMcpJson(dir) {
  return fsExtra.readJson(path.join(dir, '.mcp.json'));
}

async function writeDotenv(dir, content) {
  await fsExtra.outputFile(path.join(dir, '.env'), content, 'utf8');
}

async function writeSettingsLocal(dir, data) {
  await fsExtra.outputJson(
    path.join(dir, '.claude', 'settings.local.json'),
    data,
    { spaces: 2 },
  );
}

// Pre-fix .mcp.json: token absent, URL has /api suffix, extra server preserved.
function preFix(extraServers = {}) {
  return {
    mcpServers: {
      byan: {
        command: 'node',
        args: ['_byan/mcp/byan-mcp-server/server.js'],
        env: {
          BYAN_API_URL: 'http://localhost:3737/api',
        },
      },
      ...extraServers,
    },
  };
}

// Already-correct .mcp.json: token present, URL clean.
function alreadyOk() {
  return {
    mcpServers: {
      byan: {
        command: 'node',
        args: ['_byan/mcp/byan-mcp-server/server.js'],
        env: {
          BYAN_API_URL: 'http://localhost:3737',
          BYAN_API_TOKEN: 'byan_testtoken123',
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Scenario A — pre-fix install, token in .env → migration heals
// ---------------------------------------------------------------------------

describe('Scenario A — pre-fix install self-heals', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = makeTmp();
    await writeMcpJson(tmpDir, preFix({ foo: { command: 'node', args: ['other.js'] } }));
    await writeDotenv(tmpDir, 'BYAN_API_TOKEN=byan_testtoken123\nBYAN_API_URL=http://localhost:3737/api\n');
    await writeSettingsLocal(tmpDir, { env: { BYAN_API_TOKEN: 'byan_testtoken123' } });
  });

  afterEach(() => {
    fsExtra.removeSync(tmpDir);
  });

  it('reports migrated=true with reason healed', async () => {
    const result = await runMigration(tmpDir, { verbose: false });
    expect(result.migrated).toBe(true);
    expect(result.reason).toBe('healed');
  });

  it('changes array includes token-injection and url-strip entries', async () => {
    const result = await runMigration(tmpDir, { verbose: false });
    expect(Array.isArray(result.changes)).toBe(true);
    expect(result.changes.length).toBeGreaterThanOrEqual(1);
    const changeTypes = result.changes.map((c) => c.type || c.change || c.key || c);
    const changesStr = JSON.stringify(result.changes).toLowerCase();
    expect(
      changesStr.includes('token') || changesStr.includes('BYAN_API_TOKEN'),
    ).toBe(true);
    expect(
      changesStr.includes('url') || changesStr.includes('BYAN_API_URL') || changesStr.includes('api'),
    ).toBe(true);
  });

  it('writes token into .mcp.json', async () => {
    await runMigration(tmpDir, { verbose: false });
    const mcp = await readMcpJson(tmpDir);
    expect(mcp.mcpServers.byan.env.BYAN_API_TOKEN).toBe('byan_testtoken123');
  });

  it('strips /api suffix from URL in .mcp.json', async () => {
    await runMigration(tmpDir, { verbose: false });
    const mcp = await readMcpJson(tmpDir);
    expect(mcp.mcpServers.byan.env.BYAN_API_URL).toBe('http://localhost:3737');
  });

  it('preserves command field', async () => {
    await runMigration(tmpDir, { verbose: false });
    const mcp = await readMcpJson(tmpDir);
    expect(mcp.mcpServers.byan.command).toBe('node');
  });

  it('preserves other mcpServers entries', async () => {
    await runMigration(tmpDir, { verbose: false });
    const mcp = await readMcpJson(tmpDir);
    expect(mcp.mcpServers.foo).toBeDefined();
    expect(mcp.mcpServers.foo.command).toBe('node');
  });
});

// ---------------------------------------------------------------------------
// Scenario B — already-correct .mcp.json → migration is no-op
// ---------------------------------------------------------------------------

describe('Scenario B — already-correct config is no-op', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = makeTmp();
    await writeMcpJson(tmpDir, alreadyOk());
    await writeDotenv(tmpDir, 'BYAN_API_TOKEN=byan_testtoken123\nBYAN_API_URL=http://localhost:3737\n');
  });

  afterEach(() => {
    fsExtra.removeSync(tmpDir);
  });

  it('reports migrated=false with reason already-ok', async () => {
    const result = await runMigration(tmpDir, { verbose: false });
    expect(result.migrated).toBe(false);
    expect(result.reason).toBe('already-ok');
  });

  it('leaves file content byte-identical', async () => {
    const before = await fsExtra.readFile(path.join(tmpDir, '.mcp.json'), 'utf8');
    await runMigration(tmpDir, { verbose: false });
    const after = await fsExtra.readFile(path.join(tmpDir, '.mcp.json'), 'utf8');
    expect(after).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Scenario C — no token anywhere → fails gracefully
// ---------------------------------------------------------------------------

describe('Scenario C — no token available, graceful failure', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = makeTmp();
    // .mcp.json missing token, URL has /api suffix
    await writeMcpJson(tmpDir, preFix());
    // No .env, no settings.local.json with token
  });

  afterEach(() => {
    fsExtra.removeSync(tmpDir);
  });

  it('does not throw', async () => {
    await expect(runMigration(tmpDir, { verbose: false })).resolves.toBeDefined();
  });

  it('reports migrated=false with reason no-token-available', async () => {
    const result = await runMigration(tmpDir, { verbose: false });
    expect(result.migrated).toBe(false);
    expect(result.reason).toBe('no-token-available');
  });

  it('returns a non-empty hint string', async () => {
    const result = await runMigration(tmpDir, { verbose: false });
    expect(typeof result.hint).toBe('string');
    expect(result.hint.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario D — dry-run reports changes without writing
// ---------------------------------------------------------------------------

describe('Scenario D — dry-run reports without writing', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = makeTmp();
    await writeMcpJson(tmpDir, preFix());
    await writeDotenv(tmpDir, 'BYAN_API_TOKEN=byan_testtoken123\nBYAN_API_URL=http://localhost:3737/api\n');
    await writeSettingsLocal(tmpDir, { env: { BYAN_API_TOKEN: 'byan_testtoken123' } });
  });

  afterEach(() => {
    fsExtra.removeSync(tmpDir);
  });

  it('reports migrated=false with reason dry-run', async () => {
    const result = await runMigration(tmpDir, { verbose: false, dryRun: true });
    expect(result.migrated).toBe(false);
    expect(result.reason).toBe('dry-run');
  });

  it('reports at least one change', async () => {
    const result = await runMigration(tmpDir, { verbose: false, dryRun: true });
    expect(Array.isArray(result.changes)).toBe(true);
    expect(result.changes.length).toBeGreaterThanOrEqual(1);
  });

  it('leaves file content unchanged on disk', async () => {
    const before = await fsExtra.readFile(path.join(tmpDir, '.mcp.json'), 'utf8');
    await runMigration(tmpDir, { verbose: false, dryRun: true });
    const after = await fsExtra.readFile(path.join(tmpDir, '.mcp.json'), 'utf8');
    expect(after).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Scenario E — round-trip: install writes with token → pre-fix simulation → migration restores
// ---------------------------------------------------------------------------

describe('Scenario E — round-trip install→simulate-pre-fix→repair agrees on schema', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = makeTmp();
  });

  afterEach(() => {
    fsExtra.removeSync(tmpDir);
  });

  it('repair restores a token that was surgically removed by a pre-fix simulation', async () => {
    // Step 1: use ensureMcpConfig to write initial .mcp.json WITH token (install path)
    await ensureMcpConfig(tmpDir, {
      apiUrl: 'http://localhost:3737',
      token: 'byan_testtoken123',
    });

    // Step 2: verify it was written correctly
    const installed = await readMcpJson(tmpDir);
    expect(installed.mcpServers.byan.env.BYAN_API_TOKEN).toBe('byan_testtoken123');

    // Step 3: simulate "pre-fix" state — surgically remove token and re-add /api suffix
    const simPreFix = JSON.parse(JSON.stringify(installed));
    delete simPreFix.mcpServers.byan.env.BYAN_API_TOKEN;
    simPreFix.mcpServers.byan.env.BYAN_API_URL = 'http://localhost:3737/api';
    await fsExtra.writeJson(path.join(tmpDir, '.mcp.json'), simPreFix, { spaces: 2 });

    // Step 4: provide token in .env so migration can find it
    await writeDotenv(tmpDir, 'BYAN_API_TOKEN=byan_testtoken123\nBYAN_API_URL=http://localhost:3737/api\n');

    // Step 5: run migration (update-byan-agent path)
    const result = await runMigration(tmpDir, { verbose: false });
    expect(result.migrated).toBe(true);

    // Step 6: repaired config agrees with original install-path schema
    const repaired = await readMcpJson(tmpDir);
    expect(repaired.mcpServers.byan.env.BYAN_API_TOKEN).toBe('byan_testtoken123');
    expect(repaired.mcpServers.byan.env.BYAN_API_URL).toBe('http://localhost:3737');
    expect(repaired.mcpServers.byan.command).toBe(installed.mcpServers.byan.command);
    expect(repaired.mcpServers.byan.args).toEqual(installed.mcpServers.byan.args);
  });
});
