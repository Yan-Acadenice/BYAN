/**
 * Claude Code native setup — wires hooks, skills, MCP server into the
 * target project during `npx create-byan-agent`.
 *
 * Copies from `install/templates/` :
 *   - .claude/hooks/**     (+ lib/)
 *   - .claude/skills/**
 *   - .claude/settings.json
 *   - _byan/mcp/byan-mcp-server/** (no node_modules)
 *
 * Generates:
 *   - .mcp.json with the RELATIVE path to the target project's MCP server
 *     (byan + inert byan-channel entries, via the shared pure merge)
 *
 * Runs:
 *   - npm install inside the copied MCP server dir (with fallback warning)
 */

const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');
const chalk = require('chalk');

const TEMPLATE_ROOT = path.resolve(__dirname, '..', 'templates');
const { whitelistMcpServer } = require('./settings-local');
const { mcpConfig } = require('byan-platform-config');

async function copyClaudeHooks(projectRoot) {
  const src = path.join(TEMPLATE_ROOT, '.claude', 'hooks');
  const dst = path.join(projectRoot, '.claude', 'hooks');
  if (!(await fs.pathExists(src))) return { copied: 0 };
  await fs.ensureDir(dst);
  await fs.copy(src, dst, { overwrite: true });
  const files = await walkCount(dst, '.js');
  return { copied: files };
}

async function copyClaudeSkills(projectRoot) {
  const src = path.join(TEMPLATE_ROOT, '.claude', 'skills');
  const dst = path.join(projectRoot, '.claude', 'skills');
  if (!(await fs.pathExists(src))) return { copied: 0 };
  await fs.ensureDir(dst);
  await fs.copy(src, dst, { overwrite: true });
  const files = await walkCount(dst, 'SKILL.md');
  return { copied: files };
}

async function copyClaudeSettings(projectRoot) {
  const src = path.join(TEMPLATE_ROOT, '.claude', 'settings.json');
  const dst = path.join(projectRoot, '.claude', 'settings.json');
  if (!(await fs.pathExists(src))) return { copied: false };
  await fs.copy(src, dst, { overwrite: true });
  return { copied: true };
}

function makeNodeModulesFilter(srcRoot) {
  // Checks the path RELATIVE to srcRoot: a global install path like
  // /usr/local/lib/node_modules/create-byan-agent/... would otherwise make
  // every file look like it lives under node_modules and get skipped.
  return (s) => {
    const rel = path.relative(srcRoot, s);
    return !rel.split(path.sep).includes('node_modules');
  };
}

async function copyMcpServer(projectRoot) {
  const src = path.join(TEMPLATE_ROOT, '_byan', 'mcp', 'byan-mcp-server');
  const dst = path.join(projectRoot, '_byan', 'mcp', 'byan-mcp-server');
  if (!(await fs.pathExists(src))) return { copied: false };
  await fs.ensureDir(dst);
  await fs.copy(src, dst, { overwrite: true, filter: makeNodeModulesFilter(src) });
  const serverFile = path.join(dst, 'server.js');
  if (!(await fs.pathExists(serverFile))) {
    throw new Error(
      `MCP server copy produced no server.js at ${serverFile}. ` +
        `Template source: ${src}. Re-run install or copy manually.`
    );
  }
  return { copied: true, path: dst };
}

async function generateMcpConfig(projectRoot, options = {}) {
  const dstPath = path.join(projectRoot, '.mcp.json');

  // Read-merge-write through the single source of truth for the byan + inert
  // byan-channel entry shape: mcpConfig.mergeByanEntry (relative args, secret-free,
  // existing siblings + custom command + non-byan env preserved, channel added
  // inert). This is byte-coherent with installDirectMCP, which routes through the
  // same merge. Additional default MCP servers are registered via addMcpEntry
  // (mcp-extensions), not here -- so there is no .mcp.json template to drift out
  // of sync with the merge.
  let existing = {};
  if (await fs.pathExists(dstPath)) {
    try {
      existing = await fs.readJson(dstPath);
    } catch {
      existing = {};
    }
  }

  const merged = mcpConfig.mergeByanEntry(existing, { apiUrl: options.apiUrl });
  await fs.writeJson(dstPath, merged, { spaces: 2 });
  return { path: dstPath };
}

async function installMcpDependencies(mcpServerPath) {
  if (!mcpServerPath) return { installed: false, error: 'no path' };
  try {
    execSync('npm install --silent', {
      cwd: mcpServerPath,
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 120_000,
    });
    return { installed: true };
  } catch (err) {
    return { installed: false, error: err.message || String(err) };
  }
}

async function copyGitHooks(projectRoot) {
  // The BYAN Strict Mode pre-commit gate is the cross-platform final net
  // (Codex has no in-session hook). Install it whenever the project
  // is a git repo: copy .githooks/ and point core.hooksPath at it.
  const src = path.join(TEMPLATE_ROOT, '.githooks');
  const dst = path.join(projectRoot, '.githooks');
  if (!(await fs.pathExists(src))) return { copied: false, reason: 'no_template' };
  await fs.copy(src, dst, { overwrite: true });

  const preCommit = path.join(dst, 'pre-commit');
  if (await fs.pathExists(preCommit)) {
    try { await fs.chmod(preCommit, 0o755); } catch { /* non-fatal */ }
  }

  // Only wire core.hooksPath when this is actually a git repo.
  if (!(await fs.pathExists(path.join(projectRoot, '.git')))) {
    return { copied: true, hooksPath: false, reason: 'not_a_git_repo' };
  }
  try {
    execSync('git config core.hooksPath .githooks', {
      cwd: projectRoot,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    return { copied: true, hooksPath: true };
  } catch (err) {
    return { copied: true, hooksPath: false, error: err.message || String(err) };
  }
}

async function setupClaudeNative(projectRoot, options = {}) {
  const log = options.quiet ? () => {} : (...a) => console.log(...a);
  const results = {};

  results.hooks = await copyClaudeHooks(projectRoot);
  log(chalk.green(`  [OK] Claude Code hooks: ${results.hooks.copied} files`));

  results.skills = await copyClaudeSkills(projectRoot);
  log(chalk.green(`  [OK] Claude Code skills: ${results.skills.copied} skills`));

  results.settings = await copyClaudeSettings(projectRoot);
  log(
    results.settings.copied
      ? chalk.green(`  [OK] Claude Code settings.json (hooks wired)`)
      : chalk.yellow(`  [WARN] settings.json template absent`)
  );

  results.mcp = await copyMcpServer(projectRoot);
  log(
    results.mcp.copied
      ? chalk.green(`  [OK] MCP server copied to _byan/mcp/byan-mcp-server/`)
      : chalk.yellow(`  [WARN] MCP server template absent`)
  );

  results.mcpConfig = await generateMcpConfig(projectRoot, options);
  log(chalk.green(`  byan + inert byan-channel entries in .mcp.json (relative paths)`));

  // Whitelist the byan MCP server: a project .mcp.json entry is inert in Claude
  // Code until its id is listed in .claude/settings.local.json.
  results.whitelist = await whitelistMcpServer(projectRoot, 'byan');
  log(chalk.green(`  byan MCP server whitelisted (settings.local.json)`));

  results.gitHooks = await copyGitHooks(projectRoot);
  if (results.gitHooks.copied && results.gitHooks.hooksPath) {
    log(chalk.green(`  [OK] Strict pre-commit gate wired (.githooks + core.hooksPath)`));
  } else if (results.gitHooks.copied) {
    log(chalk.yellow(`  [WARN] .githooks copied but not wired (${results.gitHooks.reason || 'no git repo'}); run: git config core.hooksPath .githooks`));
  }

  if (results.mcp.copied && options.installDeps !== false) {
    results.mcpDeps = await installMcpDependencies(results.mcp.path);
    if (results.mcpDeps.installed) {
      log(chalk.green(`  [OK] MCP dependencies installed (npm install)`));
    } else {
      log(chalk.yellow(`  [WARN] MCP npm install failed: ${results.mcpDeps.error}`));
      log(chalk.yellow(`    -> Run manually: cd _byan/mcp/byan-mcp-server && npm install`));
    }
  }

  return results;
}

async function walkCount(dir, suffix) {
  let count = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) count += await walkCount(p, suffix);
    else if (e.name.endsWith(suffix)) count += 1;
  }
  return count;
}

module.exports = {
  copyClaudeHooks,
  copyClaudeSkills,
  copyClaudeSettings,
  copyMcpServer,
  copyGitHooks,
  makeNodeModulesFilter,
  generateMcpConfig,
  installMcpDependencies,
  setupClaudeNative,
};
