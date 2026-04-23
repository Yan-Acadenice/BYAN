/**
 * byan_web integration during installer setup.
 *
 * Prompts user for an optional byan_web JWT token and API URL, then writes
 * the token to every platform's config :
 *   - .claude/settings.local.json  (Claude Code env)
 *   - .env                          (Copilot CLI / general shell)
 *   - .mcp.json                     (MCP server registration)
 *
 * Both files are created if missing; existing content is preserved (merged).
 * The prompt clearly flags byan_web as a paid service so the user knows
 * what they're agreeing to before entering a token.
 */

const path = require('path');
const fs = require('fs-extra');
const inquirer = require('inquirer');
const chalk = require('chalk');

const DEFAULT_API_URL = 'http://localhost:3737';
const MCP_SERVER_REL_PATH = '_byan/mcp/byan-mcp-server/server.js';
const ENV_KEYS = ['BYAN_API_TOKEN', 'BYAN_API_URL'];

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

async function updateDotenv(projectRoot, env) {
  const filePath = path.join(projectRoot, '.env');
  let content = '';
  if (await fs.pathExists(filePath)) {
    content = await fs.readFile(filePath, 'utf8');
  }

  const lines = content ? content.split(/\r?\n/) : [];
  const keys = Object.keys(env);
  const kept = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return true;
    const eq = trimmed.indexOf('=');
    if (eq < 0) return true;
    const key = trimmed.slice(0, eq).trim();
    return !keys.includes(key);
  });

  while (kept.length && kept[kept.length - 1] === '') kept.pop();
  for (const key of keys) {
    const val = env[key] ?? '';
    kept.push(`${key}=${val}`);
  }
  kept.push('');

  await fs.writeFile(filePath, kept.join('\n'), 'utf8');
  return filePath;
}

async function ensureMcpConfig(projectRoot, apiUrl, token) {
  // Strip trailing /api or /api/ so the server.js prefix doesn't double-up (B5)
  const cleanUrl = apiUrl.replace(/\/api\/?$/, '');

  const filePath = path.join(projectRoot, '.mcp.json');
  const current = await readJsonOrEmpty(filePath);
  current.mcpServers = current.mcpServers || {};

  const existing = current.mcpServers.byan || {};

  // Build env: always overwrite URL and token; preserve anything else
  const env = { ...(existing.env || {}) };
  env.BYAN_API_URL = cleanUrl;
  if (token && typeof token === 'string' && token.length > 0) {
    env.BYAN_API_TOKEN = token;
  } else {
    // Remove placeholder empty string if it was set previously without a token
    delete env.BYAN_API_TOKEN;
  }

  // Spread existing to preserve any extra keys (e.g. set by claude-native-setup).
  // Defaults for command/args are only applied when the entry is new.
  current.mcpServers.byan = {
    command: 'node',
    args: [MCP_SERVER_REL_PATH],
    ...existing,
    env,
  };

  await fs.writeJson(filePath, current, { spaces: 2 });
  return filePath;
}

async function promptForToken() {
  const { wantsToken } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'wantsToken',
      message:
        'Connect this project to your byan_web instance ? ' +
        chalk.yellow('(service payant — requires a paid subscription to generate a token)'),
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
    ? options.presetInputs || { configured: false }
    : await promptForToken();

  if (!inputs.configured) {
    if (!options.quiet) {
      console.log(
        chalk.gray(
          '  ℹ byan_web integration skipped. Re-run installer or edit .env / .claude/settings.local.json to enable later.'
        )
      );
    }
    return { configured: false };
  }

  const env = {
    BYAN_API_TOKEN: inputs.token,
    BYAN_API_URL: inputs.apiUrl,
  };

  const settingsPath = await updateSettingsLocal(projectRoot, env);
  const envPath = await updateDotenv(projectRoot, env);
  const mcpPath = await ensureMcpConfig(projectRoot, inputs.apiUrl, inputs.token);

  if (!options.quiet) {
    console.log(chalk.green(`  ✓ byan_web integration configured`));
    console.log(
      chalk.gray(`    - Token (Claude Code) → ${path.relative(projectRoot, settingsPath)}`)
    );
    console.log(
      chalk.gray(`    - Token (Copilot CLI / shell) → ${path.relative(projectRoot, envPath)}`)
    );
    console.log(
      chalk.gray(`    - MCP server registered in ${path.relative(projectRoot, mcpPath)}`)
    );
  }

  return { configured: true, settingsPath, envPath, mcpPath };
}

module.exports = {
  setupByanWebIntegration,
  updateSettingsLocal,
  updateDotenv,
  ensureMcpConfig,
  promptForToken,
  ENV_KEYS,
};
