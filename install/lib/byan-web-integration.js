/**
 * byan_web integration during installer setup.
 *
 * Prompts user for an optional byan_web JWT token and API URL, then writes:
 *   - .claude/settings.local.json  (adds env.BYAN_API_TOKEN + env.BYAN_API_URL)
 *   - .mcp.json                    (ensures byan MCP server is registered)
 *
 * Both files are created if missing; existing content is preserved (merged).
 */

const path = require('path');
const fs = require('fs-extra');
const inquirer = require('inquirer');
const chalk = require('chalk');

const DEFAULT_API_URL = 'http://localhost:3737';
const MCP_SERVER_REL_PATH = '_byan/mcp/byan-mcp-server/server.js';

async function readJsonOrEmpty(filePath) {
  if (await fs.pathExists(filePath)) {
    try {
      return await fs.readJson(filePath);
    } catch {
      return {};
    }
  }
  return {};
}

async function updateSettingsLocal(projectRoot, env) {
  const filePath = path.join(projectRoot, '.claude', 'settings.local.json');
  const current = await readJsonOrEmpty(filePath);
  current.env = { ...(current.env || {}), ...env };
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(filePath, current, { spaces: 2 });
  return filePath;
}

async function ensureMcpConfig(projectRoot, apiUrl) {
  const filePath = path.join(projectRoot, '.mcp.json');
  const current = await readJsonOrEmpty(filePath);
  current.mcpServers = current.mcpServers || {};
  current.mcpServers.byan = {
    command: 'node',
    args: [MCP_SERVER_REL_PATH],
    env: { BYAN_API_URL: apiUrl },
  };
  await fs.writeJson(filePath, current, { spaces: 2 });
  return filePath;
}

async function promptForToken() {
  const { wantsToken } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'wantsToken',
      message: 'Connect this project to your byan_web instance? (optional, skip if unsure)',
      default: false,
    },
  ]);

  if (!wantsToken) return { configured: false };

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiUrl',
      message: 'byan_web API URL:',
      default: DEFAULT_API_URL,
      validate: (v) =>
        /^https?:\/\//.test(v.trim()) || 'Must start with http:// or https://',
    },
    {
      type: 'password',
      name: 'token',
      message: 'byan_web JWT token (from POST /api/auth/login):',
      mask: '*',
      validate: (v) =>
        (typeof v === 'string' && v.trim().length > 0) || 'Token cannot be empty',
    },
  ]);

  return {
    configured: true,
    apiUrl: answers.apiUrl.trim(),
    token: answers.token.trim(),
  };
}

async function setupByanWebIntegration(projectRoot, options = {}) {
  const skip = options.skipPrompts === true;
  const inputs = skip
    ? { configured: false }
    : await promptForToken();

  if (!inputs.configured) {
    if (!options.quiet) {
      console.log(
        chalk.gray(
          '  ℹ byan_web integration skipped. Run installer again or edit .claude/settings.local.json to enable.'
        )
      );
    }
    return { configured: false };
  }

  const settingsPath = await updateSettingsLocal(projectRoot, {
    BYAN_API_TOKEN: inputs.token,
    BYAN_API_URL: inputs.apiUrl,
  });
  const mcpPath = await ensureMcpConfig(projectRoot, inputs.apiUrl);

  if (!options.quiet) {
    console.log(chalk.green(`  ✓ byan_web integration configured`));
    console.log(chalk.gray(`    - Token stored in ${path.relative(projectRoot, settingsPath)}`));
    console.log(chalk.gray(`    - MCP server registered in ${path.relative(projectRoot, mcpPath)}`));
  }

  return { configured: true, settingsPath, mcpPath };
}

module.exports = {
  setupByanWebIntegration,
  updateSettingsLocal,
  ensureMcpConfig,
  promptForToken,
};
