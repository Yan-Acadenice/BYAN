import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseJsonl,
  harvestToolHealth,
  harvestStrictGaps,
  harvestRouting,
  harvestEloTrends,
  buildDigest,
  renderDigest,
  harvest,
} from '../lib/insight-harvest.js';

// ---------------------------------------------------------------------------
// parseJsonl
// ---------------------------------------------------------------------------

test('parseJsonl: empty/null input returns []', () => {
  assert.deepEqual(parseJsonl(''), []);
  assert.deepEqual(parseJsonl(null), []);
  assert.deepEqual(parseJsonl(undefined), []);
});

test('parseJsonl: valid lines are parsed', () => {
  const text = '{"a":1}\n{"b":2}\n';
  assert.deepEqual(parseJsonl(text), [{ a: 1 }, { b: 2 }]);
});

test('parseJsonl: malformed lines are skipped', () => {
  const text = '{"ok":true}\nnot-json\n{"x":3}';
  assert.deepEqual(parseJsonl(text), [{ ok: true }, { x: 3 }]);
});

test('parseJsonl: blank lines are skipped', () => {
  const text = '\n{"a":1}\n\n{"b":2}\n\n';
  assert.equal(parseJsonl(text).length, 2);
});

// ---------------------------------------------------------------------------
// harvestToolHealth
// ---------------------------------------------------------------------------

test('harvestToolHealth: post lines with mix of ok true/false', () => {
  const entries = [
    { phase: 'post', tool: 'Write', ok: true, est_output_tokens: 100 },
    { phase: 'post', tool: 'Write', ok: false, est_output_tokens: 50 },
    { phase: 'post', tool: 'Edit', ok: false, est_output_tokens: 0 },
    { phase: 'post', tool: 'Read', ok: true, est_output_tokens: 200 },
    { phase: 'post', tool: 'Write', ok: false },
  ];
  const h = harvestToolHealth(entries);
  assert.equal(h.calls, 5);
  assert.equal(h.failures, 3);
  assert.equal(h.failureRate, 0.6);
  // top failing: Write has 2, Edit has 1
  assert.equal(h.topFailing[0].tool, 'Write');
  assert.equal(h.topFailing[0].count, 2);
  assert.equal(h.topFailing[1].tool, 'Edit');
  assert.equal(h.topFailing[1].count, 1);
  assert.equal(h.estOutputTokens, 350);
});

test('harvestToolHealth: pre lines are ignored', () => {
  const entries = [
    { phase: 'pre', tool: 'Write', ok: false },
    { phase: 'pre', tool: 'Edit', ok: false },
    { phase: 'post', tool: 'Read', ok: true },
  ];
  const h = harvestToolHealth(entries);
  assert.equal(h.calls, 1);
  assert.equal(h.failures, 0);
  assert.equal(h.failureRate, 0);
  assert.equal(h.topFailing.length, 0);
});

test('harvestToolHealth: empty input returns zero values', () => {
  const h = harvestToolHealth([]);
  assert.equal(h.calls, 0);
  assert.equal(h.failures, 0);
  assert.equal(h.failureRate, 0);
  assert.deepEqual(h.topFailing, []);
  assert.equal(h.estOutputTokens, 0);
});

test('harvestToolHealth: null input returns zero values', () => {
  const h = harvestToolHealth(null);
  assert.equal(h.calls, 0);
  assert.equal(h.failureRate, 0);
});

test('harvestToolHealth: est_output_tokens defaults to 0 when absent', () => {
  const entries = [
    { phase: 'post', tool: 'Read', ok: true },
    { phase: 'post', tool: 'Bash', ok: true, est_output_tokens: 42 },
  ];
  const h = harvestToolHealth(entries);
  assert.equal(h.estOutputTokens, 42);
});

test('harvestToolHealth: topFailing capped at 5', () => {
  const entries = [];
  for (let i = 0; i < 10; i++) {
    entries.push({ phase: 'post', tool: `tool${i}`, ok: false });
  }
  const h = harvestToolHealth(entries);
  assert.equal(h.topFailing.length, 5);
});

// ---------------------------------------------------------------------------
// harvestStrictGaps
// ---------------------------------------------------------------------------

test('harvestStrictGaps: only self_verify+gap entries are clustered', () => {
  const entries = [
    {
      event: 'self_verify',
      verdict: 'gap',
      findings: ['missing tests for edge cases', 'no test coverage for error path'],
    },
    { event: 'self_verify', verdict: 'ok', findings: ['all good'] },
    { event: 'lock_scope', verdict: 'gap', findings: ['should not count'] },
    {
      event: 'self_verify',
      verdict: 'gap',
      findings: ['tests are missing'],
    },
  ];
  const g = harvestStrictGaps(entries);
  // 3 findings total (ok and lock_scope excluded)
  assert.equal(g.totalGapFindings, 3);
  // tests/coverage theme should appear (3 times: 2+1)
  const testTheme = g.recurring.find((r) => r.theme === 'tests/coverage');
  assert.ok(testTheme, 'expected tests/coverage theme');
  assert.ok(testTheme.count >= 2);
  assert.ok(g.recurring.length >= 1);
});

test('harvestStrictGaps: theme reaching count>=2 appears in recurring', () => {
  const entries = [
    { event: 'self_verify', verdict: 'gap', findings: ['documentation missing'] },
    { event: 'self_verify', verdict: 'gap', findings: ['update the readme'] },
    { event: 'self_verify', verdict: 'gap', findings: ['unique finding about scope cut'] },
  ];
  const g = harvestStrictGaps(entries);
  assert.equal(g.totalGapFindings, 3);
  const docTheme = g.recurring.find((r) => r.theme === 'documentation');
  assert.ok(docTheme, 'documentation theme should be recurring');
  assert.equal(docTheme.count, 2);
  // scope/downgrade only appears once -> NOT recurring
  const scopeTheme = g.recurring.find((r) => r.theme === 'scope/downgrade');
  assert.equal(scopeTheme, undefined);
});

test('harvestStrictGaps: tests/coverage theme mapped from "test" keyword', () => {
  const entries = [
    { event: 'self_verify', verdict: 'gap', findings: ['add unit test for parser'] },
    { event: 'self_verify', verdict: 'gap', findings: ['test coverage for happy path'] },
  ];
  const g = harvestStrictGaps(entries);
  const t = g.recurring.find((r) => r.theme === 'tests/coverage');
  assert.ok(t);
  assert.equal(t.count, 2);
});

test('harvestStrictGaps: empty input returns zero findings and no recurring', () => {
  const g = harvestStrictGaps([]);
  assert.equal(g.totalGapFindings, 0);
  assert.deepEqual(g.recurring, []);
});

test('harvestStrictGaps: null input handled gracefully', () => {
  const g = harvestStrictGaps(null);
  assert.equal(g.totalGapFindings, 0);
});

test('harvestStrictGaps: samples capped at 2 per theme', () => {
  const entries = [
    { event: 'self_verify', verdict: 'gap', findings: ['test a', 'test b', 'test c'] },
  ];
  const g = harvestStrictGaps(entries);
  const t = g.recurring.find((r) => r.theme === 'tests/coverage');
  assert.ok(t);
  assert.ok(t.samples.length <= 2);
});

// ---------------------------------------------------------------------------
// harvestRouting
// ---------------------------------------------------------------------------

test('harvestRouting: keepRate math and sort by n desc', () => {
  const ledger = {
    'haiku::leaf-a': { model: 'haiku', leafId: 'leaf-a', successes: 8, failures: 2 },
    'haiku::leaf-b': { model: 'haiku', leafId: 'leaf-b', successes: 3, failures: 7 },
    'sonnet::leaf-c': { model: 'sonnet', leafId: 'leaf-c', successes: 20, failures: 5 },
  };
  const rows = harvestRouting(ledger);
  // sorted by n desc: sonnet(25) > haiku::leaf-a(10) > haiku::leaf-b(10)
  assert.equal(rows[0].model, 'sonnet');
  assert.equal(rows[0].n, 25);
  assert.equal(rows[0].keepRate, 0.8);
  // leaf-a: keepRate 0.8, leaf-b: keepRate 0.3
  const leafB = rows.find((r) => r.leaf === 'leaf-b');
  assert.ok(leafB);
  assert.equal(leafB.keepRate, 0.3);
  assert.equal(leafB.failures, 7);
});

test('harvestRouting: zero-n entries are skipped', () => {
  const ledger = {
    'haiku::leaf-x': { model: 'haiku', leafId: 'leaf-x', successes: 0, failures: 0 },
    'haiku::leaf-y': { model: 'haiku', leafId: 'leaf-y', successes: 5, failures: 1 },
  };
  const rows = harvestRouting(ledger);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].leaf, 'leaf-y');
});

test('harvestRouting: null/empty ledger returns []', () => {
  assert.deepEqual(harvestRouting(null), []);
  assert.deepEqual(harvestRouting({}), []);
});

test('harvestRouting: model and leaf fallback from key when not in value', () => {
  const ledger = {
    'opus::leaf-z': { successes: 3, failures: 1 },
  };
  const rows = harvestRouting(ledger);
  assert.equal(rows[0].model, 'opus');
  assert.equal(rows[0].leaf, 'leaf-z');
});

// ---------------------------------------------------------------------------
// harvestEloTrends
// ---------------------------------------------------------------------------

test('harvestEloTrends: sorted by rating desc', () => {
  const profile = {
    domains: {
      javascript: { rating: 700, blocked_streak: 0 },
      security: { rating: 850, blocked_streak: 2 },
      python: { rating: 500, blocked_streak: 1 },
    },
  };
  const rows = harvestEloTrends(profile);
  assert.equal(rows[0].domain, 'security');
  assert.equal(rows[0].rating, 850);
  assert.equal(rows[0].blockedStreak, 2);
  assert.equal(rows[1].domain, 'javascript');
  assert.equal(rows[2].domain, 'python');
});

test('harvestEloTrends: non-numeric rating is skipped', () => {
  const profile = {
    domains: {
      rust: { rating: 'not-a-number', blocked_streak: 0 },
      go: { rating: 600, blocked_streak: 0 },
    },
  };
  const rows = harvestEloTrends(profile);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].domain, 'go');
});

test('harvestEloTrends: absent rating skipped', () => {
  const profile = {
    domains: {
      algorithms: {},
      typescript: { rating: 750 },
    },
  };
  const rows = harvestEloTrends(profile);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].domain, 'typescript');
});

test('harvestEloTrends: null/empty input returns []', () => {
  assert.deepEqual(harvestEloTrends(null), []);
  assert.deepEqual(harvestEloTrends({}), []);
  assert.deepEqual(harvestEloTrends({ domains: {} }), []);
});

test('harvestEloTrends: blocked_streak defaults to 0 when absent', () => {
  const profile = { domains: { go: { rating: 600 } } };
  const rows = harvestEloTrends(profile);
  assert.equal(rows[0].blockedStreak, 0);
});

// ---------------------------------------------------------------------------
// buildDigest — proposals
// ---------------------------------------------------------------------------

test('buildDigest: tool-reliability proposal fires when failureRate>0.1 and topFailing non-empty', () => {
  const toolHealth = {
    calls: 10,
    failures: 5,
    failureRate: 0.5,
    topFailing: [{ tool: 'Write', count: 5 }],
    estOutputTokens: 0,
  };
  const gaps = { totalGapFindings: 0, recurring: [] };
  const d = buildDigest({ toolHealth, gaps, routing: [], elo: [] });
  const p = d.proposals.find((p) => p.kind === 'tool-reliability');
  assert.ok(p, 'expected tool-reliability proposal');
  assert.equal(p.gated, true);
});

test('buildDigest: tool-reliability proposal does NOT fire when failureRate<=0.1', () => {
  const toolHealth = {
    calls: 10,
    failures: 1,
    failureRate: 0.1,
    topFailing: [{ tool: 'Write', count: 1 }],
    estOutputTokens: 0,
  };
  const d = buildDigest({ toolHealth, gaps: { totalGapFindings: 0, recurring: [] }, routing: [], elo: [] });
  assert.equal(d.proposals.filter((p) => p.kind === 'tool-reliability').length, 0);
});

test('buildDigest: tool-reliability does NOT fire when topFailing is empty', () => {
  const toolHealth = {
    calls: 5,
    failures: 1,
    failureRate: 0.2,
    topFailing: [],
    estOutputTokens: 0,
  };
  const d = buildDigest({ toolHealth, gaps: { totalGapFindings: 0, recurring: [] }, routing: [], elo: [] });
  assert.equal(d.proposals.filter((p) => p.kind === 'tool-reliability').length, 0);
});

test('buildDigest: recurring-gap proposal fires when gap theme count>=3', () => {
  const gaps = {
    totalGapFindings: 5,
    recurring: [
      { theme: 'tests/coverage', count: 3, samples: [] },
      { theme: 'documentation', count: 2, samples: [] },
    ],
  };
  const d = buildDigest({ toolHealth: null, gaps, routing: [], elo: [] });
  const p = d.proposals.filter((p) => p.kind === 'recurring-gap');
  assert.equal(p.length, 1);
  assert.ok(p[0].suggestion.includes('tests/coverage'));
  assert.equal(p[0].gated, true);
});

test('buildDigest: recurring-gap does NOT fire when all gap counts < 3', () => {
  const gaps = {
    totalGapFindings: 4,
    recurring: [
      { theme: 'tests/coverage', count: 2, samples: [] },
      { theme: 'documentation', count: 2, samples: [] },
    ],
  };
  const d = buildDigest({ toolHealth: null, gaps, routing: [], elo: [] });
  assert.equal(d.proposals.filter((p) => p.kind === 'recurring-gap').length, 0);
});

test('buildDigest: routing proposal fires when n>=5 and keepRate<0.5', () => {
  const routing = [
    { model: 'haiku', leaf: 'reasoning', successes: 2, failures: 8, n: 10, keepRate: 0.2 },
  ];
  const d = buildDigest({ toolHealth: null, gaps: { totalGapFindings: 0, recurring: [] }, routing, elo: [] });
  const p = d.proposals.find((p) => p.kind === 'routing');
  assert.ok(p, 'expected routing proposal');
  assert.equal(p.gated, true);
  assert.ok(p.suggestion.includes('haiku'));
});

test('buildDigest: routing proposal does NOT fire when n<5', () => {
  const routing = [
    { model: 'haiku', leaf: 'reasoning', successes: 0, failures: 4, n: 4, keepRate: 0.0 },
  ];
  const d = buildDigest({ toolHealth: null, gaps: { totalGapFindings: 0, recurring: [] }, routing, elo: [] });
  assert.equal(d.proposals.filter((p) => p.kind === 'routing').length, 0);
});

test('buildDigest: routing proposal does NOT fire when keepRate>=0.5', () => {
  const routing = [
    { model: 'haiku', leaf: 'leaf-x', successes: 5, failures: 5, n: 10, keepRate: 0.5 },
  ];
  const d = buildDigest({ toolHealth: null, gaps: { totalGapFindings: 0, recurring: [] }, routing, elo: [] });
  assert.equal(d.proposals.filter((p) => p.kind === 'routing').length, 0);
});

test('buildDigest: all proposals have gated===true', () => {
  const toolHealth = {
    calls: 10, failures: 5, failureRate: 0.5,
    topFailing: [{ tool: 'Write', count: 5 }], estOutputTokens: 0,
  };
  const gaps = {
    totalGapFindings: 5,
    recurring: [{ theme: 'tests/coverage', count: 4, samples: [] }],
  };
  const routing = [
    { model: 'haiku', leaf: 'fast-leaf', successes: 1, failures: 9, n: 10, keepRate: 0.1 },
  ];
  const d = buildDigest({ toolHealth, gaps, routing, elo: [] });
  assert.ok(d.proposals.length >= 3);
  for (const p of d.proposals) {
    assert.equal(p.gated, true);
  }
});

test('buildDigest: no proposals on clean input', () => {
  const toolHealth = {
    calls: 20, failures: 1, failureRate: 0.05,
    topFailing: [{ tool: 'Read', count: 1 }], estOutputTokens: 0,
  };
  const gaps = { totalGapFindings: 2, recurring: [{ theme: 'other', count: 2, samples: [] }] };
  const routing = [{ model: 'sonnet', leaf: 'leaf', successes: 8, failures: 2, n: 10, keepRate: 0.8 }];
  const d = buildDigest({ toolHealth, gaps, routing, elo: [] });
  assert.equal(d.proposals.length, 0);
});

test('buildDigest: null inputs return empty digest structure', () => {
  const d = buildDigest({});
  assert.equal(d.toolHealth, null);
  assert.deepEqual(d.recurringGaps, { totalGapFindings: 0, recurring: [] });
  assert.deepEqual(d.routingOutcomes, []);
  assert.deepEqual(d.eloTrends, []);
  assert.deepEqual(d.proposals, []);
});

// ---------------------------------------------------------------------------
// renderDigest
// ---------------------------------------------------------------------------

test('renderDigest: returns a non-empty string containing "digest"', () => {
  const d = buildDigest({
    toolHealth: { calls: 5, failures: 1, failureRate: 0.2, topFailing: [], estOutputTokens: 100 },
    gaps: { totalGapFindings: 0, recurring: [] },
    routing: [],
    elo: [],
  });
  const out = renderDigest(d);
  assert.ok(typeof out === 'string');
  assert.ok(out.length > 0);
  assert.ok(out.toLowerCase().includes('digest'));
});

test('renderDigest: includes tool health line when toolHealth present', () => {
  const d = buildDigest({
    toolHealth: { calls: 10, failures: 2, failureRate: 0.2, topFailing: [{ tool: 'Write', count: 2 }], estOutputTokens: 300 },
    gaps: { totalGapFindings: 0, recurring: [] },
    routing: [],
    elo: [],
  });
  const out = renderDigest(d);
  assert.ok(out.includes('10'));
  assert.ok(out.includes('Write'));
});

test('renderDigest: includes ELO trends when present', () => {
  const profile = { domains: { javascript: { rating: 720, blocked_streak: 0 } } };
  const elo = harvestEloTrends(profile);
  const d = buildDigest({ toolHealth: null, gaps: { totalGapFindings: 0, recurring: [] }, routing: [], elo });
  const out = renderDigest(d);
  assert.ok(out.includes('javascript'));
  assert.ok(out.includes('720'));
});

test('renderDigest: proposal count shown in output', () => {
  const toolHealth = {
    calls: 10, failures: 5, failureRate: 0.5,
    topFailing: [{ tool: 'T', count: 5 }], estOutputTokens: 0,
  };
  const d = buildDigest({ toolHealth, gaps: { totalGapFindings: 0, recurring: [] }, routing: [], elo: [] });
  const out = renderDigest(d);
  assert.ok(out.includes('1'));
  assert.ok(out.includes('tool-reliability'));
});

// ---------------------------------------------------------------------------
// harvest — I/O integration
// ---------------------------------------------------------------------------

function makeIo(files) {
  return {
    readFileSync(p) {
      // normalize path separator for matching
      const key = p.replace(/\\/g, '/');
      // find match by suffix
      for (const [k, v] of Object.entries(files)) {
        if (key.endsWith(k) || key === k) return v;
      }
      throw new Error(`ENOENT: ${p}`);
    },
  };
}

test('harvest: well-formed fixture io -> valid digest', () => {
  const toolLog = [
    '{"phase":"post","tool":"Write","ok":true,"est_output_tokens":100}',
    '{"phase":"post","tool":"Edit","ok":false,"est_output_tokens":50}',
  ].join('\n');
  const auditLog = JSON.stringify({ event: 'self_verify', verdict: 'gap', findings: ['missing test coverage'] }) + '\n';
  const suitabilityLedger = JSON.stringify({
    'haiku::leaf-a': { model: 'haiku', leafId: 'leaf-a', successes: 3, failures: 1 },
  });
  const eloProfile = JSON.stringify({
    domains: {
      javascript: { rating: 650, blocked_streak: 0 },
    },
  });

  const files = {
    '_byan-output/tool-log.jsonl': toolLog,
    '.byan-strict/audit.log': auditLog,
    '_byan-output/suitability-ledger.json': suitabilityLedger,
    '_byan/memoire/elo-profile.json': eloProfile,
  };

  const io = makeIo(files);
  const d = harvest({ rootDir: '/fake', io });

  assert.ok(d);
  assert.ok(d.toolHealth);
  assert.equal(d.toolHealth.calls, 2);
  assert.equal(d.toolHealth.failures, 1);
  assert.ok(Array.isArray(d.routingOutcomes));
  assert.equal(d.routingOutcomes.length, 1);
  assert.ok(Array.isArray(d.eloTrends));
  assert.equal(d.eloTrends[0].domain, 'javascript');
  assert.ok('proposals' in d);
});

test('harvest: io throws (missing trails) -> graceful empty digest', () => {
  const io = {
    readFileSync() {
      throw new Error('ENOENT');
    },
  };
  const d = harvest({ rootDir: '/nonexistent', io });
  assert.ok(d);
  assert.ok(d.toolHealth);
  assert.equal(d.toolHealth.calls, 0);
  assert.equal(d.recurringGaps.totalGapFindings, 0);
  assert.deepEqual(d.routingOutcomes, []);
  assert.deepEqual(d.eloTrends, []);
  assert.deepEqual(d.proposals, []);
});

test('harvest: partial missing trails (only tool-log present) -> partial digest', () => {
  const toolLog = [
    '{"phase":"post","tool":"Read","ok":true,"est_output_tokens":20}',
    '{"phase":"post","tool":"Read","ok":true,"est_output_tokens":20}',
  ].join('\n');
  const files = {
    '_byan-output/tool-log.jsonl': toolLog,
  };
  const io = makeIo(files);
  const d = harvest({ rootDir: '/fake', io });
  assert.equal(d.toolHealth.calls, 2);
  assert.equal(d.toolHealth.failures, 0);
  assert.deepEqual(d.routingOutcomes, []);
  assert.deepEqual(d.eloTrends, []);
});
