const FactChecker = require('../../src/byan-v2/fact-check/index');

describe('FactChecker P2 — expiration and chain', () => {
  let checker;
  beforeEach(() => { checker = new FactChecker({ output_fact_sheet: false }); });

  describe('expiresAt()', () => {
    test('security expires in 180 days', () => {
      const created = '2026-01-01';
      const expiry = checker.expiresAt('security', created);
      expect(expiry).toBe('2026-06-30');
    });

    test('algorithms never expire (null)', () => {
      expect(checker.expiresAt('algorithms', '2026-01-01')).toBeNull();
    });

    test('general expires in 730 days', () => {
      const created = new Date('2026-01-01');
      const expected = new Date(created);
      expected.setDate(expected.getDate() + 730);
      expect(checker.expiresAt('general', '2026-01-01')).toBe(expected.toISOString().slice(0, 10));
    });
  });

  describe('checkExpiration()', () => {
    test('throws on fact without created_at', () => {
      expect(() => checker.checkExpiration({ claim: 'X' })).toThrow();
    });

    test('returns expired: true for old security fact', () => {
      const fact = { claim: 'X', domain: 'security', created_at: '2024-01-01' };
      const result = checker.checkExpiration(fact);
      expect(result.expired).toBe(true);
      expect(result.warning).toContain('[EXPIRED]');
    });

    test('returns expired: false for fresh fact', () => {
      const fact = { claim: 'X', domain: 'security', created_at: new Date().toISOString() };
      const result = checker.checkExpiration(fact);
      expect(result.expired).toBe(false);
    });

    test('returns null warning for non-expiring domain', () => {
      const fact = { claim: 'X', domain: 'algorithms', created_at: '2010-01-01' };
      const result = checker.checkExpiration(fact);
      expect(result.expired).toBe(false);
      expect(result.warning).toBeNull();
    });

    test('warns when expiring within 30 days', () => {
      const soon = new Date();
      soon.setDate(soon.getDate() - 160); // security half-life is 180, so 20 days left
      const fact = { claim: 'X', domain: 'security', created_at: soon.toISOString() };
      const result = checker.checkExpiration(fact);
      expect(result.warning).toContain('[EXPIRING SOON]');
    });
  });

  describe('chain()', () => {
    test('throws on empty array', () => {
      expect(() => checker.chain([])).toThrow();
    });

    test('throws on non-array', () => {
      expect(() => checker.chain('80,80')).toThrow();
    });

    test('throws on out-of-range score', () => {
      expect(() => checker.chain([80, 150])).toThrow();
    });

    test('single step returns full score', () => {
      const result = checker.chain([90]);
      expect(result.finalScore).toBe(90);
      expect(result.steps).toBe(1);
      expect(result.warning).toBeNull();
    });

    test('three steps 80x80x80 = 51', () => {
      const result = checker.chain([80, 80, 80]);
      expect(result.finalScore).toBe(51);
    });

    test('warns when more than 3 steps', () => {
      const result = checker.chain([80, 80, 80, 80]);
      expect(result.warning).toContain('Chain of 4 steps');
    });

    test('warns when final score < 60', () => {
      const result = checker.chain([70, 70, 70]);
      expect(result.warning).toContain('below 60%');
    });

    test('no warning for short high-confidence chain', () => {
      const result = checker.chain([95, 90]);
      expect(result.warning).toBeNull();
    });
  });
});
