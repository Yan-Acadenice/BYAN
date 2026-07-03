const {
  SubscriptionWindow,
  computeWindowState,
  windowRecommendation,
  FIVE_HOURS_MS,
  WEEK_MS,
} = require('../../src/loadbalancer/subscription-window');

// The subscription-window tracker answers a DIFFERENT question than pressure-score:
// not "am I getting 429'd right now" (API burst) but "how much of my rolling 5h /
// weekly subscription budget have I burned" (pool depletion). It is the signal the
// degradation ladder reads to switch BEFORE the wall. `now` is injected so the
// rolling windows are deterministic in tests (no Date.now flakiness).

const T0 = 1_000_000_000_000; // fixed epoch for tests

describe('loadbalancer/subscription-window', () => {
  describe('constants', () => {
    test('5h and week windows are correct milliseconds', () => {
      expect(FIVE_HOURS_MS).toBe(5 * 60 * 60 * 1000);
      expect(WEEK_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  describe('computeWindowState (pure)', () => {
    const events = [
      { timestamp: T0 - 6 * 60 * 60 * 1000, tokens: 5000 }, // 6h ago -> outside 5h, inside week
      { timestamp: T0 - 2 * 60 * 60 * 1000, tokens: 3000 }, // 2h ago -> inside both
      { timestamp: T0 - 10 * 60 * 1000, tokens: 1000 }, // 10min ago -> inside both
    ];

    test('sums only the tokens inside the rolling 5h window', () => {
      const s = computeWindowState(events, { now: T0 });
      expect(s.windowTokens).toBe(4000); // 3000 + 1000, the 6h-old one excluded
    });

    test('sums the tokens inside the weekly window', () => {
      const s = computeWindowState(events, { now: T0 });
      expect(s.weekTokens).toBe(9000); // all three
    });

    test('proximity is null when no budget is configured (honest: estimate only)', () => {
      const s = computeWindowState(events, { now: T0 });
      expect(s.windowProximity).toBeNull();
      expect(s.weekProximity).toBeNull();
    });

    test('proximity is tokens/budget, clamped [0,1], when a budget is configured', () => {
      const s = computeWindowState(events, { now: T0, windowTokenBudget: 8000, weeklyTokenBudget: 9000 });
      expect(s.windowProximity).toBeCloseTo(0.5, 5); // 4000 / 8000
      expect(s.weekProximity).toBeCloseTo(1, 5); // 9000 / 9000
    });

    test('proximity clamps at 1 when over budget', () => {
      const s = computeWindowState([{ timestamp: T0, tokens: 20000 }], { now: T0, windowTokenBudget: 8000 });
      expect(s.windowProximity).toBe(1);
    });

    test('empty events -> zero burn, null proximity, infinite eta', () => {
      const s = computeWindowState([], { now: T0, windowTokenBudget: 8000 });
      expect(s.windowTokens).toBe(0);
      expect(s.windowProximity).toBe(0);
      expect(s.etaMinutes).toBe(Infinity);
    });

    test('etaMinutes projects budget exhaustion at recent velocity', () => {
      // 2000 tokens in the last 10 min = 200 tok/min; 6000 left of an 8000 budget
      const evs = [{ timestamp: T0 - 10 * 60 * 1000, tokens: 2000 }];
      const s = computeWindowState(evs, { now: T0, windowTokenBudget: 8000, velocityWindowMs: 15 * 60 * 1000 });
      // remaining 6000 / 200 per min = 30 min
      expect(s.etaMinutes).toBeGreaterThan(0);
      expect(s.etaMinutes).toBeLessThan(Infinity);
    });
  });

  describe('windowRecommendation', () => {
    test('null proximity -> unknown (no budget configured)', () => {
      expect(windowRecommendation(null)).toBe('unknown');
    });
    test('thresholds mirror pressure-score: >=0.8 switch_now, >=0.5 caution, else ok', () => {
      expect(windowRecommendation(0.2)).toBe('ok');
      expect(windowRecommendation(0.5)).toBe('caution');
      expect(windowRecommendation(0.85)).toBe('switch_now');
    });
  });

  describe('SubscriptionWindow (stateful, per pool)', () => {
    test('records usage and reports state for the pool', () => {
      const w = new SubscriptionWindow('claude', { windowTokenBudget: 10000 });
      w.record({ tokens: 2000, timestamp: T0 - 60 * 1000 });
      w.record({ tokens: 3000, timestamp: T0 });
      const s = w.getState(T0);
      expect(s.pool).toBe('claude');
      expect(s.windowTokens).toBe(5000);
      expect(s.windowProximity).toBeCloseTo(0.5, 5);
    });

    test('prunes events older than the weekly window on read (bounded memory)', () => {
      const w = new SubscriptionWindow('codex', {});
      w.record({ tokens: 1000, timestamp: T0 - 8 * 24 * 60 * 60 * 1000 }); // 8 days ago
      w.record({ tokens: 500, timestamp: T0 });
      const s = w.getState(T0);
      expect(s.weekTokens).toBe(500); // the 8-day-old event pruned
      expect(w.eventCount()).toBe(1);
    });

    test('recordFromResponse extracts usage from a ProviderResponse shape', () => {
      const w = new SubscriptionWindow('codex', {});
      w.recordFromResponse({ usage: { totalTokens: 1540 } }, T0);
      expect(w.getState(T0).windowTokens).toBe(1540);
    });

    test('recordFromResponse is a no-op on a response without usage', () => {
      const w = new SubscriptionWindow('claude', {});
      w.recordFromResponse({ content: 'x' }, T0);
      expect(w.getState(T0).windowTokens).toBe(0);
    });
  });
});
