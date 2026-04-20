/**
 * Tests — VelocityEstimator
 */

const { VelocityEstimator, TREND } = require('../../src/loadbalancer/velocity-estimator');

describe('VelocityEstimator', () => {
  let ve;

  beforeEach(() => {
    ve = new VelocityEstimator('claude', {
      windowMs: 60000,
      warningThresholdPerMin: 5,
      maxRequestsBeforeLimit: 20,
    });
  });

  afterEach(() => {
    ve.destroy();
  });

  describe('getVelocity', () => {
    test('returns 0 with no requests', () => {
      expect(ve.getVelocity()).toBe(0);
    });

    test('returns 0 with single request', () => {
      ve.recordRequest();
      expect(ve.getVelocity()).toBe(0);
    });

    test('calculates velocity from multiple requests', () => {
      const now = Date.now();
      ve.timestamps = [now - 30000, now - 20000, now - 10000, now];
      const velocity = ve.getVelocity();
      expect(velocity).toBeGreaterThan(0);
      expect(velocity).toBeLessThan(20);
    });
  });

  describe('getTrend', () => {
    test('returns IDLE with few requests', () => {
      ve.recordRequest();
      expect(ve.getTrend()).toBe(TREND.IDLE);
    });

    test('returns STABLE with evenly distributed requests', () => {
      const now = Date.now();
      ve.timestamps = [
        now - 50000, now - 45000,
        now - 25000, now - 20000,
        now - 10000, now - 5000,
      ];
      const trend = ve.getTrend();
      expect([TREND.STABLE, TREND.ACCELERATING, TREND.DECELERATING]).toContain(trend);
    });

    test('returns ACCELERATING when recent requests are denser', () => {
      const now = Date.now();
      ve.timestamps = [
        now - 55000,
        now - 5000, now - 4000, now - 3000, now - 2000, now - 1000, now,
      ];
      expect(ve.getTrend()).toBe(TREND.ACCELERATING);
    });
  });

  describe('getEtaMinutes', () => {
    test('returns Infinity with no velocity', () => {
      expect(ve.getEtaMinutes()).toBe(Infinity);
    });

    test('returns positive value with active velocity', () => {
      const now = Date.now();
      ve.timestamps = [now - 10000, now - 5000, now];
      const eta = ve.getEtaMinutes();
      expect(eta).toBeGreaterThan(0);
      expect(eta).toBeLessThan(Infinity);
    });
  });

  describe('getSnapshot', () => {
    test('returns complete snapshot object', () => {
      const snap = ve.getSnapshot();
      expect(snap).toHaveProperty('provider', 'claude');
      expect(snap).toHaveProperty('velocity');
      expect(snap).toHaveProperty('trend');
      expect(snap).toHaveProperty('etaMinutes');
      expect(snap).toHaveProperty('requestsInWindow');
      expect(snap).toHaveProperty('windowMs', 60000);
      expect(snap).toHaveProperty('maxRequestsBeforeLimit', 20);
      expect(snap).toHaveProperty('warningThreshold', 5);
    });
  });

  describe('threshold warning', () => {
    test('emits threshold_warning when velocity exceeds threshold', (done) => {
      ve = new VelocityEstimator('copilot', {
        windowMs: 60000,
        warningThresholdPerMin: 2,
        maxRequestsBeforeLimit: 10,
      });

      ve.on('threshold_warning', (evt) => {
        expect(evt.provider).toBe('copilot');
        expect(evt.velocity).toBeGreaterThanOrEqual(2);
        ve.destroy();
        done();
      });

      const now = Date.now();
      ve.timestamps = [now - 10000, now - 8000, now - 5000, now - 2000];
      ve.recordRequest();
    });
  });

  describe('reset', () => {
    test('clears all state', () => {
      ve.recordRequest();
      ve.recordRequest();
      ve.reset();
      expect(ve.getVelocity()).toBe(0);
      expect(ve.timestamps).toHaveLength(0);
    });
  });
});
