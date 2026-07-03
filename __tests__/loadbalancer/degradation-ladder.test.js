const {
  computeRung,
  decideRoute,
  RUNGS,
  poolHot,
  poolExhausted,
  poolUsable,
  CAUTION,
  SWITCH_NOW,
} = require('../../src/loadbalancer/degradation-ladder');

// The 4-rung ladder, driven by the subscription-window tracker (F2), NOT by 429s:
// it switches BEFORE the wall. It obeys the red line (F4): primary-only work never
// leaves the primary. Pure: it takes a snapshot { primary, secondaries, pools },
// no clocks, no I/O.

const healthy = { windowProximity: 0.1, pressureRecommendation: 'ok', canAccept: true, usable: true };
const hot = { windowProximity: 0.6, pressureRecommendation: 'caution', canAccept: true, usable: true };
const exhausted = { windowProximity: 0.95, pressureRecommendation: 'switch_now', canAccept: false, usable: false };

const snap = (claude, codex) => ({ primary: 'claude', secondaries: ['codex'], pools: { claude, codex } });

describe('loadbalancer/degradation-ladder', () => {
  describe('computeRung', () => {
    test('rung 0 HEALTHY when primary is cool', () => {
      expect(computeRung(snap(healthy, healthy)).rung).toBe(RUNGS.HEALTHY);
    });
    test('rung 1 PRIMARY_HOT when primary is heating (window >=0.5 or caution)', () => {
      expect(computeRung(snap(hot, healthy)).rung).toBe(RUNGS.PRIMARY_HOT);
    });
    test('rung 2 PRIMARY_EXHAUSTED when primary is spent but a secondary is usable', () => {
      expect(computeRung(snap(exhausted, healthy)).rung).toBe(RUNGS.PRIMARY_EXHAUSTED);
    });
    test('rung 3 ALL_EXHAUSTED when primary spent and no secondary usable', () => {
      expect(computeRung(snap(exhausted, exhausted)).rung).toBe(RUNGS.ALL_EXHAUSTED);
    });
  });

  describe('decideRoute — delegable work follows the pressure', () => {
    test('HEALTHY: delegable work stays on the primary (no needless switch)', () => {
      const d = decideRoute(snap(healthy, healthy), 'mechanical');
      expect(d.action).toBe('route');
      expect(d.target).toBe('claude');
    });
    test('PRIMARY_HOT: delegable work moves to the secondary, primary breathes', () => {
      const d = decideRoute(snap(hot, healthy), 'mechanical');
      expect(d.action).toBe('route');
      expect(d.target).toBe('codex');
    });
    test('PRIMARY_EXHAUSTED: delegable work moves to the secondary', () => {
      const d = decideRoute(snap(exhausted, healthy), 'exploration');
      expect(d.target).toBe('codex');
    });
    test('ALL_EXHAUSTED: delegable work queues with an honest reason', () => {
      const d = decideRoute(snap(exhausted, exhausted), 'mechanical');
      expect(d.action).toBe('queue');
      expect(d.target).toBeNull();
      expect(d.reason).toMatch(/exhausted/i);
    });
  });

  describe('decideRoute — the red line: primary-only work never denatured', () => {
    test('PRIMARY_HOT: verification STAYS on the primary (not sent to codex)', () => {
      const d = decideRoute(snap(hot, healthy), 'verification');
      expect(d.action).toBe('route');
      expect(d.target).toBe('claude');
      expect(d.delegable).toBe(false);
    });
    test('PRIMARY_EXHAUSTED but primary can still accept: primary-only work still on primary', () => {
      const primaryEatingButAccepting = { windowProximity: 0.85, pressureRecommendation: 'switch_now', canAccept: true, usable: true };
      const d = decideRoute(snap(primaryEatingButAccepting, healthy), 'analysis');
      expect(d.target).toBe('claude');
    });
    test('primary truly cannot accept: primary-only work QUEUES, never crosses to codex', () => {
      const d = decideRoute(snap(exhausted, healthy), 'verification');
      expect(d.action).toBe('queue');
      expect(d.target).toBeNull();
      expect(d.reason).toMatch(/primary-only|denatur/i);
    });
    test('soul/identity work is never delegated, at any rung', () => {
      for (const nature of ['soul', 'identity', 'review', 'gate']) {
        const d = decideRoute(snap(exhausted, healthy), nature);
        expect(d.target).not.toBe('codex');
      }
    });
  });

  describe('pool predicate band edges (explicit coverage)', () => {
    test('constants: CAUTION=0.5, SWITCH_NOW=0.8', () => {
      expect(CAUTION).toBe(0.5);
      expect(SWITCH_NOW).toBe(0.8);
    });
    test('poolExhausted at the SWITCH_NOW boundary (0.8 inclusive) and on !canAccept', () => {
      expect(poolExhausted({ windowProximity: 0.8, pressureRecommendation: 'ok', canAccept: true })).toBe(true);
      expect(poolExhausted({ windowProximity: 0.79, pressureRecommendation: 'ok', canAccept: true })).toBe(false);
      expect(poolExhausted({ windowProximity: 0.1, pressureRecommendation: 'ok', canAccept: false })).toBe(true);
      expect(poolExhausted({ windowProximity: 0.1, pressureRecommendation: 'switch_now', canAccept: true })).toBe(true);
    });
    test('poolHot at the CAUTION boundary (0.5 inclusive), below exhausted', () => {
      expect(poolHot({ windowProximity: 0.5, pressureRecommendation: 'ok', canAccept: true })).toBe(true);
      expect(poolHot({ windowProximity: 0.49, pressureRecommendation: 'ok', canAccept: true })).toBe(false);
      expect(poolHot({ windowProximity: 0.2, pressureRecommendation: 'caution', canAccept: true })).toBe(true);
      // exhausted is not "hot" (a spent pool is past hot)
      expect(poolHot({ windowProximity: 0.9, pressureRecommendation: 'ok', canAccept: true })).toBe(false);
    });
    test('poolUsable: needs canAccept + usable + not exhausted', () => {
      expect(poolUsable({ windowProximity: 0.1, pressureRecommendation: 'ok', canAccept: true, usable: true })).toBe(true);
      expect(poolUsable({ windowProximity: 0.1, pressureRecommendation: 'ok', canAccept: true, usable: false })).toBe(false);
      expect(poolUsable({ windowProximity: 0.9, pressureRecommendation: 'ok', canAccept: true, usable: true })).toBe(false);
      expect(poolUsable(null)).toBe(false);
    });
    test('null windowProximity does not trip the band (estimate-only pool)', () => {
      expect(poolExhausted({ windowProximity: null, pressureRecommendation: 'ok', canAccept: true })).toBe(false);
      expect(poolHot({ windowProximity: null, pressureRecommendation: 'ok', canAccept: true })).toBe(false);
    });
  });

  describe('decideRoute — always carries the rung + reason for the surface/logs', () => {
    test('every decision names its rung and a human reason', () => {
      const d = decideRoute(snap(hot, healthy), 'mechanical');
      expect(Object.values(RUNGS)).toContain(d.rung);
      expect(typeof d.reason).toBe('string');
      expect(d.reason.length).toBeGreaterThan(0);
    });
  });
});
