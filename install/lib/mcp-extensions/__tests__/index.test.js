'use strict';

const path = require('path');
const fs = require('fs-extra');
const os = require('os');

const { listExtensions, getExtension, setupMcpExtensions } = require('..');

describe('mcp-extensions registry', () => {
  test('listExtensions returns gdrive at minimum', () => {
    const list = listExtensions();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.find((e) => e.id === 'gdrive')).toBeDefined();
  });

  test('getExtension returns the gdrive module by id', () => {
    const ext = getExtension('gdrive');
    expect(ext).not.toBeNull();
    expect(ext.id).toBe('gdrive');
    expect(typeof ext.setup).toBe('function');
    expect(typeof ext.buildMcpEntry).toBe('function');
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

  test('with no preset selections, skips every extension and writes nothing', async () => {
    const results = await setupMcpExtensions(tmpRoot, { skipPrompts: true, quiet: true });
    expect(results.length).toBeGreaterThanOrEqual(1);
    results.forEach((r) => expect(r.configured).toBe(false));

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
