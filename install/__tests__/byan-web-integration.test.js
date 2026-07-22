'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const { setupByanWebIntegration } = require('../lib/byan-web-integration');
const { purgeGoogleKeys, writeCredentials } = require('../lib/home-credentials');

jest.mock('byan-platform-config', () => ({
  mcpConfig: {
    ensureMcpConfig: jest.fn().mockResolvedValue({ path: '/mock/mcp.json' }),
  },
  envConfig: {
    updateSettingsLocal: jest.fn().mockResolvedValue({ path: '/mock/settings.local.json' }),
    updateDotenv: jest.fn().mockResolvedValue({ path: '/mock/.env' }),
  },
  tokenPrompt: {
    promptForToken: jest.fn(),
    ENV_KEYS: ['BYAN_API_URL', 'BYAN_API_TOKEN'],
  },
  validate: {
    validateByanWebReachability: jest.fn(),
  },
  credentials: {
    writeCredentials: jest.fn().mockResolvedValue({ path: '/mock/credentials.json' }),
  },
  urlUtils: {
    stripApiSuffix: (url) => url,
  },
}));

async function makeFixture() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-web-int-'));
  const project = path.join(base, 'project');
  await fs.ensureDir(project);
  return { base, project };
}

afterEach(() => {
  jest.clearAllMocks();
});

test('setupByanWebIntegration: user declines -> configured false', async () => {
  const { project } = await makeFixture();
  const byanPlatformConfig = require('byan-platform-config');
  byanPlatformConfig.tokenPrompt.promptForToken.mockResolvedValue({ configured: false });

  const result = await setupByanWebIntegration(project);
  expect(result).toEqual({ configured: false });
});

test('setupByanWebIntegration: credentials written, integration succeeds', async () => {
  const { project } = await makeFixture();
  const byanPlatformConfig = require('byan-platform-config');

  byanPlatformConfig.tokenPrompt.promptForToken.mockResolvedValue({
    configured: true,
    apiUrl: 'http://localhost:3737',
    token: 'byan_test123',
  });

  const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

  const result = await setupByanWebIntegration(project, {
    skipPrompts: true,
    presetInputs: {
      configured: true,
      apiUrl: 'http://localhost:3737',
      token: 'byan_test123',
    },
  });

  expect(result.configured).toBe(true);
  expect(result.apiUrl).toBe('http://localhost:3737');
  expect(result.token).toBe('byan_test123');

  consoleSpy.mockRestore();
});

test('purgeGoogleKeys is called and handles no-op case', async () => {
  // This test verifies that purgeGoogleKeys integrates properly
  const result = purgeGoogleKeys();
  expect(result).toHaveProperty('purged');
  expect(result).toHaveProperty('backupPath');
  expect(Array.isArray(result.purged)).toBe(true);
});
