/**
 * byan_web integration — thin wrapper over @byan/platform-config.
 *
 * Historical public surface preserved for external callers; new code
 * should import directly from @byan/platform-config.
 */
const path = require('path');
const chalk = require('chalk');
const {
  mcpConfig: { ensureMcpConfig: sharedEnsureMcpConfig },
  envConfig: { updateSettingsLocal: sharedUpdateSettingsLocal, updateDotenv: sharedUpdateDotenv },
  tokenPrompt: { promptForToken, ENV_KEYS },
  validate: { validateByanWebReachability },
} = require('@byan/platform-config');

// Shared primitives return { path: string } — unwrap to plain string for
// backwards compatibility with callers that expect a string path.
async function updateSettingsLocal(projectRoot, env) {
  const result = await sharedUpdateSettingsLocal(projectRoot, env);
  return result.path;
}

async function updateDotenv(projectRoot, env) {
  const result = await sharedUpdateDotenv(projectRoot, env);
  return result.path;
}

// Legacy positional signature adapter — delegates to shared options-bag.
async function ensureMcpConfig(projectRoot, apiUrl, token) {
  const result = await sharedEnsureMcpConfig(projectRoot, { apiUrl, token });
  return result.path;
}

async function setupByanWebIntegration(projectRoot, options = {}) {
  // Keep the exact same behavior as before — prompt, write 3 files, return object.
  // Implementation delegates to shared primitives.
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

  const env = { BYAN_API_TOKEN: inputs.token, BYAN_API_URL: inputs.apiUrl };
  const settingsPath = await updateSettingsLocal(projectRoot, env);
  const envPath = await updateDotenv(projectRoot, env);
  const mcpPath = await ensureMcpConfig(projectRoot, inputs.apiUrl, inputs.token);

  if (!options.quiet) {
    console.log(chalk.green(`  ✓ byan_web integration configured`));
    console.log(chalk.gray(`    - Token (Claude Code) → ${path.relative(projectRoot, settingsPath)}`));
    console.log(chalk.gray(`    - Token (Copilot CLI / shell) → ${path.relative(projectRoot, envPath)}`));
    console.log(chalk.gray(`    - MCP server registered in ${path.relative(projectRoot, mcpPath)}`));
  }

  return {
    configured: true,
    settingsPath,
    envPath,
    mcpPath,
    apiUrl: inputs.apiUrl,
    token: inputs.token,
  };
}

module.exports = {
  setupByanWebIntegration,
  ensureMcpConfig, // positional adapter
  updateSettingsLocal,
  updateDotenv,
  promptForToken,
  validateByanWebReachability,
  ENV_KEYS,
};
