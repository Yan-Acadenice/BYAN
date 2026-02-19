const FactChecker = require('../../src/byan-v2/fact-check/index');

describe('FactChecker', () => {
  let checker;

  beforeEach(() => {
    checker = new FactChecker({
      min_level: 3,
      strict_domains: ['security', 'performance'],
      output_fact_sheet: false
    });
  });

  describe('check()', () => {
    test('throws on empty claim', () => {
      expect(() => checker.check('')).toThrow();
    });

    test('returns CLAIM for level <= min_level with source', () => {
      const result = checker.check('Redis > 100k ops/sec', { level: 2, source: 'redis.io/benchmarks' });
      expect(result.status).toBe('CLAIM');
      expect(result.assertionType).toBe('CLAIM');
    });

    test('returns HYPOTHESIS for level > min_level', () => {
      const result = checker.check('This is maintainable', { level: 5 });
      expect(result.status).toBe('OPINION');
      expect(result.assertionType).toBe('HYPOTHESIS');
    });

    test('blocks security domain at level 3', () => {
      const result = checker.check('JWT is secure enough', { level: 3, domain: 'security' });
      expect(result.status).toBe('BLOCKED');
    });

    test('allows security domain at level 2', () => {
      const result = checker.check('JWT uses RSA-256', { level: 2, domain: 'security', source: 'rfc7519' });
      expect(result.status).toBe('CLAIM');
    });

    test('includes source in message', () => {
      const result = checker.check('Node.js is single-threaded', { level: 1, source: 'nodejs.org/api' });
      expect(result.message).toContain('nodejs.org/api');
    });

    test('throws on invalid level', () => {
      expect(() => checker.check('claim', { level: 0 })).toThrow();
      expect(() => checker.check('claim', { level: 6 })).toThrow();
    });

    test('stores fact in sessionState when provided', () => {
      const mockState = { addFact: jest.fn() };
      const c = new FactChecker({ output_fact_sheet: false }, mockState);
      c.check('test claim', { level: 2 });
      expect(mockState.addFact).toHaveBeenCalledTimes(1);
    });
  });

  describe('verify()', () => {
    test('throws on empty claim', () => {
      expect(() => checker.verify('', 'some proof')).toThrow();
    });

    test('throws on missing proof', () => {
      expect(() => checker.verify('some claim', null)).toThrow();
    });

    test('returns VERIFIED status', () => {
      const result = checker.verify('Redis > 100k ops/sec', 'redis-benchmark output: 120000 ops/sec');
      expect(result.status).toBe('VERIFIED');
    });

    test('message includes FACT USER-VERIFIED prefix', () => {
      const result = checker.verify('X is true', 'proof here');
      expect(result.message).toContain('[FACT USER-VERIFIED');
    });
  });

  describe('parse()', () => {
    test('detects trigger patterns', () => {
      const results = checker.parse('Redis est toujours plus rapide');
      expect(results.length).toBeGreaterThan(0);
    });

    test('returns empty array on clean text', () => {
      const results = checker.parse('Voici le plan de la feature');
      expect(results).toHaveLength(0);
    });
  });

  describe('generateFactSheet()', () => {
    test('returns content and null filePath when save=false', () => {
      const facts = { verified: [], claims: [], disputed: [], opinions: [] };
      const result = checker.generateFactSheet('sess-1', facts, false);
      expect(result).toHaveProperty('content');
      expect(result.filePath).toBeNull();
    });
  });
});
