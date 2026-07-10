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

function getCodexSkillsDir() {
  return path.join(os.homedir(), '.codex', 'skills');
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

function uniqueExistingDirs(dirs) {
  const seen = new Set();
  const out = [];
  for (const dir of dirs.filter(Boolean)) {
    const resolved = path.resolve(dir);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

async function findSkillDirs(sourceDirs = []) {
  const skills = [];
  const seenNames = new Set();

  for (const sourceDir of uniqueExistingDirs(sourceDirs)) {
    if (!(await fs.pathExists(sourceDir))) continue;
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillName = entry.name;
      if (seenNames.has(skillName)) continue;
      const skillDir = path.join(sourceDir, skillName);
      const skillFile = path.join(skillDir, 'SKILL.md');
      if (!(await fs.pathExists(skillFile))) continue;
      seenNames.add(skillName);
      skills.push({ name: skillName, path: skillDir, sourceDir });
    }
  }

  return skills;
}

function defaultSkillSourceDirs(projectRoot, options = {}) {
  const templateDir = options.templateDir;
  return [
    path.join(projectRoot, '.codex', 'skills'),
    path.join(projectRoot, '.claude', 'skills'),
    templateDir ? path.join(templateDir, '.codex', 'skills') : null,
    templateDir ? path.join(templateDir, '.claude', 'skills') : null,
  ];
}

async function installCodexNativeSkills(projectRoot, options = {}) {
  const destDir = options.destDir || getCodexSkillsDir();
  const sourceDirs = options.sourceDirs || defaultSkillSourceDirs(projectRoot, options);
  const overwrite = options.overwrite !== false;

  await fs.ensureDir(destDir);

  const skills = await findSkillDirs(sourceDirs);
  const result = {
    destDir,
    installed: 0,
    skipped: 0,
    skills: [],
  };

  for (const skill of skills) {
    const dest = path.join(destDir, skill.name);
    const exists = await fs.pathExists(dest);
    if (exists && !overwrite) {
      result.skipped++;
      result.skills.push({ name: skill.name, status: 'skipped-existing', path: dest });
      continue;
    }
    await fs.copy(skill.path, dest, { overwrite: true, errorOnExist: false });
    result.installed++;
    result.skills.push({ name: skill.name, status: exists ? 'updated' : 'installed', path: dest });
  }

  return result;
}

async function setupCodexNative(projectRoot, options = {}) {
  const log = options.quiet ? () => {} : (...a) => console.log(...a);

  const present = await detectCodex();
  if (!present && !options.force) {
    log(chalk.gray('  · Codex CLI not detected (~/.codex absent), skipping'));
    return { skipped: true, reason: 'codex-not-detected' };
  }

  const result = await patchCodexConfig(projectRoot, options);
  log(chalk.green(`  [OK] Codex MCP entry written to ${result.path}`));
  if (!result.tokenSet) {
    log(
      chalk.yellow(
        `    [WARN] BYAN_API_TOKEN left empty. Edit ${result.path} and set BYAN_API_TOKEN`
      )
    );
    log(chalk.gray('      (or rerun with BYAN_API_TOKEN=byan_xxx in the env)'));
  }
  const skills = await installCodexNativeSkills(projectRoot, options);
  if (skills.installed > 0) {
    log(chalk.green(`  [OK] Codex native skills installed to ${skills.destDir} (${skills.installed})`));
  } else {
    log(chalk.yellow(`  ! No Codex native skills found to install into ${skills.destDir}`));
  }
  if (skills.skipped > 0) {
    log(chalk.gray(`    ${skills.skipped} existing skill(s) skipped`));
  }
  log(chalk.gray('    Restart Codex CLI for the new MCP server and skills to load'));
  return { ...result, skills };
}

module.exports = {
  setupCodexNative,
  patchCodexConfig,
  installCodexNativeSkills,
  findSkillDirs,
  defaultSkillSourceDirs,
  stripServerSections,
  buildByanBlock,
  getCodexConfigPath,
  getCodexSkillsDir,
  detectCodex,
};
