/**
 * migrate-mcp-config — self-healing migration for pre-fix BYAN installs.
 *
 * Heals three drift cases on .mcp.json:
 *   1. token missing       → injects ${BYAN_API_TOKEN} placeholder
 *   2. url has /api suffix → strips it
 *   3. token in clear      → extracts to .env and replaces with placeholder
 *                            (security fix from BYAN >=2.16.0)
 *
 * Uses byan-platform-config primitives exclusively; no duplicated logic here.
 */

const chalk = require('chalk');
const ora = require('ora');
const {
  mcpConfig: { readMcpConfig, ensureMcpConfig, TOKEN_PLACEHOLDER },
  envConfig:  { readEnvToken, updateDotenv },
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
  const currentToken      = (byan.env && byan.env.BYAN_API_TOKEN) || '';
  const tokenIsPlaceholder = currentToken === TOKEN_PLACEHOLDER;
  const tokenInClear      = !!currentToken && !tokenIsPlaceholder;
  const tokenIsLegacy     = !!currentToken; // any non-empty value is legacy: token must not live in .mcp.json
  const urlHasApiSuffix   = /\/api\/?$/.test(byan.env && byan.env.BYAN_API_URL || '');

  // 4. Nothing to do?
  if (!tokenIsLegacy && !urlHasApiSuffix) {
    log(chalk.green('  .mcp.json est deja a jour (token absent du fichier, URL correcte)'));
    return { migrated: false, reason: 'already-ok' };
  }

  const changes = [];
  let extractedClearToken = null;

  // 5. Detect a clear-text token to relocate to .env
  if (tokenInClear) {
    extractedClearToken = currentToken;
    changes.push('BYAN_API_TOKEN extracted from .mcp.json (clear) into .env, removed from .mcp.json');
  } else if (tokenIsPlaceholder) {
    changes.push('BYAN_API_TOKEN placeholder removed from .mcp.json (token now resolved via settings.local.json env)');
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

  // 8. Apply
  startSpinner('Application de la migration...');
  if (extractedClearToken) {
    const existingDotenvToken = await readEnvToken(projectRoot);
    if (!existingDotenvToken || existingDotenvToken !== extractedClearToken) {
      await updateDotenv(projectRoot, { BYAN_API_TOKEN: extractedClearToken });
    }
  }
  // ensureMcpConfig always strips BYAN_API_TOKEN from .mcp.json (security)
  await ensureMcpConfig(projectRoot, { apiUrl: cleanUrl || existingUrl });
  stopSpinner(chalk.green('.mcp.json migre avec succes'), true);

  // 9. Return result
  return { migrated: true, reason: 'healed', changes };
}

module.exports = { runMigration };
