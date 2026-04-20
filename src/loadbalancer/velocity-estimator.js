/**
 * VelocityEstimator — Sliding Window Request Rate
 *
 * Tracks request timestamps in a sliding window to calculate:
 *   - Current velocity (requests/minute)
 *   - Trend (accelerating / stable / decelerating)
 *   - ETA to a configurable threshold (minutes until likely rate limit)
 *
 * Emits 'threshold_warning' when velocity exceeds configured threshold.
 */

const { EventEmitter } = require('events');

const TREND = {
  ACCELERATING: 'accelerating',
  STABLE: 'stable',
  DECELERATING: 'decelerating',
  IDLE: 'idle',
};

class VelocityEstimator extends EventEmitter {
  /**
   * @param {string} provider
   * @param {object} opts
   * @param {number} [opts.windowMs=120000] - Sliding window for velocity calc (default 2min)
   * @param {number} [opts.warningThresholdPerMin=10] - Emit warning above this req/min
   * @param {number} [opts.maxRequestsBeforeLimit=30] - Estimated provider limit per window for ETA
   * @param {number} [opts.trendSplitRatio=0.5] - Split point for trend calc (first half vs second half)
   */
  constructor(provider, opts = {}) {
    super();
    this.provider = provider;
    this.windowMs = opts.windowMs || 120000;
    this.warningThreshold = opts.warningThresholdPerMin || 10;
    this.maxRequestsBeforeLimit = opts.maxRequestsBeforeLimit || 30;
    this.trendSplitRatio = opts.trendSplitRatio || 0.5;

    this.timestamps = [];
    this.warningEmitted = false;
  }

  recordRequest() {
    const now = Date.now();
    this.timestamps.push(now);
    this._prune(now);

    const velocity = this.getVelocity();
    if (velocity >= this.warningThreshold && !this.warningEmitted) {
      this.warningEmitted = true;
      this.emit('threshold_warning', {
        provider: this.provider,
        velocity,
        threshold: this.warningThreshold,
      });
    } else if (velocity < this.warningThreshold * 0.8) {
      this.warningEmitted = false;
    }
  }

  /**
   * Current requests per minute in the sliding window.
   */
  getVelocity() {
    const now = Date.now();
    this._prune(now);
    if (this.timestamps.length < 2) return 0;

    const windowSpanMs = now - this.timestamps[0];
    if (windowSpanMs < 1000) return 0; // min 1s span to avoid burst spikes

    return (this.timestamps.length / windowSpanMs) * 60000;
  }

  /**
   * Compare first-half velocity vs second-half velocity.
   */
  getTrend() {
    const now = Date.now();
    this._prune(now);
    if (this.timestamps.length < 4) return TREND.IDLE;

    const splitTime = now - (this.windowMs * this.trendSplitRatio);
    const firstHalf = this.timestamps.filter(t => t < splitTime);
    const secondHalf = this.timestamps.filter(t => t >= splitTime);

    if (firstHalf.length === 0 || secondHalf.length === 0) return TREND.STABLE;

    const firstSpan = splitTime - (now - this.windowMs);
    const secondSpan = now - splitTime;

    const firstRate = firstSpan > 0 ? (firstHalf.length / firstSpan) * 60000 : 0;
    const secondRate = secondSpan > 0 ? (secondHalf.length / secondSpan) * 60000 : 0;

    const ratio = firstRate > 0 ? secondRate / firstRate : 1;

    if (ratio > 1.25) return TREND.ACCELERATING;
    if (ratio < 0.75) return TREND.DECELERATING;
    return TREND.STABLE;
  }

  /**
   * Estimated minutes until rate limit at current velocity.
   * Returns Infinity if velocity is 0 or negligible.
   */
  getEtaMinutes() {
    const velocity = this.getVelocity();
    if (velocity < 0.1) return Infinity;

    const remaining = Math.max(0, this.maxRequestsBeforeLimit - this.timestamps.length);
    return remaining / velocity;
  }

  /**
   * Full snapshot for consumption by PressureScore / lb_quota.
   */
  getSnapshot() {
    return {
      provider: this.provider,
      velocity: Math.round(this.getVelocity() * 100) / 100,
      trend: this.getTrend(),
      etaMinutes: Math.round(this.getEtaMinutes() * 10) / 10,
      requestsInWindow: this.timestamps.length,
      windowMs: this.windowMs,
      maxRequestsBeforeLimit: this.maxRequestsBeforeLimit,
      warningThreshold: this.warningThreshold,
    };
  }

  reset() {
    this.timestamps = [];
    this.warningEmitted = false;
  }

  destroy() {
    this.reset();
    this.removeAllListeners();
  }

  _prune(now) {
    const cutoff = now - this.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0] < cutoff) {
      this.timestamps.shift();
    }
  }
}

module.exports = { VelocityEstimator, TREND };
