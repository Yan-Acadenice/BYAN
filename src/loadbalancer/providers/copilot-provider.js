/**
 * CopilotProvider — Wraps @github/copilot-sdk
 *
 * Uses the Copilot SDK to create sessions and send prompts.
 * Extracts rate limit signals from HTTP headers and error events.
 */

const { BaseProvider } = require('./base-provider');

class CopilotProvider extends BaseProvider {
  constructor(providerConfig) {
    super('copilot', providerConfig);
    this.sdk = null;
    this.session = null;
  }

  async initialize() {
    try {
      const { createClient } = require('@github/copilot-sdk');
      this.sdk = createClient();
      this.initialized = true;
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        this.initialized = false;
        return;
      }
      throw err;
    }
  }

  async isAvailable() {
    if (!this.initialized || !this.sdk) return false;
    try {
      const token = process.env[this.config.auth_env || 'COPILOT_GITHUB_TOKEN'];
      return !!token;
    } catch {
      return false;
    }
  }

  async send(opts) {
    if (!this.initialized) throw new Error('CopilotProvider not initialized');

    const start = Date.now();
    const model = opts.model || this.config.models?.agent || 'gpt-4.1';

    try {
      const { createSession } = require('@github/copilot-sdk');
      const session = createSession({
        model,
        onPermissionRequest: () => ({ allow: true }),
      });

      const response = await session.sendAndWait({ prompt: opts.prompt });

      return {
        provider: this.name,
        content: response.content || response.data?.content || '',
        model,
        rateLimitHeaders: null,
        latencyMs: Date.now() - start,
        rateLimited: false,
      };
    } catch (err) {
      const is429 = err.status === 429 || err.statusCode === 429 ||
        (err.message && err.message.includes('rate limit'));

      if (is429) {
        const headers = err.headers || err.response?.headers || {};
        return {
          provider: this.name,
          content: null,
          model,
          rateLimitHeaders: {
            'x-ratelimit-remaining': headers['x-ratelimit-remaining'],
            'x-ratelimit-reset': headers['x-ratelimit-reset'],
            'retry-after': headers['retry-after'],
          },
          latencyMs: Date.now() - start,
          rateLimited: true,
        };
      }

      throw err;
    }
  }

  getCapabilities() {
    return {
      streaming: true,
      tools: true,
      multiTurn: true,
      maxContextTokens: 128000,
    };
  }

  async destroy() {
    this.sdk = null;
    this.session = null;
    await super.destroy();
  }
}

module.exports = { CopilotProvider };
