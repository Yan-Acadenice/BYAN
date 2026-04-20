/**
 * HealthProbe — Proactive Provider Availability Monitoring
 *
 * Periodically pings each provider with a cheap request to detect:
 *   - Complete unavailability (no response / error)
 *   - Silent degradation (response time > threshold)
 *   - Pre-throttle signals (rate limit headers on probe)
 *
 * Updates RateLimitTracker proactively before user hits a wall.
 */

const { EventEmitter } = require('events');

class HealthProbe extends EventEmitter {
  /**
   * @param {object} opts
   * @param {object} opts.providers - { name: ProviderAdapter } map
   * @param {object} opts.trackers - { name: RateLimitTracker } map
   * @param {object} [opts.config] - health_probe section from loadbalancer config
   */
  constructor(opts) {
    super();
    this.providers = opts.providers;
    this.trackers = opts.trackers || {};
    this.config = opts.config || {};

    this.intervalMs = this.config.interval_ms || 30000;
    this.timeoutMs = this.config.timeout_ms || 5000;
    this.enabled = this.config.enabled !== false;

    this.timer = null;
    this.probeResults = {};
    this.running = false;
  }

  /**
   * Start periodic health probing.
   */
  start() {
    if (!this.enabled || this.running) return;
    this.running = true;

    this._probeAll();

    this.timer = setInterval(() => this._probeAll(), this.intervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  /**
   * Stop health probing.
   */
  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Get latest probe results for all providers.
   */
  getResults() {
    return { ...this.probeResults };
  }

  /**
   * Run a single probe against one provider.
   * @param {string} name - Provider name
   * @returns {Promise<object>} Probe result
   */
  async probeOne(name) {
    const provider = this.providers[name];
    if (!provider) {
      return { provider: name, available: false, error: 'Provider not found' };
    }

    const start = Date.now();

    try {
      const available = await Promise.race([
        provider.isAvailable(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Probe timeout')), this.timeoutMs)
        ),
      ]);

      const latencyMs = Date.now() - start;

      const result = {
        provider: name,
        available: !!available,
        latencyMs,
        degraded: latencyMs > this.timeoutMs * 0.8,
        probedAt: new Date().toISOString(),
      };

      this.probeResults[name] = result;

      if (result.degraded && this.trackers[name]) {
        this.trackers[name].recordHeaders({ 'x-ratelimit-remaining': '5' });
        this.emit('degradation', { provider: name, latencyMs });
      }

      if (!result.available && this.trackers[name]) {
        this.trackers[name].record429({ source: 'health_probe', reason: 'unavailable' });
        this.emit('unavailable', { provider: name });
      }

      return result;
    } catch (err) {
      const latencyMs = Date.now() - start;
      const result = {
        provider: name,
        available: false,
        latencyMs,
        degraded: true,
        error: err.message,
        probedAt: new Date().toISOString(),
      };

      this.probeResults[name] = result;

      if (this.trackers[name]) {
        this.trackers[name].record429({ source: 'health_probe', reason: err.message });
      }

      this.emit('probe_error', { provider: name, error: err.message });
      return result;
    }
  }

  async _probeAll() {
    const names = Object.keys(this.providers);
    const results = await Promise.allSettled(
      names.map(name => this.probeOne(name))
    );

    this.emit('probe_cycle', {
      results: results.map(r => r.value || r.reason),
      timestamp: new Date().toISOString(),
    });
  }

  destroy() {
    this.stop();
    this.removeAllListeners();
  }
}

module.exports = { HealthProbe };
