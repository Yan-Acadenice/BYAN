/**
 * byan_web integration — thin wrapper over byan-platform-config.
 *
 * Historical public surface preserved for external callers; new code
 * should import directly from byan-platform-config.
 */
const path = require('path');
const chalk = require('chalk');
const {
  mcpConfig: { ensureMcpConfig: sharedEnsureMcpConfig },
  envConfig: { updateSettingsLocal: sharedUpdateSettingsLocal, updateDotenv: sharedUpdateDotenv },
  tokenPrompt: { promptForToken, ENV_KEYS },
  validate: { validateByanWebReachability },
  credentials: { writeCredentials: sharedWriteCredentials },
  urlUtils: { stripApiSuffix },
} = require('byan-platform-config');

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
  // Global per-user credentials file: the source the MCP server resolves at
  // boot (env -> ~/.byan/credentials.json -> localhost). This is what makes the
  // MCP portable across shells/OSes and Claude Code AND Codex, instead of
  // relying on .mcp.json ${} expansion or settings.local.json env injection.
  const credsResult = await sharedWriteCredentials({ BYAN_API_URL: stripApiSuffix(inputs.apiUrl), BYAN_API_TOKEN: inputs.token });

  if (!options.quiet) {
    console.log(chalk.green(`  ✓ byan_web integration configured`));
    console.log(chalk.gray(`    - Token (Claude Code) → ${path.relative(projectRoot, settingsPath)}`));
    console.log(chalk.gray(`    - Token (shell / env) → ${path.relative(projectRoot, envPath)}`));
    console.log(chalk.gray(`    - MCP server registered in ${path.relative(projectRoot, mcpPath)}`));
    console.log(chalk.gray(`    - MCP credentials (all shells/OS) → ${credsResult.path}`));
  }

  return {
    configured: true,
    settingsPath,
    envPath,
    mcpPath,
    credentialsPath: credsResult.path,
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
