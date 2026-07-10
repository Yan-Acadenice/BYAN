/**
 * Leantime board integration — opt-in installer block.
 *
 * Mirror of byan-web-integration.js, for the OPTIONAL self-hosted Leantime
 * board that the FD -> board sync hook drives. Leantime is per-instance : the
 * URL + API key are the user's own, never shared. When the user declines, this
 * is a no-op that writes nothing.
 *
 * Persistence (same channels as byan_web, both gitignored) :
 *   - .claude/settings.local.json env  -> Claude Code injects into the MCP server
 *   - .env                             -> shell tools / Codex CLI
 *   - .mcp.json byan entry             -> ${LEANTIME_*} REFERENCES only (never the
 *                                         secret value); see mcp-config.ensureLeantimeRefs
 *
 * The token NEVER lands in a tracked file : settings.local.json and .env are
 * gitignored, and .mcp.json carries only the `${...}` expansion placeholders.
 */
const path = require('path');
const chalk = require('chalk');
const {
  mcpConfig: { ensureLeantimeRefs },
  envConfig: { updateSettingsLocal: sharedUpdateSettingsLocal, updateDotenv: sharedUpdateDotenv },
  tokenPrompt: { promptForLeantime },
  validate: { validateLeantimeReachability },
} = require('byan-platform-config');

// Shared writers return { path } — unwrap to a plain string path for the
// console report, matching byan-web-integration's surface.
async function updateSettingsLocal(projectRoot, env) {
  const result = await sharedUpdateSettingsLocal(projectRoot, env);
  return result.path;
}

async function updateDotenv(projectRoot, env) {
  const result = await sharedUpdateDotenv(projectRoot, env);
  return result.path;
}

/**
 * Prompt for (or accept preset) Leantime config and persist it.
 *
 * @param {string} projectRoot
 * @param {{ skipPrompts?: boolean, presetInputs?: object, quiet?: boolean }} options
 *   skipPrompts + presetInputs drive the non-interactive path (tests / CI),
 *   exactly like setupStagingConsent / setupByanWebIntegration.
 * @returns {Promise<{ configured: boolean, settingsPath?: string, envPath?: string, mcpPath?: string, apiUrl?: string, token?: string, assignUserId?: string }>}
 */
async function setupLeantimeIntegration(projectRoot, options = {}) {
  const skip = options.skipPrompts === true;
  const inputs = skip
    ? options.presetInputs || { configured: false }
    : await promptForLeantime();

  if (!inputs.configured) {
    if (!options.quiet) {
      console.log(
        chalk.gray(
          '  [INFO] Leantime board sync skipped. Re-run installer or edit .env / .claude/settings.local.json to enable later.'
        )
      );
    }
    return { configured: false };
  }

  // Only non-empty vars are written : an absent assign-id must not leave a
  // dangling LEANTIME_ASSIGN_USER_ID= line.
  const env = {
    LEANTIME_API_URL: inputs.apiUrl,
    LEANTIME_API_TOKEN: inputs.token,
  };
  if (inputs.assignUserId) {
    env.LEANTIME_ASSIGN_USER_ID = String(inputs.assignUserId);
  }

  const settingsPath = await updateSettingsLocal(projectRoot, env);
  const envPath = await updateDotenv(projectRoot, env);
  const mcpResult = await ensureLeantimeRefs(projectRoot);
  const mcpPath = mcpResult.path;

  if (!options.quiet) {
    console.log(chalk.green('  [OK] Leantime board sync configured'));
    console.log(chalk.gray(`    - Token (Claude Code) -> ${path.relative(projectRoot, settingsPath)}`));
    console.log(chalk.gray(`    - Token (shell / env) -> ${path.relative(projectRoot, envPath)}`));
    console.log(chalk.gray(`    - Refs (\${LEANTIME_*}) -> ${path.relative(projectRoot, mcpPath)}`));
  }

  return {
    configured: true,
    settingsPath,
    envPath,
    mcpPath,
    apiUrl: inputs.apiUrl,
    token: inputs.token,
    assignUserId: inputs.assignUserId,
  };
}

module.exports = {
  setupLeantimeIntegration,
  updateSettingsLocal,
  updateDotenv,
  promptForLeantime,
  validateLeantimeReachability,
};
