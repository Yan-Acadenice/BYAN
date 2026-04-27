/**
 * Codex CLI native setup — wires the BYAN MCP server into ~/.codex/config.toml
 * during `npx create-byan-agent`.
 *
 * Mirrors claude-native-setup.js but targets Codex CLI's user-level TOML config.
 * Per Codex docs (developers.openai.com/codex/mcp), MCP entries support:
 *   command, args, env, env_vars, cwd, startup_timeout_sec, tool_timeout_sec,
 *   enabled, required, enabled_tools, disabled_tools, supports_parallel_tool_calls.
 *
 * Idempotent: strips any existing [mcp_servers.byan*] sections before writing
 * the fresh block. Other servers in config.toml are preserved untouched.
 *
 * Never persists a token: BYAN_API_TOKEN is left blank if not supplied via env
 * or interactive prompt; the user gets a clear edit instruction.
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const chalk = require('chalk');

const SERVER_NAME = 'byan';

function getCodexConfigPath() {
  return path.join(os.homedir(), '.codex', 'config.toml');
}

async function detectCodex() {
  return fs.pathExists(path.join(os.homedir(), '.codex'));
}

// TOML literal-string escape: single quotes don't interpret backslashes,
// so paths and tokens land verbatim. We just refuse values containing "'".
function tomlLiteral(value) {
  const s = String(value);
  if (s.includes("'")) {
    throw new Error(`Cannot encode value with single quote in TOML literal: ${s}`);
  }
  return `'${s}'`;
}

// Removes every section whose header matches [mcp_servers.<name>] or
// [mcp_servers.<name>.<sub>]. Lines belonging to such a section are dropped
// until another header (any header) is encountered.
function stripServerSections(content, name) {
  const ours = new RegExp(
    `^\\[mcp_servers\\.${name}(?:\\..+)?\\]\\s*$`
  );
  const anyHeader = /^\[.+\]\s*$/;
  const out = [];
  let inOur = false;
  for (const raw of content.split('\n')) {
    const line = raw;
    if (ours.test(line)) {
      inOur = true;
      continue;
    }
    if (anyHeader.test(line)) {
      inOur = false;
      out.push(line);
      continue;
    }
    if (!inOur) out.push(line);
  }
  // Trim trailing blank lines that may pile up after stripping
  return out.join('\n').replace(/\n{3,}$/g, '\n\n').replace(/\s+$/, '\n');
}

function buildByanBlock({ serverPath, apiUrl, apiToken, startupTimeoutSec = 15 }) {
  const lines = [
    '',
    '[mcp_servers.byan]',
    `command = ${tomlLiteral('node')}`,
    `args = [${tomlLiteral(serverPath)}]`,
    `startup_timeout_sec = ${Number.isFinite(startupTimeoutSec) ? startupTimeoutSec : 15}`,
    '',
    '[mcp_servers.byan.env]',
    `BYAN_API_URL = ${tomlLiteral(apiUrl)}`,
    `BYAN_API_TOKEN = ${tomlLiteral(apiToken)}`,
    '',
  ];
  return lines.join('\n');
}

async function patchCodexConfig(projectRoot, options = {}) {
  const configPath = getCodexConfigPath();
  const serverPath = path.join(
    projectRoot,
    '_byan',
    'mcp',
    'byan-mcp-server',
    'server.js'
  );

  await fs.ensureDir(path.dirname(configPath));

  let existing = '';
  if (await fs.pathExists(configPath)) {
    existing = await fs.readFile(configPath, 'utf8');
  }

  const apiUrl =
    options.apiUrl ||
    process.env.BYAN_API_URL ||
    'http://localhost:3737';
  const apiToken =
    options.apiToken !== undefined
      ? options.apiToken
      : (process.env.BYAN_API_TOKEN || '');

  const stripped = stripServerSections(existing, SERVER_NAME);
  const block = buildByanBlock({
    serverPath,
    apiUrl,
    apiToken,
    startupTimeoutSec: options.startupTimeoutSec,
  });

  const merged =
    (stripped.trimEnd().length > 0 ? stripped.trimEnd() + '\n' : '') + block;

  await fs.writeFile(configPath, merged, 'utf8');
  return { path: configPath, hadExisting: existing.length > 0, tokenSet: apiToken.length > 0 };
}

async function setupCodexNative(projectRoot, options = {}) {
  const log = options.quiet ? () => {} : (...a) => console.log(...a);

  const present = await detectCodex();
  if (!present && !options.force) {
    log(chalk.gray('  · Codex CLI not detected (~/.codex absent), skipping'));
    return { skipped: true, reason: 'codex-not-detected' };
  }

  const result = await patchCodexConfig(projectRoot, options);
  log(chalk.green(`  ✓ Codex MCP entry written to ${result.path}`));
  if (!result.tokenSet) {
    log(
      chalk.yellow(
        `    ⚠ BYAN_API_TOKEN left empty. Edit ${result.path} and set BYAN_API_TOKEN`
      )
    );
    log(chalk.gray('      (or rerun with BYAN_API_TOKEN=byan_xxx in the env)'));
  }
  log(chalk.gray('    Restart Codex CLI for the new MCP server to load'));
  return result;
}

module.exports = {
  setupCodexNative,
  patchCodexConfig,
  stripServerSections,
  buildByanBlock,
  getCodexConfigPath,
  detectCodex,
};
