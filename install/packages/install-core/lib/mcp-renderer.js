/**
 * mcp-renderer — validate-or-die adapter over byan-platform-config mcpConfig.
 *
 * platform-config's ensureMcpConfig/mergeByanEntry accept ANY string as apiUrl
 * and never throw (they delegate URL validation to the caller, per their module
 * header). install-core must NOT silently write a malformed .mcp.json, so this
 * adapter validates the URL FIRST and throws McpUrlError before any delegation.
 * Only after a clean validation does it hand off to mcpConfig, which remains the
 * single source of truth for the byan entry shape, token-stripping, and the
 * READ-MERGE-WRITE behavior.
 */

const { mcpConfig, urlUtils } = require('byan-platform-config');

class McpUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'McpUrlError';
  }
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Validates and normalizes an apiUrl for .mcp.json.
 *
 * Strips a trailing /api(/vN) so server.js does not double the prefix, then
 * parses with the WHATWG URL constructor and rejects anything that is not a
 * parseable http(s) URL. Returns the clean URL string; throws McpUrlError
 * otherwise. WHY: this is the gap platform-config intentionally leaves to the
 * caller — without it, a typo becomes a broken, committed config file.
 *
 * @param {string} apiUrl
 * @returns {string} clean, suffix-stripped, validated url
 */
function validateApiUrl(apiUrl) {
  if (typeof apiUrl !== 'string' || apiUrl.trim().length === 0) {
    throw new McpUrlError('apiUrl must be a non-empty string');
  }
  const clean = urlUtils.stripApiSuffix(apiUrl.trim());

  let parsed;
  try {
    parsed = new URL(clean);
  } catch {
    throw new McpUrlError(`apiUrl is not a parseable URL: ${apiUrl}`);
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new McpUrlError(
      `apiUrl protocol must be http or https, got "${parsed.protocol}"`
    );
  }
  return clean;
}

/**
 * Renders .mcp.json: validate-or-die, then delegate to mcpConfig.ensureMcpConfig.
 *
 * @param {string} cwd — project root
 * @param {{ apiUrl: string }} opts
 * @returns {Promise<{ path: string }>}
 */
async function renderMcp(cwd, { apiUrl } = {}) {
  const clean = validateApiUrl(apiUrl);
  // token deliberately NOT passed — mcpConfig strips it anyway, and the token
  // belongs in .env / settings.local.json (handled by env-writer).
  return mcpConfig.ensureMcpConfig(cwd, { apiUrl: clean });
}

/**
 * Returns the merged config object for plan-time inspection WITHOUT writing.
 * Validates the url too so a preview cannot hide a broken config. No disk I/O.
 *
 * @param {string} cwd — unused (kept for symmetry with renderMcp signature)
 * @param {{ apiUrl: string }} opts
 * @returns {object} merged config (mcpConfig.mergeByanEntry output)
 */
function previewMcp(cwd, { apiUrl } = {}) {
  const clean = validateApiUrl(apiUrl);
  return mcpConfig.mergeByanEntry({}, { apiUrl: clean });
}

module.exports = {
  renderMcp,
  previewMcp,
  validateApiUrl,
  McpUrlError,
};
