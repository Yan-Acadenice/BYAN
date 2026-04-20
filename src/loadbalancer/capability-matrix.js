/**
 * CapabilityMatrix — Provider Feature Parity Routing
 *
 * Maps which tools/capabilities each provider supports.
 * Routes capability-specific tasks to the right provider.
 * Degrades gracefully when target provider lacks a capability.
 */

const DEFAULT_CAPABILITIES = {
  claude: {
    file_edit: true,
    file_read: true,
    bash: true,
    web_search: false,
    mcp_tools: true,
    subagents: true,
    git: true,
    streaming: true,
    multi_turn: true,
    max_context_tokens: 200000,
    tool_use: true,
    image_input: true,
  },
  copilot: {
    file_edit: true,
    file_read: true,
    bash: true,
    web_search: true,
    mcp_tools: true,
    subagents: true,
    git: true,
    streaming: true,
    multi_turn: true,
    max_context_tokens: 128000,
    tool_use: true,
    image_input: true,
  },
  byan_api: {
    file_edit: false,
    file_read: false,
    bash: false,
    web_search: false,
    mcp_tools: false,
    subagents: false,
    git: false,
    streaming: false,
    multi_turn: true,
    max_context_tokens: 32000,
    tool_use: false,
    image_input: false,
  },
};

class CapabilityMatrix {
  /**
   * @param {object} [overrides] - Per-provider capability overrides
   */
  constructor(overrides = {}) {
    this.matrix = {};

    for (const [provider, caps] of Object.entries(DEFAULT_CAPABILITIES)) {
      this.matrix[provider] = { ...caps, ...(overrides[provider] || {}) };
    }

    for (const [provider, caps] of Object.entries(overrides)) {
      if (!this.matrix[provider]) {
        this.matrix[provider] = caps;
      }
    }
  }

  /**
   * Check if a provider supports a specific capability.
   * @param {string} provider
   * @param {string} capability
   * @returns {boolean}
   */
  supports(provider, capability) {
    return !!(this.matrix[provider]?.[capability]);
  }

  /**
   * Get all capabilities for a provider.
   * @param {string} provider
   * @returns {object|null}
   */
  getCapabilities(provider) {
    return this.matrix[provider] || null;
  }

  /**
   * Find providers that support a required capability.
   * @param {string} capability
   * @returns {string[]} Provider names that support it
   */
  findProviders(capability) {
    return Object.entries(this.matrix)
      .filter(([, caps]) => caps[capability])
      .map(([name]) => name);
  }

  /**
   * Find the best provider for a set of required capabilities.
   * @param {string[]} required - Required capability names
   * @param {string[]} preferOrder - Preferred provider order
   * @returns {{ provider: string|null, supported: string[], missing: string[] }}
   */
  findBestProvider(required, preferOrder = []) {
    let bestMatch = null;
    let bestScore = -1;

    const candidates = preferOrder.length > 0
      ? preferOrder
      : Object.keys(this.matrix);

    for (const provider of candidates) {
      const caps = this.matrix[provider];
      if (!caps) continue;

      const supported = required.filter(cap => caps[cap]);
      const score = supported.length;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          provider,
          supported,
          missing: required.filter(cap => !caps[cap]),
        };
      }

      if (score === required.length) break;
    }

    return bestMatch || { provider: null, supported: [], missing: required };
  }

  /**
   * Get a comparison table of all providers.
   * @returns {object} { capabilities: string[], providers: { name: { cap: bool } } }
   */
  compare() {
    const allCaps = new Set();
    for (const caps of Object.values(this.matrix)) {
      for (const key of Object.keys(caps)) {
        allCaps.add(key);
      }
    }

    return {
      capabilities: [...allCaps].sort(),
      providers: { ...this.matrix },
    };
  }
}

module.exports = { CapabilityMatrix, DEFAULT_CAPABILITIES };
