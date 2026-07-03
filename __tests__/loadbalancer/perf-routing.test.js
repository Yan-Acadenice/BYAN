const {
  matchCategory,
  perfFavors,
  DEFAULT_FORCES,
} = require('../../.claude/hooks/lib/perf-routing');

// F3 — perf-based routing MECHANISM. Honest by construction: "model X is better
// at task Y" is a performance claim, and BYAN's own fact-check floor for the
// performance domain is L2 (reproducible benchmark). A community arena
// (designarena) is below that floor, so this module ships NEUTRAL (empty forces)
// and asserts nothing. It provides the config-driven table + matcher; populating
// it with rankings is the user's opt-in call, tagged heuristic. These tests pin
// the mechanism, not any fabricated ranking.

describe('loadbalancer/perf-routing', () => {
  test('default forces table is empty (asserts no unsourced ranking)', () => {
    expect(Array.isArray(DEFAULT_FORCES)).toBe(true);
    expect(DEFAULT_FORCES).toHaveLength(0);
  });

  describe('matchCategory', () => {
    const forces = [
      { category: 'bulk-refactor', pattern: 'refactor|rename across', favors: 'codex' },
      { category: 'architecture', pattern: 'architect|design the system', favors: 'claude' },
    ];
    test('returns the first matching entry', () => {
      expect(matchCategory('please refactor the module', forces).category).toBe('bulk-refactor');
      expect(matchCategory('architect the system', forces).category).toBe('architecture');
    });
    test('no match -> null', () => {
      expect(matchCategory('hello there', forces)).toBeNull();
    });
    test('empty / missing forces -> null (neutral default asserts nothing)', () => {
      expect(matchCategory('refactor', [])).toBeNull();
      expect(matchCategory('refactor')).toBeNull();
    });
    test('a malformed entry is skipped, not fatal', () => {
      const bad = [{ category: 'x' }, { category: 'ok', pattern: 'zap', favors: 'codex' }];
      expect(matchCategory('zap it', bad).category).toBe('ok');
    });
  });

  describe('perfFavors', () => {
    const forces = [{ category: 'bulk-refactor', pattern: 'refactor', favors: 'codex' }];
    test('favoring codex -> { favors: codex, confidence: heuristic }', () => {
      const r = perfFavors('refactor everything', forces);
      expect(r.favors).toBe('codex');
      expect(r.category).toBe('bulk-refactor');
      expect(r.confidence).toBe('heuristic');
    });
    test('favoring claude or no match -> favors null (no delegation push)', () => {
      expect(perfFavors('design the architecture', [{ category: 'a', pattern: 'architecture', favors: 'claude' }]).favors).toBe('claude');
      expect(perfFavors('nothing relevant', forces).favors).toBeNull();
    });
  });
});
