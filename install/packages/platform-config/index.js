/**
 * byan-platform-config — shared platform config primitives.
 *
 * Single source of truth for .mcp.json management, .env/settings.local.json
 * manipulation, token prompting, byan_web reachability validation, and URL
 * normalization. Consumed by both install/ (create-byan-agent) and
 * update-byan-agent/ so the two CLIs do not drift.
 */

module.exports = {
  mcpConfig: require('./lib/mcp-config'),
  envConfig: require('./lib/env-config'),
  tokenPrompt: require('./lib/token-prompt'),
  validate: require('./lib/validate'),
  urlUtils: require('./lib/url-utils'),
};
