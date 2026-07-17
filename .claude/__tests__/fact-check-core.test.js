'use strict';

// WI-5 — the expanded absolute-claim engine. Verifies the new triggers fire, a
// sourced absolute passes, strip-zones (code / list examples) are not policed,
// and the deliberately-excluded noisy words do NOT false-positive.

const { findUnsourced, stripNonClaimZones, ABSOLUTES } = require('../hooks/lib/fact-check-core');

describe('findUnsourced — expanded absolutes (WI-5)', () => {
  test('new triggers fire when unsourced', () => {
    expect(findUnsourced('This is best practice for auth')).not.toBe(null);
    expect(findUnsourced('Postgres is faster than Redis here')).not.toBe(null);
    expect(findUnsourced("c'est evidemment la bonne approche")).not.toBe(null);
    expect(findUnsourced('it is well-known that caching helps')).not.toBe(null);
    expect(findUnsourced("c'est le standard de l'industrie")).not.toBe(null);
  });
  test('WI-5 review fix: a prose sentence STARTING with an absolute is still policed', () => {
    // the old strip (^[\s-]*) swallowed this -> false negative ; now it is caught
    expect(findUnsourced('Never mutate state directly.')).not.toBe(null);
  });
  test('WI-5 review fix: "optimal" alone is no longer a trigger (too noisy for doc prose)', () => {
    expect(findUnsourced('the optimal layout for this dashboard')).toBe(null);
  });
  test('original triggers still fire', () => {
    expect(findUnsourced('Redis is always faster')).not.toBe(null);
    expect(findUnsourced('on ne fait jamais ca')).not.toBe(null);
  });
});

describe('findUnsourced — sourced absolutes pass', () => {
  test('a source marker within the window clears the absolute', () => {
    expect(findUnsourced('This is best practice (source: _byan/knowledge/sources.md)')).toBe(null);
    expect(findUnsourced('X is faster than Y, see https://redis.io/benchmarks')).toBe(null);
    expect(findUnsourced('optimal per RFC 7234 caching rules')).toBe(null);
  });
});

describe('strip-zones and no false positives', () => {
  test('an absolute inside a code span or a BULLET list example is not policed', () => {
    expect(findUnsourced(stripNonClaimZones('the word `always` is a trigger'))).toBe(null);
    expect(findUnsourced(stripNonClaimZones('- toujours'))).toBe(null);
    expect(findUnsourced(stripNonClaimZones('* never'))).toBe(null);
    expect(findUnsourced(stripNonClaimZones('> evidemment (citation)'))).toBe(null);
  });
  test('excluded noisy words do NOT trip the gate', () => {
    expect(findUnsourced('au mieux on fait une passe de plus')).toBe(null); // "mieux" excluded
    expect(findUnsourced('une approche simple et claire')).toBe(null);      // "claire" != "clearly"
    expect(findUnsourced('il est impossible de tout couvrir')).toBe(null);  // "impossible" excluded
    expect(findUnsourced('the optimal layout')).toBe(null);                 // "optimal" dropped in WI-5 review
  });
  test('the pattern list grew (regression guard on the expansion)', () => {
    expect(ABSOLUTES.length).toBeGreaterThanOrEqual(22);
  });
});
