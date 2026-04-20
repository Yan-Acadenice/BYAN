/**
 * BaseProvider — Abstract Provider Interface
 *
 * All providers (Copilot, Claude, BYAN API) extend this class.
 * Defines the contract for the LoadBalancer to interact with any provider.
 */

class BaseProvider {
  /**
   * @param {string} name - Provider identifier (e.g., 'copilot', 'claude')
   * @param {object} providerConfig - Provider section from loadbalancer config
   */
  constructor(name, providerConfig) {
    if (new.target === BaseProvider) {
      throw new Error('BaseProvider is abstract — use CopilotProvider or ClaudeProvider');
    }
    this.name = name;
    this.config = providerConfig;
    this.initialized = false;
  }

  /**
   * Initialize the provider (SDK auth, session setup, etc.)
   */
  async initialize() {
    throw new Error(`${this.name}: initialize() not implemented`);
  }

  /**
   * Send a prompt and get a response.
   * @param {object} opts
   * @param {string} opts.prompt - The user prompt
   * @param {string} [opts.model] - Model override
   * @param {string} [opts.sessionId] - Session ID for continuity
   * @returns {Promise<ProviderResponse>}
   */
  async send(opts) {
    throw new Error(`${this.name}: send() not implemented`);
  }

  /**
   * Check if provider is available (auth valid, SDK loaded).
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    throw new Error(`${this.name}: isAvailable() not implemented`);
  }

  /**
   * Get provider capabilities.
   * @returns {object} - { streaming, tools, multiTurn, maxContextTokens }
   */
  getCapabilities() {
    return {
      streaming: false,
      tools: false,
      multiTurn: false,
      maxContextTokens: 0,
    };
  }

  /**
   * Clean up resources.
   */
  async destroy() {
    this.initialized = false;
  }
}

/**
 * @typedef {object} ProviderResponse
 * @property {string} provider - Provider name
 * @property {string} content - Response text
 * @property {string} model - Model used
 * @property {object} [rateLimitHeaders] - Raw rate limit headers if available
 * @property {number} latencyMs - Round-trip time in ms
 * @property {boolean} rateLimited - Whether a 429 was encountered
 */

module.exports = { BaseProvider };
