/**
 * ClaudeProvider — Wraps @anthropic-ai/claude-agent-sdk
 *
 * Uses Claude Agent SDK to query and resume sessions.
 * Catches RateLimitError for circuit breaker integration.
 */

const { BaseProvider } = require('./base-provider');

class ClaudeProvider extends BaseProvider {
  constructor(providerConfig) {
    super('claude', providerConfig);
    this.sdk = null;
  }

  async initialize() {
    try {
      this.sdk = require('@anthropic-ai/claude-code');
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
      const token = process.env[this.config.auth_env || 'ANTHROPIC_API_KEY'];
      return !!token;
    } catch {
      return false;
    }
  }

  async send(opts) {
    if (!this.initialized) throw new Error('ClaudeProvider not initialized');

    const start = Date.now();
    const model = opts.model || this.config.models?.agent || 'claude-sonnet-4-20250514';

    try {
      const messages = [];
      const result = this.sdk.query({
        prompt: opts.prompt,
        options: {
          model,
          maxTurns: 1,
          ...(opts.sessionId ? { continue: opts.sessionId } : {}),
        },
      });

      for await (const event of result) {
        if (event.type === 'assistant' && event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === 'text') {
              messages.push(block.text);
            }
          }
        }
      }

      return {
        provider: this.name,
        content: messages.join('\n'),
        model,
        rateLimitHeaders: null,
        latencyMs: Date.now() - start,
        rateLimited: false,
      };
    } catch (err) {
      const isRateLimit =
        err.name === 'RateLimitError' ||
        err.status === 429 ||
        (err.message && err.message.includes('rate_limit'));

      if (isRateLimit) {
        const retryAfter = err.headers?.['retry-after'] || err.retryAfter;
        return {
          provider: this.name,
          content: null,
          model,
          rateLimitHeaders: {
            'retry-after': retryAfter ? String(retryAfter) : undefined,
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
      maxContextTokens: 200000,
    };
  }

  async destroy() {
    this.sdk = null;
    await super.destroy();
  }
}

module.exports = { ClaudeProvider };
