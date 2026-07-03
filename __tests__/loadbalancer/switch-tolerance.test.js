const {
  SWITCH_TOLERANCE,
  isDelegable,
  eligibleProviders,
  DELEGABLE_NATURES,
  PRIMARY_ONLY_NATURES,
} = require('../../src/loadbalancer/switch-tolerance');
const { CapabilityMatrix } = require('../../src/loadbalancer/capability-matrix');

// The red line the user named: "sans denaturer BYAN". Degradation may move only
// DELEGABLE work (mechanical, exploration, tests-arbitrated implementation) to a
// secondary pool (Codex). Judgment/identity work (verification, analysis, soul)
// stays on the primary (Claude) whatever the pressure. This classifier is the
// single source of that line; the degradation ladder (F5) obeys it.

describe('loadbalancer/switch-tolerance', () => {
  describe('the taxonomy', () => {
    test('delegable natures: exploration, mechanical, implementation', () => {
      expect(isDelegable('exploration')).toBe(true);
      expect(isDelegable('mechanical')).toBe(true);
      expect(isDelegable('implementation')).toBe(true);
    });

    test('primary-only natures: verification, analysis (judgment)', () => {
      expect(isDelegable('verification')).toBe(false);
      expect(isDelegable('analysis')).toBe(false);
    });

    test('identity/soul/review are primary-only (the red line, never denatured)', () => {
      expect(isDelegable('soul')).toBe(false);
      expect(isDelegable('identity')).toBe(false);
      expect(isDelegable('review')).toBe(false);
    });

    test('unknown nature is conservative: primary-only, never delegated on a guess', () => {
      expect(isDelegable('xyzzy')).toBe(false);
      expect(isDelegable(undefined)).toBe(false);
      expect(isDelegable(null)).toBe(false);
    });

    test('the two sets are disjoint and the map agrees with them', () => {
      for (const n of DELEGABLE_NATURES) expect(SWITCH_TOLERANCE[n]).toBe('delegable');
      for (const n of PRIMARY_ONLY_NATURES) expect(SWITCH_TOLERANCE[n]).toBe('primary-only');
      const overlap = DELEGABLE_NATURES.filter((n) => PRIMARY_ONLY_NATURES.includes(n));
      expect(overlap).toEqual([]);
    });
  });

  describe('eligibleProviders', () => {
    const primary = 'claude';
    const secondaries = ['codex', 'copilot'];

    test('a primary-only nature yields ONLY the primary, even under pressure', () => {
      const r = eligibleProviders('verification', { primary, secondaries });
      expect(r).toEqual(['claude']);
    });

    test('a delegable nature yields primary + secondaries', () => {
      const r = eligibleProviders('mechanical', { primary, secondaries });
      expect(r[0]).toBe('claude'); // primary preferred first
      expect(r).toContain('codex');
      expect(r).toContain('copilot');
    });

    test('a delegable nature filters secondaries by required capability via the matrix', () => {
      const matrix = new CapabilityMatrix();
      // byan_api lacks file_edit; require it -> byan_api excluded, codex kept
      const r = eligibleProviders('implementation', {
        primary,
        secondaries: ['codex', 'byan_api'],
        capabilityMatrix: matrix,
        required: ['file_edit'],
      });
      expect(r).toContain('codex');
      expect(r).not.toContain('byan_api');
    });

    test('primary is always first (preferred) in the eligible list', () => {
      const r = eligibleProviders('exploration', { primary: 'claude', secondaries: ['codex'] });
      expect(r[0]).toBe('claude');
    });

    test('no secondaries -> primary only, for any nature', () => {
      expect(eligibleProviders('mechanical', { primary, secondaries: [] })).toEqual(['claude']);
      expect(eligibleProviders('analysis', { primary, secondaries: [] })).toEqual(['claude']);
    });
  });
});
