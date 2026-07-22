'use strict';

const path = require('path');
const fs = require('fs-extra');
const os = require('os');

const { listExtensions, getExtension, setupMcpExtensions } = require('..');

describe('mcp-extensions registry', () => {
  // G4: gdrive is out of the install flow (Google runs server-side, per-user
  // identity). The module file stays on disk; only its registration is gone.
  test('listExtensions no longer registers gdrive (removed from the flow)', () => {
    const list = listExtensions();
    expect(Array.isArray(list)).toBe(true);
    expect(list.find((e) => e.id === 'gdrive')).toBeUndefined();
  });

  test('getExtension returns null for gdrive (deregistered), module kept on disk', () => {
    expect(getExtension('gdrive')).toBeNull();

    // The module itself is NOT deleted — it still honors the contract.
    const gdrive = require('../gdrive');
    expect(gdrive.id).toBe('gdrive');
    expect(typeof gdrive.setup).toBe('function');
    expect(typeof gdrive.buildMcpEntry).toBe('function');
  });

  test('getExtension returns null for unknown id', () => {
    expect(getExtension('does-not-exist')).toBeNull();
  });
});

describe('setupMcpExtensions (skipPrompts)', () => {
  let tmpRoot;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-mcp-ext-'));
  });

  afterEach(async () => {
    await fs.remove(tmpRoot);
  });

  test('empty registry: returns no results and writes nothing', async () => {
    const results = await setupMcpExtensions(tmpRoot, { skipPrompts: true, quiet: true });
    expect(results).toEqual([]);

    const mcpExists = await fs.pathExists(path.join(tmpRoot, '.mcp.json'));
    expect(mcpExists).toBe(false);
  });

  test('preset selection only triggers setup for the selected extension', async () => {
    const results = await setupMcpExtensions(tmpRoot, {
      skipPrompts: true,
      presetSelections: { 'unknown-id': true },
      quiet: true,
    });
    expect(results.every((r) => r.configured === false)).toBe(true);
  });
});
