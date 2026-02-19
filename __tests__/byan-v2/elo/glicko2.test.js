const { update, decayRd } = require('../../../src/byan-v2/elo/glicko2');

describe('glicko2', () => {
  describe('update()', () => {
    test('VALIDATED increases rating', () => {
      const { newRating } = update(400, 150, 1, 32);
      expect(newRating).toBeGreaterThan(400);
    });

    test('BLOCKED decreases rating', () => {
      const { newRating } = update(400, 150, 0, 32);
      expect(newRating).toBeLessThan(400);
    });

    test('PARTIAL keeps rating close to current', () => {
      const { delta } = update(400, 150, 0.5, 32);
      expect(Math.abs(delta)).toBeLessThan(20);
    });

    test('delta is positive on VALIDATED', () => {
      const { delta } = update(200, 200, 1, 32);
      expect(delta).toBeGreaterThan(0);
    });

    test('delta is negative on BLOCKED', () => {
      const { delta } = update(200, 200, 0, 32);
      expect(delta).toBeLessThan(0);
    });

    test('rating never goes below 0', () => {
      const { newRating } = update(5, 200, 0, 48);
      expect(newRating).toBeGreaterThanOrEqual(0);
    });

    test('rating never exceeds 1000', () => {
      const { newRating } = update(995, 30, 1, 48);
      expect(newRating).toBeLessThanOrEqual(1000);
    });

    test('higher K-factor produces larger delta', () => {
      const lowK  = update(500, 100, 1, 16);
      const highK = update(500, 100, 1, 48);
      expect(Math.abs(highK.delta)).toBeGreaterThan(Math.abs(lowK.delta));
    });

    test('throws on invalid result', () => {
      expect(() => update(400, 150, 1.5, 32)).toThrow();
      expect(() => update(400, 150, -1, 32)).toThrow();
    });

    test('RD decreases after a result (more certainty)', () => {
      const { newRd } = update(400, 200, 1, 32);
      expect(newRd).toBeLessThan(200);
    });

    test('probability is between 0 and 100', () => {
      const { probability } = update(300, 100, 1, 32);
      expect(probability).toBeGreaterThanOrEqual(0);
      expect(probability).toBeLessThanOrEqual(100);
    });
  });

  describe('decayRd()', () => {
    test('RD increases after idle period', () => {
      const newRd = decayRd(50, 180);
      expect(newRd).toBeGreaterThan(50);
    });

    test('RD does not exceed INITIAL_RD (200)', () => {
      const newRd = decayRd(50, 9999);
      expect(newRd).toBeLessThanOrEqual(200);
    });

    test('0 days → RD unchanged', () => {
      const newRd = decayRd(80, 0);
      expect(newRd).toBe(80);
    });
  });
});
