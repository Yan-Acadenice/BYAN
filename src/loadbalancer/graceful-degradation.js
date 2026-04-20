/**
 * GracefulDegradation — Queue + Backoff When All Providers Rate-Limited
 *
 * When no provider can accept requests:
 *   1. Queue pending tasks by priority (P1 > P2 > P3)
 *   2. Exponential backoff (1s, 2s, 4s, 8s... cap 60s)
 *   3. Notify user with estimated wait time
 *   4. Auto-resume when any provider recovers
 *
 * Integrates with LoadBalancer via event listeners.
 */

const { EventEmitter } = require('events');

const PRIORITY = { P1: 1, P2: 2, P3: 3, DEFAULT: 2 };
const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60000;

class GracefulDegradation extends EventEmitter {
  /**
   * @param {object} opts
   * @param {import('./loadbalancer').LoadBalancer} opts.lb
   */
  constructor(opts = {}) {
    super();
    this.lb = opts.lb;
    this.queue = [];
    this.backoffMs = MIN_BACKOFF_MS;
    this.retryTimer = null;
    this.processing = false;
    this.totalQueued = 0;
    this.totalProcessed = 0;
    this.totalDropped = 0;

    if (this.lb) {
      this.lb.on('auto_failover', () => this._onProviderRecovery());
      this.lb.on('rate_limit_change', (event) => {
        if (event.to === 'HEALTHY' || event.to === 'RECOVERING') {
          this._onProviderRecovery();
        }
      });
    }
  }

  /**
   * Enqueue a request when all providers are down.
   * @param {object} request - { prompt, sessionId, preferProvider, priority }
   * @returns {{ queued: true, position: number, estimatedWaitMs: number }}
   */
  enqueue(request) {
    const priority = PRIORITY[request.priority] || PRIORITY.DEFAULT;

    const entry = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      request,
      priority,
      enqueuedAt: Date.now(),
      resolve: null,
      reject: null,
    };

    const promise = new Promise((resolve, reject) => {
      entry.resolve = resolve;
      entry.reject = reject;
    });

    this.queue.push(entry);
    this.queue.sort((a, b) => a.priority - b.priority || a.enqueuedAt - b.enqueuedAt);
    this.totalQueued++;

    const position = this.queue.indexOf(entry) + 1;
    const estimatedWaitMs = this.backoffMs * position;

    this.emit('enqueued', {
      id: entry.id,
      position,
      estimatedWaitMs,
      queueSize: this.queue.length,
    });

    this._scheduleRetry();

    entry.promise = promise;
    return { queued: true, position, estimatedWaitMs, id: entry.id, promise };
  }

  /**
   * Get queue status.
   */
  getStatus() {
    return {
      queueSize: this.queue.length,
      backoffMs: this.backoffMs,
      processing: this.processing,
      totalQueued: this.totalQueued,
      totalProcessed: this.totalProcessed,
      totalDropped: this.totalDropped,
      items: this.queue.map((e, i) => ({
        id: e.id,
        position: i + 1,
        priority: e.priority,
        waitingMs: Date.now() - e.enqueuedAt,
      })),
    };
  }

  /**
   * Drop a queued item by ID.
   */
  drop(id) {
    const idx = this.queue.findIndex(e => e.id === id);
    if (idx === -1) return false;

    const entry = this.queue.splice(idx, 1)[0];
    entry.reject(new Error('Request dropped from queue'));
    this.totalDropped++;
    return true;
  }

  /**
   * Drop all queued items.
   */
  dropAll() {
    for (const entry of this.queue) {
      entry.reject(new Error('Queue flushed'));
    }
    this.totalDropped += this.queue.length;
    this.queue = [];
  }

  _scheduleRetry() {
    if (this.retryTimer || this.processing) return;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this._processQueue();
    }, this.backoffMs);

    if (this.retryTimer.unref) this.retryTimer.unref();
  }

  async _processQueue() {
    if (this.queue.length === 0 || this.processing) return;

    this.processing = true;

    const entry = this.queue[0];

    try {
      const result = await this.lb.send(entry.request);

      if (result.rateLimited && result.error) {
        this._increaseBackoff();
        this.emit('retry_failed', {
          id: entry.id,
          backoffMs: this.backoffMs,
          queueSize: this.queue.length,
        });
        this._scheduleRetry();
      } else {
        this.queue.shift();
        entry.resolve(result);
        this.totalProcessed++;
        this.backoffMs = MIN_BACKOFF_MS;

        this.emit('processed', {
          id: entry.id,
          provider: result.provider,
          queueRemaining: this.queue.length,
        });

        if (this.queue.length > 0) {
          this._scheduleRetry();
        }
      }
    } catch (err) {
      this._increaseBackoff();
      this._scheduleRetry();
    }

    this.processing = false;
  }

  _onProviderRecovery() {
    this.backoffMs = MIN_BACKOFF_MS;

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.queue.length > 0) {
      this.emit('recovery_detected', { queueSize: this.queue.length });
      this._processQueue();
    }
  }

  _increaseBackoff() {
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
  }

  destroy() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.dropAll();
    this.removeAllListeners();
  }
}

module.exports = { GracefulDegradation, PRIORITY };
