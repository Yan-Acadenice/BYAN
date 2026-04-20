/**
 * Metrics Tests
 */

const { Metrics } = require('../../src/loadbalancer/metrics');

describe('Metrics', () => {
  let metrics;

  beforeEach(() => {
    metrics = new Metrics();
  });

  describe('recordRequest', () => {
    test('increments total and per-provider counters', () => {
      metrics.recordRequest('claude', 100);
      metrics.recordRequest('claude', 200);
      metrics.recordRequest('copilot', 150);

      const snap = metrics.getSnapshot();
      expect(snap.requests_total).toBe(3);
      expect(snap.provider_usage.claude.count).toBe(2);
      expect(snap.provider_usage.copilot.count).toBe(1);
    });

    test('computes usage percentages', () => {
      metrics.recordRequest('claude', 100);
      metrics.recordRequest('claude', 100);
      metrics.recordRequest('copilot', 100);

      const snap = metrics.getSnapshot();
      expect(snap.provider_usage.claude.percentage).toBe(67);
      expect(snap.provider_usage.copilot.percentage).toBe(33);
    });

    test('tracks latency stats', () => {
      metrics.recordRequest('claude', 50);
      metrics.recordRequest('claude', 150);
      metrics.recordRequest('claude', 100);

      const snap = metrics.getSnapshot();
      expect(snap.latency.claude.avg).toBe(100);
      expect(snap.latency.claude.min).toBe(50);
      expect(snap.latency.claude.max).toBe(150);
      expect(snap.latency.claude.count).toBe(3);
    });
  });

  describe('attachToLoadBalancer', () => {
    test('counts switchovers from events', () => {
      const { EventEmitter } = require('events');
      const lb = new EventEmitter();

      metrics.attachToLoadBalancer(lb);

      lb.emit('switch', { from: 'claude', to: 'copilot' });
      lb.emit('auto_failover', { from: 'copilot', to: 'claude' });

      const snap = metrics.getSnapshot();
      expect(snap.switchovers_total).toBe(2);
      expect(snap.auto_failovers_total).toBe(1);
    });

    test('counts rate limit hits', () => {
      const { EventEmitter } = require('events');
      const lb = new EventEmitter();

      metrics.attachToLoadBalancer(lb);

      lb.emit('rate_limit_change', { provider: 'claude', to: 'BLOCKED' });
      lb.emit('rate_limit_change', { provider: 'claude', to: 'THROTTLED' });
      lb.emit('rate_limit_change', { provider: 'claude', to: 'HEALTHY' });

      const snap = metrics.getSnapshot();
      expect(snap.rate_limit_hits.claude).toBe(2);
    });
  });

  describe('getSnapshot', () => {
    test('includes uptime', () => {
      const snap = metrics.getSnapshot();
      expect(snap.uptime_ms).toBeGreaterThanOrEqual(0);
    });

    test('includes queue metrics', () => {
      const snap = metrics.getSnapshot();
      expect(snap.queue).toBeDefined();
      expect(snap.queue.enqueued_total).toBe(0);
    });
  });

  describe('reset', () => {
    test('clears all counters', () => {
      metrics.recordRequest('claude', 100);
      metrics.reset();

      const snap = metrics.getSnapshot();
      expect(snap.requests_total).toBe(0);
      expect(Object.keys(snap.provider_usage)).toHaveLength(0);
    });
  });
});
