/**
 * migrate-mcp-config — self-healing migration for pre-fix BYAN installs.
 *
 * Injects BYAN_API_TOKEN into .mcp.json env block if absent, and strips the
 * legacy /api suffix from BYAN_API_URL. Uses byan-platform-config primitives
 * exclusively; no duplicated logic here.
 */

const chalk = require('chalk');
const ora = require('ora');
const {
  mcpConfig: { readMcpConfig, ensureMcpConfig },
  envConfig:  { readEnvToken },
  urlUtils:   { stripApiSuffix },
} = require('byan-platform-config');

/**
 * @param {string} projectRoot   — absolute path to the project root
 * @param {{ dryRun?: boolean, verbose?: boolean }} opts
 * @returns {Promise<{
 *   migrated: boolean,
 *   reason:   string,
 *   changes?: string[],
 *   hint?:    string,
 * }>}
 */
async function runMigration(projectRoot, { dryRun = false, verbose = false } = {}) {
  let spinner = null;

  function log(msg) {
    if (verbose) console.log(msg);
  }

  function startSpinner(text) {
    if (verbose) {
      spinner = ora(text).start();
    }
  }

  function stopSpinner(text, ok = true) {
    if (spinner) {
      if (ok) spinner.succeed(text);
      else     spinner.fail(text);
      spinner = null;
    } else {
      log(text);
    }
  }

  // 1. Read .mcp.json
  startSpinner('Lecture .mcp.json...');
  const config = await readMcpConfig(projectRoot);

  if (!config) {
    stopSpinner(chalk.gray('Aucun .mcp.json trouve'), true);
    return { migrated: false, reason: 'no-mcp-json' };
  }

  // 2. Check byan entry
  const byan = config.mcpServers && config.mcpServers.byan;
  if (!byan) {
    stopSpinner(chalk.gray('Pas d\'entree byan dans .mcp.json'), true);
    return { migrated: false, reason: 'no-byan-server' };
  }
  stopSpinner(chalk.gray('.mcp.json lu'), true);

  // 3. Diagnose
  const tokenMissing   = !byan.env || !byan.env.BYAN_API_TOKEN;
  const urlHasApiSuffix = /\/api\/?$/.test(byan.env && byan.env.BYAN_API_URL || '');

  // 4. Nothing to do?
  if (!tokenMissing && !urlHasApiSuffix) {
    log(chalk.green('  .mcp.json est deja a jour (token present, URL correcte)'));
    return { migrated: false, reason: 'already-ok' };
  }

  const changes = [];

  // 5. Resolve token
  let token = byan.env && byan.env.BYAN_API_TOKEN; // may already exist (url-only fix)
  if (tokenMissing) {
    startSpinner('Recherche BYAN_API_TOKEN (.env / settings.local.json)...');
    token = await readEnvToken(projectRoot);
    if (!token) {
      stopSpinner(chalk.yellow('Token introuvable'), false);
      return {
        migrated: false,
        reason:   'no-token-available',
        hint:     'Re-run npx create-byan-agent to prompt for a token',
      };
    }
    stopSpinner(chalk.green('Token trouve'), true);
    changes.push('BYAN_API_TOKEN injected into .mcp.json env');
  }

  // 6. Resolve URL
  const existingUrl = (byan.env && byan.env.BYAN_API_URL) || '';
  const cleanUrl    = stripApiSuffix(existingUrl);
  if (urlHasApiSuffix) {
    changes.push(`BYAN_API_URL stripped /api suffix (${existingUrl} -> ${cleanUrl})`);
    log(chalk.cyan(`  URL: ${existingUrl} -> ${cleanUrl}`));
  }

  // 7. Dry-run
  if (dryRun) {
    log(chalk.cyan('\n  [dry-run] Changements qui seraient appliques:'));
    changes.forEach((c) => log(chalk.cyan(`    - ${c}`)));
    return { migrated: false, reason: 'dry-run', changes };
  }

  // 8. Apply via ensureMcpConfig
  startSpinner('Application de la migration...');
  await ensureMcpConfig(projectRoot, { apiUrl: cleanUrl || existingUrl, token });
  stopSpinner(chalk.green('.mcp.json migre avec succes'), true);

  // 9. Return result
  return { migrated: true, reason: 'healed', changes };
}

module.exports = { runMigration };
