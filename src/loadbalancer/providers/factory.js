/**
 * Provider factory — build the { name: ProviderInstance } registry from config.
 *
 * The one place that knows which provider class backs each config name. The
 * LoadBalancer engine and the MCP shell both consume this instead of hand-wiring
 * instances, so adding a pool (codex) is one line here, not N call sites.
 */

const { ClaudeProvider } = require('./claude-provider');
const { CopilotProvider } = require('./copilot-provider');
const { CodexProvider } = require('./codex-provider');
const { ByanApiProvider } = require('./byan-api-provider');

const PROVIDER_CLASSES = Object.freeze({
  claude: ClaudeProvider,
  copilot: CopilotProvider,
  codex: CodexProvider,
  byan_api: ByanApiProvider,
});

// buildProviders(config) -> { name: instance } for every ENABLED provider whose
// name is known. Unknown names are skipped (never fatal) so a typo in config
// degrades to "that pool is absent", not a crash.
function buildProviders(config) {
  const out = {};
  const providers = (config && config.providers) || {};
  for (const [name, section] of Object.entries(providers)) {
    if (section && section.enabled === false) continue;
    const Cls = PROVIDER_CLASSES[name];
    if (!Cls) continue;
    out[name] = new Cls(section || {});
  }
  return out;
}

module.exports = { buildProviders, PROVIDER_CLASSES };
