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
 *   - .mcp.json with the absolute path to the target project's MCP server
 *
 * Runs:
 *   - npm install inside the copied MCP server dir (with fallback warning)
 */

const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');
const chalk = require('chalk');

const TEMPLATE_ROOT = path.resolve(__dirname, '..', 'templates');

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
  const tmplPath = path.join(TEMPLATE_ROOT, '.mcp.json.tmpl');
  const dstPath = path.join(projectRoot, '.mcp.json');

  let template;
  if (await fs.pathExists(tmplPath)) {
    template = await fs.readFile(tmplPath, 'utf8');
  } else {
    template = JSON.stringify(
      {
        mcpServers: {
          byan: {
            command: 'node',
            args: ['{{PROJECT_ROOT}}/_byan/mcp/byan-mcp-server/server.js'],
            env: { BYAN_API_URL: options.apiUrl || 'http://localhost:3737' },
          },
        },
      },
      null,
      2
    );
  }

  const rendered = template.replace(/\{\{PROJECT_ROOT\}\}/g, projectRoot);

  let existing = {};
  if (await fs.pathExists(dstPath)) {
    try {
      existing = await fs.readJson(dstPath);
    } catch {
      existing = {};
    }
  }

  const merged = JSON.parse(rendered);
  merged.mcpServers = { ...(existing.mcpServers || {}), ...merged.mcpServers };

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

async function setupClaudeNative(projectRoot, options = {}) {
  const log = options.quiet ? () => {} : (...a) => console.log(...a);
  const results = {};

  results.hooks = await copyClaudeHooks(projectRoot);
  log(chalk.green(`  ✓ Claude Code hooks: ${results.hooks.copied} files`));

  results.skills = await copyClaudeSkills(projectRoot);
  log(chalk.green(`  ✓ Claude Code skills: ${results.skills.copied} skills`));

  results.settings = await copyClaudeSettings(projectRoot);
  log(
    results.settings.copied
      ? chalk.green(`  ✓ Claude Code settings.json (hooks wired)`)
      : chalk.yellow(`  ⚠ settings.json template absent`)
  );

  results.mcp = await copyMcpServer(projectRoot);
  log(
    results.mcp.copied
      ? chalk.green(`  ✓ MCP server copied to _byan/mcp/byan-mcp-server/`)
      : chalk.yellow(`  ⚠ MCP server template absent`)
  );

  results.mcpConfig = await generateMcpConfig(projectRoot, options);
  log(chalk.green(`  ✓ .mcp.json generated (absolute path)`));

  if (results.mcp.copied && options.installDeps !== false) {
    results.mcpDeps = await installMcpDependencies(results.mcp.path);
    if (results.mcpDeps.installed) {
      log(chalk.green(`  ✓ MCP dependencies installed (npm install)`));
    } else {
      log(chalk.yellow(`  ⚠ MCP npm install failed: ${results.mcpDeps.error}`));
      log(chalk.yellow(`    → Run manually: cd _byan/mcp/byan-mcp-server && npm install`));
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
  makeNodeModulesFilter,
  generateMcpConfig,
  installMcpDependencies,
  setupClaudeNative,
};
