/**
 * Metrics — LoadBalancer Observability
 *
 * Collects and exposes metrics for the loadbalancer:
 *   - Provider usage percentages
 *   - Switchover count and history
 *   - Average latency per provider
 *   - Rate limit hit totals
 *   - Queue depth (graceful degradation)
 *
 * Integrates with LoadBalancer events. Queryable via lb_status MCP tool.
 */

class Metrics {
  constructor() {
    this.counters = {
      requests_total: 0,
      requests_by_provider: {},
      switchovers_total: 0,
      auto_failovers_total: 0,
      rate_limit_hits: {},
      queue_enqueued_total: 0,
      queue_processed_total: 0,
      queue_dropped_total: 0,
    };

    this.latency = {};
    this.startedAt = Date.now();
  }

  /**
   * Attach event listeners to a LoadBalancer instance.
   * @param {import('./loadbalancer').LoadBalancer} lb
   */
  attachToLoadBalancer(lb) {
    lb.on('rate_limit_change', (event) => {
      if (event.to === 'BLOCKED' || event.to === 'THROTTLED') {
        this._incrementCounter('rate_limit_hits', event.provider);
      }
    });

    lb.on('switch', (event) => {
      this.counters.switchovers_total++;
    });

    lb.on('auto_failover', (event) => {
      this.counters.auto_failovers_total++;
      this.counters.switchovers_total++;
    });
  }

  /**
   * Attach event listeners to a GracefulDegradation instance.
   * @param {import('./graceful-degradation').GracefulDegradation} gd
   */
  attachToGracefulDegradation(gd) {
    gd.on('enqueued', () => { this.counters.queue_enqueued_total++; });
    gd.on('processed', () => { this.counters.queue_processed_total++; });
  }

  /**
   * Record a provider request with latency.
   * @param {string} provider
   * @param {number} latencyMs
   */
  recordRequest(provider, latencyMs) {
    this.counters.requests_total++;
    this._incrementCounter('requests_by_provider', provider);

    if (!this.latency[provider]) {
      this.latency[provider] = { total: 0, count: 0, min: Infinity, max: 0 };
    }

    const l = this.latency[provider];
    l.total += latencyMs;
    l.count++;
    l.min = Math.min(l.min, latencyMs);
    l.max = Math.max(l.max, latencyMs);
  }

  /**
   * Get all metrics as a snapshot.
   */
  getSnapshot() {
    const uptimeMs = Date.now() - this.startedAt;

    const providerUsage = {};
    const total = this.counters.requests_total || 1;
    for (const [provider, count] of Object.entries(this.counters.requests_by_provider)) {
      providerUsage[provider] = {
        count,
        percentage: Math.round((count / total) * 100),
      };
    }

    const latencyStats = {};
    for (const [provider, l] of Object.entries(this.latency)) {
      latencyStats[provider] = {
        avg: l.count > 0 ? Math.round(l.total / l.count) : 0,
        min: l.min === Infinity ? 0 : l.min,
        max: l.max,
        count: l.count,
      };
    }

    return {
      uptime_ms: uptimeMs,
      requests_total: this.counters.requests_total,
      provider_usage: providerUsage,
      latency: latencyStats,
      switchovers_total: this.counters.switchovers_total,
      auto_failovers_total: this.counters.auto_failovers_total,
      rate_limit_hits: { ...this.counters.rate_limit_hits },
      queue: {
        enqueued_total: this.counters.queue_enqueued_total,
        processed_total: this.counters.queue_processed_total,
        dropped_total: this.counters.queue_dropped_total,
      },
    };
  }

  /**
   * Reset all metrics.
   */
  reset() {
    this.counters = {
      requests_total: 0,
      requests_by_provider: {},
      switchovers_total: 0,
      auto_failovers_total: 0,
      rate_limit_hits: {},
      queue_enqueued_total: 0,
      queue_processed_total: 0,
      queue_dropped_total: 0,
    };
    this.latency = {};
    this.startedAt = Date.now();
  }

  _incrementCounter(counterName, key) {
    if (!this.counters[counterName]) this.counters[counterName] = {};
    this.counters[counterName][key] = (this.counters[counterName][key] || 0) + 1;
  }
}

module.exports = { Metrics };
