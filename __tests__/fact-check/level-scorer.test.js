const LevelScorer = require('../../src/byan-v2/fact-check/level-scorer');

describe('LevelScorer', () => {
  let scorer;
  beforeEach(() => { scorer = new LevelScorer(); });

  test('scores level 1 at 95', () => expect(scorer.score(1)).toBe(95));
  test('scores level 2 at 80', () => expect(scorer.score(2)).toBe(80));
  test('scores level 3 at 65', () => expect(scorer.score(3)).toBe(65));
  test('scores level 4 at 50', () => expect(scorer.score(4)).toBe(50));
  test('scores level 5 at 20', () => expect(scorer.score(5)).toBe(20));

  test('throws on level 0', () => expect(() => scorer.score(0)).toThrow());
  test('throws on level 6', () => expect(() => scorer.score(6)).toThrow());
  test('throws on non-integer', () => expect(() => scorer.score(2.5)).toThrow());

  test('blocks security domain at level 3', () =>
    expect(scorer.isBlockedInDomain(3, 'security')).toBe(true));
  test('does not block security domain at level 2', () =>
    expect(scorer.isBlockedInDomain(2, 'security')).toBe(false));
  test('blocks performance domain at level 3', () =>
    expect(scorer.isBlockedInDomain(3, 'performance')).toBe(true));
  test('does not block unknown domain', () =>
    expect(scorer.isBlockedInDomain(5, 'unknown')).toBe(false));

  test('describes level 1', () =>
    expect(scorer.describeLevel(1)).toContain('spec'));
  test('describes level 5', () =>
    expect(scorer.describeLevel(5)).toContain('Opinion'));
});
