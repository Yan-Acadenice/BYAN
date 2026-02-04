/**
 * Metrics Collector for BYAN v2.0
 * Collects and manages system metrics (counters, gauges, timings)
 * 
 * @module observability/metrics/metrics-collector
 * @version 2.0.0-HYPER-MVP
 */

/**
 * Metrics Collector - Records and tracks system metrics
 * 
 * @class MetricsCollector
 * @example
 * const metrics = new MetricsCollector();
 * metrics.increment('api.calls', { endpoint: '/chat' });
 * metrics.recordDuration('request.duration', 150);
 */
class MetricsCollector {
  constructor() {
    this.metrics = new Map();
  }

  /**
   * Record a metric with a specific value
   * 
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   * @param {Object} [tags={}] - Optional tags for filtering
   * @returns {void}
   * 
   * @example
   * metrics.recordMetric('memory.usage', 1024, { unit: 'MB', service: 'api' });
   */
  recordMetric(name, value, tags = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('Metric name must be a non-empty string');
    }

    if (typeof value !== 'number') {
      throw new Error('Metric value must be a number');
    }

    if (isNaN(value)) {
      throw new Error('Metric value cannot be NaN');
    }

    const key = this._generateKey(name, tags);
    
    this.metrics.set(key, {
      name,
      value,
      tags: { ...tags },
      timestamp: new Date().toISOString(),
      type: 'gauge',
    });
  }

  /**
   * Increment a counter metric
   * 
   * @param {string} name - Metric name
   * @param {Object} [tags={}] - Optional tags
   * @param {number} [delta=1] - Increment amount
   * @returns {void}
   * 
   * @example
   * metrics.increment('api.calls', { endpoint: '/chat' });
   * metrics.increment('cache.hits', {}, 5); // Increment by 5
   */
  increment(name, tags = {}, delta = 1) {
    if (!name || typeof name !== 'string') {
      throw new Error('Metric name must be a non-empty string');
    }

    if (typeof delta !== 'number') {
      throw new Error('Delta must be a number');
    }

    const key = this._generateKey(name, tags);
    const existing = this.metrics.get(key);

    if (existing) {
      this.metrics.set(key, {
        ...existing,
        value: existing.value + delta,
        timestamp: new Date().toISOString(),
      });
    } else {
      this.metrics.set(key, {
        name,
        value: delta,
        tags: { ...tags },
        timestamp: new Date().toISOString(),
        type: 'counter',
      });
    }
  }

  /**
   * Decrement a counter metric
   * 
   * @param {string} name - Metric name
   * @param {Object} [tags={}] - Optional tags
   * @param {number} [delta=1] - Decrement amount
   * @returns {void}
   * 
   * @example
   * metrics.decrement('active.connections', { server: 'main' });
   */
  decrement(name, tags = {}, delta = 1) {
    this.increment(name, tags, -delta);
  }

  /**
   * Record a duration/timing metric
   * 
   * @param {string} name - Metric name
   * @param {number} durationMs - Duration in milliseconds
   * @param {Object} [tags={}] - Optional tags
   * @returns {void}
   * 
   * @example
   * metrics.recordDuration('request.duration', 150, { status: '200' });
   */
  recordDuration(name, durationMs, tags = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('Metric name must be a non-empty string');
    }

    if (typeof durationMs !== 'number') {
      throw new Error('Duration must be a number');
    }

    if (durationMs < 0) {
      throw new Error('Duration cannot be negative');
    }

    const key = this._generateKey(name, tags);
    
    this.metrics.set(key, {
      name,
      value: durationMs,
      tags: { ...tags },
      timestamp: new Date().toISOString(),
      type: 'timing',
    });
  }

  /**
   * Generate unique key for metric with tags
   * 
   * @private
   * @param {string} name - Metric name
   * @param {Object} tags - Tags
   * @returns {string} Unique key
   */
  _generateKey(name, tags) {
    if (Object.keys(tags).length === 0) {
      return name;
    }

    const sortedTags = Object.keys(tags)
      .sort()
      .map((key) => `${key}:${tags[key]}`)
      .join(',');

    return `${name}[${sortedTags}]`;
  }

  /**
   * Get all metrics
   * 
   * @returns {Object} All metrics as key-value pairs
   * 
   * @example
   * const allMetrics = metrics.getMetrics();
   * Object.entries(allMetrics).forEach(([key, metric]) => {
   *   console.log(`${key}: ${metric.value}`);
   * });
   */
  getMetrics() {
    const result = {};
    
    for (const [key, value] of this.metrics.entries()) {
      result[key] = { ...value };
    }

    return result;
  }

  /**
   * Get a specific metric
   * 
   * @param {string} name - Metric name
   * @param {Object} [tags={}] - Optional tags
   * @returns {Object|null} Metric or null if not found
   * 
   * @example
   * const apiCalls = metrics.getMetric('api.calls', { endpoint: '/chat' });
   * console.log(`API calls: ${apiCalls.value}`);
   */
  getMetric(name, tags = {}) {
    const key = this._generateKey(name, tags);
    const metric = this.metrics.get(key);
    
    return metric ? { ...metric } : null;
  }

  /**
   * Get metrics filtered by name prefix
   * 
   * @param {string} prefix - Name prefix
   * @returns {Object} Filtered metrics
   * 
   * @example
   * const apiMetrics = metrics.getMetricsByPrefix('api.');
   * // Returns all metrics starting with 'api.'
   */
  getMetricsByPrefix(prefix) {
    const result = {};

    for (const [key, value] of this.metrics.entries()) {
      if (value.name.startsWith(prefix)) {
        result[key] = { ...value };
      }
    }

    return result;
  }

  /**
   * Get metrics filtered by type
   * 
   * @param {string} type - Metric type (gauge, counter, timing)
   * @returns {Object} Filtered metrics
   * 
   * @example
   * const counters = metrics.getMetricsByType('counter');
   */
  getMetricsByType(type) {
    const result = {};

    for (const [key, value] of this.metrics.entries()) {
      if (value.type === type) {
        result[key] = { ...value };
      }
    }

    return result;
  }

  /**
   * Clear all metrics
   * 
   * @returns {void}
   * 
   * @example
   * metrics.clear(); // Remove all metrics
   */
  clear() {
    this.metrics.clear();
  }

  /**
   * Get metrics count
   * 
   * @returns {number} Number of metrics
   */
  count() {
    return this.metrics.size;
  }

  /**
   * Reset a specific metric to zero
   * 
   * @param {string} name - Metric name
   * @param {Object} [tags={}] - Optional tags
   * @returns {boolean} True if metric was reset, false if not found
   * 
   * @example
   * metrics.resetMetric('api.calls', { endpoint: '/chat' });
   */
  resetMetric(name, tags = {}) {
    const key = this._generateKey(name, tags);
    const existing = this.metrics.get(key);

    if (existing) {
      this.metrics.set(key, {
        ...existing,
        value: 0,
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    return false;
  }

  /**
   * Get summary statistics
   * 
   * @returns {Object} Summary stats
   * 
   * @example
   * const stats = metrics.getStats();
   * // { total: 10, byType: { counter: 5, gauge: 3, timing: 2 } }
   */
  getStats() {
    const byType = {};
    
    for (const metric of this.metrics.values()) {
      if (!byType[metric.type]) {
        byType[metric.type] = 0;
      }
      byType[metric.type]++;
    }

    return {
      total: this.metrics.size,
      byType,
    };
  }
}

module.exports = { MetricsCollector };
