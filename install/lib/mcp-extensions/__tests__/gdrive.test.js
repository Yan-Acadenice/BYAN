'use strict';

const path = require('path');
const fs = require('fs-extra');
const os = require('os');

const gdrive = require('../gdrive');

describe('gdrive extension contract', () => {
  test('exposes the public registry contract', () => {
    expect(gdrive.id).toBe('gdrive');
    expect(typeof gdrive.name).toBe('string');
    expect(typeof gdrive.description).toBe('string');
    expect(typeof gdrive.isConfigured).toBe('function');
    expect(typeof gdrive.setup).toBe('function');
    expect(typeof gdrive.buildMcpEntry).toBe('function');
  });

  test('CONFIG_DIR is under HOME (never inside the project)', () => {
    expect(gdrive.CONFIG_DIR.startsWith(os.homedir())).toBe(true);
    expect(gdrive.CONFIG_DIR.includes('node_modules')).toBe(false);
  });

  test('buildEntry uses npx -y google-workspace-mcp serve and writes no secret', () => {
    const entry = gdrive.buildEntry();
    expect(entry.command).toBe('npx');
    expect(entry.args).toEqual(['-y', 'google-workspace-mcp', 'serve']);
    expect(entry.env).toBeUndefined();
  });

  test('buildMcpEntry returns the same shape as buildEntry (no secrets in env)', async () => {
    const entry = await gdrive.buildMcpEntry();
    expect(entry.command).toBe('npx');
    expect(entry.args).toContain('google-workspace-mcp');
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toMatch(/byan_[a-f0-9]{20,}/i);
    expect(serialized).not.toMatch(/AIza[0-9A-Za-z_-]{30,}/);
    expect(serialized).not.toMatch(/ghp_[A-Za-z0-9]{30,}/);
  });

  test('CREDENTIALS_PATH lives under CONFIG_DIR', () => {
    expect(gdrive.CREDENTIALS_PATH.startsWith(gdrive.CONFIG_DIR)).toBe(true);
    expect(path.basename(gdrive.CREDENTIALS_PATH)).toBe('credentials.json');
  });

  test('PACKAGE_NAME is the canonical npm name', () => {
    expect(gdrive.PACKAGE_NAME).toBe('google-workspace-mcp');
  });
});
