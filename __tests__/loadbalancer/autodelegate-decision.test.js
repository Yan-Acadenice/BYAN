const {
  looksDelegable,
  decideAutodelegation,
  renderNudge,
  DEFAULT_THRESHOLD,
  DEFAULT_INVOCATION,
} = require('../../.claude/hooks/lib/autodelegate-decision');

// Pure decision core for Codex auto-delegation. Given the user's request text
// and the (estimated) Claude 5h usage, it decides whether BYAN should be nudged
// to hand the task to Codex — and whether to propose delegating EVERYTHING
// delegable (pressure mode) or just this task. It never decides to cross the red
// line: only delegable natures are ever proposed; judgment/soul/verify stay on
// Claude. It is pure (no I/O) so the hook can be a thin shell over it.

describe('loadbalancer/autodelegate-decision', () => {
  describe('looksDelegable (heuristic)', () => {
    test('coding verbs -> delegable', () => {
      expect(looksDelegable('implémente une fonction de tri')).toBe(true);
      expect(looksDelegable('write a parser module')).toBe(true);
      expect(looksDelegable('fix the failing test')).toBe(true);
      expect(looksDelegable('refactor this file')).toBe(true);
    });
    test('judgment / conversational -> not delegable', () => {
      expect(looksDelegable('what do you think of this architecture?')).toBe(false);
      expect(looksDelegable('explique-moi pourquoi ça sature')).toBe(false);
      expect(looksDelegable('')).toBe(false);
    });
  });

  describe('decideAutodelegation', () => {
    test('disabled config -> never delegate', () => {
      const d = decideAutodelegation({ requestText: 'write code', usage: { pct: 95 }, config: { enabled: false } });
      expect(d.delegate).toBe(false);
      expect(d.mode).toBe('off');
    });

    test('pressure at/above threshold -> mode all (propose delegating everything delegable)', () => {
      const d = decideAutodelegation({ requestText: 'anything', usage: { pct: 80 }, config: {} });
      expect(d.delegate).toBe(true);
      expect(d.mode).toBe('all');
      expect(d.pct).toBe(80);
      expect(d.invocation).toBe(DEFAULT_INVOCATION);
    });

    test('below threshold but delegable task -> mode delegable-only', () => {
      const d = decideAutodelegation({ requestText: 'implémente le module X', usage: { pct: 40 }, config: {} });
      expect(d.delegate).toBe(true);
      expect(d.mode).toBe('delegable-only');
    });

    test('below threshold and not delegable -> no nudge', () => {
      const d = decideAutodelegation({ requestText: 'what do you think?', usage: { pct: 40 }, config: {} });
      expect(d.delegate).toBe(false);
      expect(d.mode).toBe('none');
    });

    test('no usage gauge (pct null) falls back to nature only', () => {
      const del = decideAutodelegation({ requestText: 'write a function', usage: { pct: null }, config: {} });
      expect(del.delegate).toBe(true);
      expect(del.mode).toBe('delegable-only');
      const no = decideAutodelegation({ requestText: 'hello', usage: null, config: {} });
      expect(no.delegate).toBe(false);
    });

    test('custom threshold is honored', () => {
      const d = decideAutodelegation({ requestText: 'x', usage: { pct: 60 }, config: { threshold: 50 } });
      expect(d.mode).toBe('all');
    });

    test('the reason always names the red line (delegable-only, never judgment)', () => {
      const d = decideAutodelegation({ requestText: 'write code', usage: { pct: 90 }, config: {} });
      expect(d.redLine).toMatch(/judgment|jugement|verify|soul/i);
    });

    test('default threshold is 80', () => {
      expect(DEFAULT_THRESHOLD).toBe(80);
    });
  });

  describe('perf routing (F3, opt-in, off by default)', () => {
    // category chosen to NOT overlap the delegable-verb heuristic, so it isolates
    // the perf branch (a 'mockup' is not a coding verb).
    const forces = [{ category: 'ui-mockup', pattern: 'mockup|wireframe', favors: 'codex' }];
    test('off by default -> no perf-routed delegation even if forces would match', () => {
      const d = decideAutodelegation({ requestText: 'a mockup of the dashboard', usage: { pct: 10 }, config: { perfForces: forces } });
      expect(d.mode).not.toBe('perf-routed');
      expect(d.delegate).toBe(false);
    });
    test('enabled + forces favor codex -> mode perf-routed (below pressure, non-verb task)', () => {
      const d = decideAutodelegation({ requestText: 'a mockup of the dashboard', usage: { pct: 10 }, config: { perfRouting: true, perfForces: forces } });
      expect(d.delegate).toBe(true);
      expect(d.mode).toBe('perf-routed');
      expect(d.reason).toMatch(/heuristic/i);
    });
    test('nature still wins over perf when both apply', () => {
      const d = decideAutodelegation({ requestText: 'write the mockup module', usage: { pct: 10 }, config: { perfRouting: true, perfForces: forces } });
      expect(d.mode).toBe('delegable-only');
    });
    test('pressure still wins over perf', () => {
      const d = decideAutodelegation({ requestText: 'a mockup of the dashboard', usage: { pct: 90 }, config: { perfRouting: true, perfForces: forces } });
      expect(d.mode).toBe('all');
    });
  });

  describe('renderNudge', () => {
    test('no delegation -> empty string (hook injects nothing)', () => {
      expect(renderNudge({ delegate: false })).toBe('');
      expect(renderNudge(null)).toBe('');
    });
    test('delegable-only -> advisory nudge naming the invocation, subscription and red line', () => {
      const d = decideAutodelegation({ requestText: 'write code', usage: { pct: 42 }, config: {} });
      const txt = renderNudge(d);
      expect(txt).toContain(DEFAULT_INVOCATION);
      expect(txt).toMatch(/no API credit|subscription/i);
      expect(txt).toMatch(/red line/i);
      expect(txt).toContain('~42%');
    });
    test('mode all -> proposes offloading everything delegable', () => {
      const d = decideAutodelegation({ requestText: 'x', usage: { pct: 90 }, config: {} });
      expect(renderNudge(d)).toMatch(/ALL delegable/i);
    });
  });
});
