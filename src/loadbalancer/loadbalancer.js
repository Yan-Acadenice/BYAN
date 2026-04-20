/**
 * LoadBalancer Core — Failover Routing Engine
 *
 * Routes requests to the healthiest provider. Handles:
 *   - Sticky sessions (prefer same provider for ongoing conversation)
 *   - Auto-failover on rate limit (THROTTLED/BLOCKED triggers switch)
 *   - Manual provider switch with context transfer
 *   - Integration with RateLimitTracker + SharedStateStore + SessionBridge
 *
 * Sits ABOVE existing BYAN routers:
 *   LoadBalancer (picks PLATFORM) → ExecutionRouter (picks STRATEGY) → Dispatcher (picks MODEL)
 */

const { EventEmitter } = require('events');
const { RateLimitTracker, STATES } = require('./rate-limit-tracker');
const { getProviderOrder } = require('./config');

class LoadBalancer extends EventEmitter {
  /**
   * @param {object} opts
   * @param {object} opts.config - Loaded loadbalancer config
   * @param {object} opts.providers - { name: ProviderAdapter } map
   * @param {import('./state/db').SharedStateStore} [opts.store]
   * @param {import('./session-bridge').SessionBridge} [opts.bridge]
   */
  constructor(opts) {
    super();
    this.config = opts.config;
    this.providers = opts.providers || {};
    this.store = opts.store || null;
    this.bridge = opts.bridge || null;

    this.trackers = {};
    this.activeProvider = this.config.primary;
    this.sessions = new Map();

    this._initTrackers();
  }

  _initTrackers() {
    const rlConfig = this.config.rate_limits || {};

    for (const name of Object.keys(this.providers)) {
      const tracker = new RateLimitTracker(name, rlConfig);

      tracker.on('state_change', (event) => {
        this.emit('rate_limit_change', event);

        if (this.store) {
          this.store.logRateLimit({
            provider: event.provider,
            eventType: '429',
            stateBefore: event.from,
            stateAfter: event.to,
            meta: { reason: event.reason },
          });
        }

        if (
          this.config.sessions?.auto_switch_on_rate_limit &&
          event.provider === this.activeProvider &&
          (event.to === STATES.BLOCKED || event.to === STATES.THROTTLED)
        ) {
          this._autoFailover(event);
        }
      });

      this.trackers[name] = tracker;
    }
  }

  /**
   * Get overall loadbalancer status.
   */
  getStatus() {
    const providerStates = {};
    for (const [name, tracker] of Object.entries(this.trackers)) {
      providerStates[name] = tracker.getState();
    }

    return {
      activeProvider: this.activeProvider,
      primary: this.config.primary,
      fallbackOrder: this.config.fallback_order,
      providers: providerStates,
      activeSessions: this.sessions.size,
    };
  }

  /**
   * Get detailed rate limit info for all providers.
   */
  getRateLimitDetails() {
    const details = {};
    for (const [name, tracker] of Object.entries(this.trackers)) {
      details[name] = tracker.getState();
    }
    return details;
  }

  /**
   * Get switchover history from store.
   */
  getSwitchoverHistory(limit = 20) {
    if (!this.store) return { events: [], total: 0 };
    const events = this.store.getSwitchoverHistory(limit);
    return { events, total: events.length };
  }

  /**
   * Route a request to the best available provider.
   * @param {object} opts
   * @param {string} opts.prompt
   * @param {string} [opts.sessionId]
   * @param {string} [opts.preferProvider] - 'auto', 'claude', 'copilot'
   * @returns {Promise<object>} Provider response
   */
  async send(opts) {
    const provider = this._selectProvider(opts);
    const tracker = this.trackers[provider.name];

    if (!tracker?.canAcceptRequest()) {
      const fallback = this._findHealthyFallback(provider.name);
      if (!fallback) {
        return {
          provider: null,
          content: null,
          error: 'All providers rate-limited. Please wait.',
          rateLimited: true,
        };
      }
      return this._sendToProvider(fallback, opts, tracker);
    }

    return this._sendToProvider(provider, opts, tracker);
  }

  async _sendToProvider(provider, opts) {
    const tracker = this.trackers[provider.name];
    const start = Date.now();

    try {
      const result = await provider.send(opts);
      const latencyMs = Date.now() - start;

      if (result.rateLimited) {
        tracker.record429(result.rateLimitHeaders || {});

        if (result.rateLimitHeaders) {
          tracker.recordHeaders(result.rateLimitHeaders);
        }

        const fallback = this._findHealthyFallback(provider.name);
        if (fallback) {
          this.emit('failover', {
            from: provider.name,
            to: fallback.name,
            reason: 'rate_limited',
          });
          return this._sendToProvider(fallback, opts);
        }

        return result;
      }

      tracker.recordSuccess();

      if (this.store) {
        this.store.recordRequest(provider.name, latencyMs);
      }

      if (opts.sessionId) {
        this.sessions.set(opts.sessionId, {
          provider: provider.name,
          lastUsed: Date.now(),
        });
      }

      return result;
    } catch (err) {
      const is429 = err.status === 429 || err.statusCode === 429;
      if (is429) {
        tracker.record429({ source: 'send_error' });
        const fallback = this._findHealthyFallback(provider.name);
        if (fallback) {
          return this._sendToProvider(fallback, opts);
        }
      }
      throw err;
    }
  }

  /**
   * Force switch to a specific provider.
   */
  async switchProvider(opts) {
    const prev = this.activeProvider;
    const target = opts.target;

    let injectionPrompt = null;
    let contextTransferred = false;

    if (this.bridge && opts.sessionId) {
      const sourceProvider = this.providers[prev];
      if (sourceProvider) {
        const transfer = await this.bridge.transfer(
          sourceProvider, target, opts.sessionId, opts.reason || 'manual_switch'
        );
        injectionPrompt = transfer.injectionPrompt;
        contextTransferred = true;
      }
    }

    this.activeProvider = target;

    this.emit('switch', {
      from: prev,
      to: target,
      reason: opts.reason || 'manual_switch',
      contextTransferred,
    });

    return {
      switched: true,
      from: prev,
      to: target,
      reason: opts.reason,
      contextTransferred,
      injectionPrompt,
    };
  }

  /**
   * Get session context in portable format.
   */
  async getSessionContext(sessionId) {
    if (!this.bridge || !sessionId) {
      return {
        sessionId: sessionId || 'none',
        provider: this.activeProvider,
        context: null,
      };
    }

    const provider = this.providers[this.activeProvider];
    const context = await this.bridge.extract(provider, sessionId);
    return { sessionId, provider: this.activeProvider, context };
  }

  _selectProvider(opts) {
    if (opts.preferProvider && opts.preferProvider !== 'auto') {
      const preferred = this.providers[opts.preferProvider];
      if (preferred && this.trackers[opts.preferProvider]?.canAcceptRequest()) {
        return preferred;
      }
    }

    if (opts.sessionId) {
      const sticky = this.sessions.get(opts.sessionId);
      if (sticky) {
        const stickyTimeout = this.config.sessions?.sticky_timeout_ms || 300000;
        if (Date.now() - sticky.lastUsed < stickyTimeout) {
          const provider = this.providers[sticky.provider];
          if (provider && this.trackers[sticky.provider]?.canAcceptRequest()) {
            return provider;
          }
        }
      }
    }

    const active = this.providers[this.activeProvider];
    if (active && this.trackers[this.activeProvider]?.canAcceptRequest()) {
      return active;
    }

    const fallback = this._findHealthyFallback(this.activeProvider);
    return fallback || this.providers[this.activeProvider];
  }

  _findHealthyFallback(excludeProvider) {
    const order = getProviderOrder(this.config);

    for (const name of order) {
      if (name === excludeProvider) continue;
      const tracker = this.trackers[name];
      if (tracker?.canAcceptRequest() && this.providers[name]) {
        return this.providers[name];
      }
    }
    return null;
  }

  _autoFailover(event) {
    const fallback = this._findHealthyFallback(event.provider);
    if (!fallback) return;

    const prev = this.activeProvider;
    this.activeProvider = fallback.name;

    this.emit('auto_failover', {
      from: prev,
      to: fallback.name,
      reason: `${event.provider} ${event.to}: ${event.reason}`,
      trigger: 'rate_limit',
    });
  }

  /**
   * Get tracker for a provider (for hooks integration).
   */
  getTracker(providerName) {
    return this.trackers[providerName];
  }

  destroy() {
    for (const tracker of Object.values(this.trackers)) {
      tracker.destroy();
    }
    this.sessions.clear();
    this.removeAllListeners();
  }
}

module.exports = { LoadBalancer };
