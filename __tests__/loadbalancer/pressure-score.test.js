/**
 * Tests — PressureScore
 */

const {
  calculatePressure,
  formatPressureSummary,
  STATE_SCORES,
  DEFAULT_WEIGHTS,
} = require('../../src/loadbalancer/pressure-score');

describe('PressureScore', () => {
  const healthyTracker = {
    state: 'HEALTHY',
    count429InWindow: 0,
    totalRequests: 10,
    total429s: 0,
    windowMs: 60000,
  };

  const idleVelocity = {
    velocity: 0,
    trend: 'idle',
    etaMinutes: Infinity,
    warningThreshold: 10,
    requestsInWindow: 0,
  };

  describe('calculatePressure', () => {
    test('returns 0 for healthy provider with no activity', () => {
      const result = calculatePressure(healthyTracker, idleVelocity);
      expect(result.score).toBe(0);
      expect(result.recommendation).toBe('ok');
    });

    test('returns moderate score when throttled', () => {
      const tracker = {
        ...healthyTracker,
        state: 'THROTTLED',
        count429InWindow: 2,
        total429s: 2,
        totalRequests: 20,
      };
      const velocity = { ...idleVelocity, velocity: 5 };
      const result = calculatePressure(tracker, velocity);
      expect(result.score).toBeGreaterThanOrEqual(20);
      expect(result.score).toBeLessThan(80);
    });

    test('returns high score when blocked', () => {
      const tracker = {
        state: 'BLOCKED',
        count429InWindow: 3,
        totalRequests: 10,
        total429s: 5,
        windowMs: 60000,
      };
      const velocity = { ...idleVelocity, velocity: 12, warningThreshold: 10 };
      const result = calculatePressure(tracker, velocity);
      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.recommendation).not.toBe('ok');
    });

    test('returns 100 for worst-case scenario', () => {
      const tracker = {
        state: 'BLOCKED',
        count429InWindow: 10,
        totalRequests: 10,
        total429s: 10,
        windowMs: 60000,
      };
      const velocity = { ...idleVelocity, velocity: 20, warningThreshold: 10 };
      const result = calculatePressure(tracker, velocity);
      expect(result.score).toBe(100);
      expect(result.recommendation).toBe('switch_now');
    });

    test('components sum to score correctly', () => {
      const tracker = {
        state: 'THROTTLED',
        count429InWindow: 1,
        totalRequests: 20,
        total429s: 3,
        windowMs: 60000,
      };
      const velocity = { ...idleVelocity, velocity: 6, warningThreshold: 10 };
      const result = calculatePressure(tracker, velocity);

      expect(result.components).toHaveProperty('ratio429');
      expect(result.components).toHaveProperty('proximity');
      expect(result.components).toHaveProperty('velocity');
      expect(result.components).toHaveProperty('statePenalty');

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    test('recommendation thresholds: ok < 50, caution 50-79, switch_now >= 80', () => {
      const okResult = calculatePressure(healthyTracker, idleVelocity);
      expect(okResult.recommendation).toBe('ok');

      const highTracker = {
        state: 'BLOCKED',
        count429InWindow: 5,
        totalRequests: 5,
        total429s: 5,
        windowMs: 60000,
      };
      const highVelocity = { ...idleVelocity, velocity: 15, warningThreshold: 10 };
      const switchResult = calculatePressure(highTracker, highVelocity);
      expect(switchResult.recommendation).toBe('switch_now');
    });
  });

  describe('formatPressureSummary', () => {
    test('produces readable multiline output', () => {
      const pressure = {
        score: 42,
        recommendation: 'ok',
        components: { ratio429: 10, proximity: 33, velocity: 50, statePenalty: 0 },
      };
      const velocity = { velocity: 3.5, trend: 'stable', etaMinutes: 5.2 };
      const summary = formatPressureSummary('claude', pressure, velocity);

      expect(summary).toContain('claude: 42/100 [OK]');
      expect(summary).toContain('3.5 req/min');
      expect(summary).toContain('stable');
      expect(summary).toContain('~5.2 min');
    });

    test('shows "no limit in sight" for Infinity ETA', () => {
      const pressure = { score: 0, recommendation: 'ok', components: { ratio429: 0, proximity: 0, velocity: 0, statePenalty: 0 } };
      const velocity = { velocity: 0, trend: 'idle', etaMinutes: Infinity };
      const summary = formatPressureSummary('copilot', pressure, velocity);
      expect(summary).toContain('no limit in sight');
    });
  });

  describe('STATE_SCORES', () => {
    test('maps all states', () => {
      expect(STATE_SCORES.HEALTHY).toBe(0);
      expect(STATE_SCORES.THROTTLED).toBe(50);
      expect(STATE_SCORES.RECOVERING).toBe(70);
      expect(STATE_SCORES.BLOCKED).toBe(100);
    });
  });

  describe('DEFAULT_WEIGHTS', () => {
    test('sum to 1.0', () => {
      const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0);
    });
  });
});
