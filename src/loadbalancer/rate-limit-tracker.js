/**
 * RateLimitTracker — CircuitBreaker State Machine
 *
 * Per-provider rate limit tracking with circuit breaker pattern.
 *
 * States:
 *   HEALTHY     → Normal operation, all requests pass through
 *   THROTTLED   → Approaching limit, requests allowed but monitored
 *   BLOCKED     → Circuit open, no requests pass. Waiting for recovery.
 *   RECOVERING  → Half-open, limited probe requests to test recovery
 *
 * Transitions:
 *   HEALTHY     → THROTTLED    (429 count >= throttle_threshold in window)
 *   THROTTLED   → BLOCKED      (429 count >= block_threshold in window)
 *   BLOCKED     → RECOVERING   (recovery_probe_interval elapsed)
 *   RECOVERING  → HEALTHY      (probe succeeded, no 429 in half_open_max_requests)
 *   RECOVERING  → BLOCKED      (probe failed, got another 429)
 *   THROTTLED   → HEALTHY      (window elapsed with no new 429s)
 *   any         → HEALTHY      (manual reset)
 */

const { EventEmitter } = require('events');

const STATES = {
  HEALTHY: 'HEALTHY',
  THROTTLED: 'THROTTLED',
  BLOCKED: 'BLOCKED',
  RECOVERING: 'RECOVERING',
};

class RateLimitTracker extends EventEmitter {
  /**
   * @param {string} providerName
   * @param {object} opts - from config.rate_limits
   */
  constructor(providerName, opts = {}) {
    super();
    this.provider = providerName;
    this.state = STATES.HEALTHY;

    this.windowMs = opts.window_ms || 60000;
    this.throttleThreshold = opts.throttle_threshold || 2;
    this.blockThreshold = opts.block_threshold || 3;
    this.recoveryProbeMs = opts.recovery_probe_interval_ms || 10000;
    this.halfOpenMax = opts.half_open_max_requests || 2;

    this.events429 = [];
    this.lastStateChange = Date.now();
    this.recoveryTimer = null;
    this.halfOpenRequests = 0;
    this.halfOpenSuccesses = 0;
    this.totalRequests = 0;
    this.total429s = 0;
  }

  getState() {
    return {
      provider: this.provider,
      state: this.state,
      count429InWindow: this._countInWindow(),
      windowMs: this.windowMs,
      lastStateChange: this.lastStateChange,
      totalRequests: this.totalRequests,
      total429s: this.total429s,
      canAcceptRequest: this.canAcceptRequest(),
    };
  }

  canAcceptRequest() {
    switch (this.state) {
      case STATES.HEALTHY:
      case STATES.THROTTLED:
        return true;
      case STATES.RECOVERING:
        return this.halfOpenRequests < this.halfOpenMax;
      case STATES.BLOCKED:
        return false;
      default:
        return false;
    }
  }

  /**
   * Record a successful request (no rate limit error).
   */
  recordSuccess() {
    this.totalRequests++;

    if (this.state === STATES.RECOVERING) {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.halfOpenMax) {
        this._transition(STATES.HEALTHY, 'Recovery probes all succeeded');
      }
      return;
    }

    if (this.state === STATES.THROTTLED) {
      this._pruneWindow();
      if (this._countInWindow() === 0) {
        this._transition(STATES.HEALTHY, 'Window cleared, no recent 429s');
      }
    }
  }

  /**
   * Record a 429 rate limit error.
   * @param {object} [meta] - Optional metadata (headers, retry-after, etc.)
   */
  record429(meta = {}) {
    this.totalRequests++;
    this.total429s++;

    const now = Date.now();
    this.events429.push({ timestamp: now, meta });
    this._pruneWindow();

    const count = this._countInWindow();

    if (this.state === STATES.RECOVERING) {
      this._transition(STATES.BLOCKED, `429 during recovery (count: ${count})`);
      this._scheduleRecovery();
      return;
    }

    if (count >= this.blockThreshold) {
      this._transition(STATES.BLOCKED, `429 count ${count} >= block threshold ${this.blockThreshold}`);
      this._scheduleRecovery();
    } else if (count >= this.throttleThreshold && this.state === STATES.HEALTHY) {
      this._transition(STATES.THROTTLED, `429 count ${count} >= throttle threshold ${this.throttleThreshold}`);
    }
  }

  /**
   * Record a response with rate limit headers (preemptive detection).
   * @param {object} headers - { 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after' }
   */
  recordHeaders(headers = {}) {
    const remaining = parseInt(headers['x-ratelimit-remaining'], 10);
    const retryAfter = parseInt(headers['retry-after'], 10);

    if (retryAfter > 0) {
      this.record429({ retryAfter, source: 'header' });
      return;
    }

    if (!isNaN(remaining) && remaining <= 2 && this.state === STATES.HEALTHY) {
      this._transition(STATES.THROTTLED, `Preemptive: x-ratelimit-remaining=${remaining}`);
    }
  }

  /**
   * Force reset to HEALTHY state.
   */
  reset() {
    this._clearRecoveryTimer();
    this.events429 = [];
    this.halfOpenRequests = 0;
    this.halfOpenSuccesses = 0;
    this._transition(STATES.HEALTHY, 'Manual reset');
  }

  destroy() {
    this._clearRecoveryTimer();
    this.removeAllListeners();
  }

  _transition(newState, reason) {
    const prev = this.state;
    if (prev === newState) return;

    this.state = newState;
    this.lastStateChange = Date.now();

    if (newState === STATES.RECOVERING) {
      this.halfOpenRequests = 0;
      this.halfOpenSuccesses = 0;
    }

    this.emit('state_change', {
      provider: this.provider,
      from: prev,
      to: newState,
      reason,
      timestamp: this.lastStateChange,
    });
  }

  _scheduleRecovery() {
    this._clearRecoveryTimer();
    this.recoveryTimer = setTimeout(() => {
      if (this.state === STATES.BLOCKED) {
        this._transition(STATES.RECOVERING, `Recovery probe after ${this.recoveryProbeMs}ms`);
      }
    }, this.recoveryProbeMs);
    if (this.recoveryTimer.unref) this.recoveryTimer.unref();
  }

  _clearRecoveryTimer() {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }

  _pruneWindow() {
    const cutoff = Date.now() - this.windowMs;
    this.events429 = this.events429.filter(e => e.timestamp > cutoff);
  }

  _countInWindow() {
    this._pruneWindow();
    return this.events429.length;
  }
}

module.exports = { RateLimitTracker, STATES };
