/**
 * ByanApiProvider — Third Provider via BYAN API
 *
 * When BYAN_API_TOKEN is set, registers as a third provider.
 * Uses existing BYAN API (port 3737) with BSP tree + context resolver.
 * Lightweight fallback when both Copilot and Claude are rate-limited.
 */

const { BaseProvider } = require('./base-provider');

class ByanApiProvider extends BaseProvider {
  constructor(providerConfig) {
    super('byan_api', providerConfig);
    this.baseUrl = providerConfig.url || 'http://localhost:3737';
    this.token = null;
  }

  async initialize() {
    this.token = process.env[this.config.auth_env || 'BYAN_API_TOKEN'];
    this.initialized = !!this.token;
  }

  async isAvailable() {
    if (!this.token) return false;

    try {
      const http = require('http');
      return new Promise((resolve) => {
        const url = new URL('/api/health', this.baseUrl);
        const req = http.get(url, { timeout: 3000 }, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
      });
    } catch {
      return false;
    }
  }

  async send(opts) {
    if (!this.initialized) throw new Error('ByanApiProvider not initialized');

    const start = Date.now();
    const http = require('http');

    const body = JSON.stringify({
      prompt: opts.prompt,
      session_id: opts.sessionId,
      model: opts.model,
    });

    return new Promise((resolve, reject) => {
      const url = new URL('/api/agent/execute', this.baseUrl);
      const req = http.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 30000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          const latencyMs = Date.now() - start;

          if (res.statusCode === 429) {
            const retryAfter = res.headers['retry-after'];
            resolve({
              provider: this.name,
              content: null,
              model: 'byan-api',
              rateLimitHeaders: { 'retry-after': retryAfter },
              latencyMs,
              rateLimited: true,
            });
            return;
          }

          if (res.statusCode >= 400) {
            reject(new Error(`BYAN API error ${res.statusCode}: ${data}`));
            return;
          }

          try {
            const parsed = JSON.parse(data);
            resolve({
              provider: this.name,
              content: parsed.response || parsed.content || data,
              model: parsed.model || 'byan-api',
              rateLimitHeaders: null,
              latencyMs,
              rateLimited: false,
            });
          } catch {
            resolve({
              provider: this.name,
              content: data,
              model: 'byan-api',
              rateLimitHeaders: null,
              latencyMs,
              rateLimited: false,
            });
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('BYAN API timeout')); });
      req.write(body);
      req.end();
    });
  }

  getCapabilities() {
    return {
      streaming: false,
      tools: false,
      multiTurn: true,
      maxContextTokens: 32000,
    };
  }

  async destroy() {
    this.token = null;
    await super.destroy();
  }
}

module.exports = { ByanApiProvider };
