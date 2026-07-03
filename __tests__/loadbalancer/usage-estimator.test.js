const {
  normalizeSession,
  sumWindowTokens,
  estimatePct,
  sumTokensFromUsage,
  sumTranscriptWindow,
  estimateClaudeUsage,
  FIVE_HOURS_MS,
} = require('../../.claude/hooks/lib/usage-estimator');

// The usage estimator reads Claude Code's LOCAL usage accounting
// (~/.claude/usage-data/session-meta/*.json) and estimates how many tokens were
// spent inside the rolling 5h window. It is an ESTIMATE (no provider exposes a
// machine-readable 5h quota) — the tests pin the pro-rata math and the honest
// degradation, not an exact Anthropic figure. All I/O is injected so the suite
// never touches the real home dir.

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-07-03T12:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();

describe('loadbalancer/usage-estimator', () => {
  describe('normalizeSession (pure)', () => {
    test('maps a well-formed meta to { startMs, endMs, tokens }', () => {
      const meta = {
        start_time: iso(NOW - 2 * HOUR),
        duration_minutes: 60,
        input_tokens: 1000,
        output_tokens: 500,
      };
      const s = normalizeSession(meta);
      expect(s.startMs).toBe(NOW - 2 * HOUR);
      expect(s.endMs).toBe(NOW - 2 * HOUR + 60 * 60 * 1000);
      expect(s.tokens).toBe(1500);
    });

    test('missing token fields default to 0, never NaN', () => {
      const s = normalizeSession({ start_time: iso(NOW), duration_minutes: 0 });
      expect(s.tokens).toBe(0);
      expect(s.endMs).toBe(s.startMs);
    });

    test('invalid / missing start_time yields null (skipped upstream)', () => {
      expect(normalizeSession({ duration_minutes: 10, input_tokens: 5 })).toBeNull();
      expect(normalizeSession({ start_time: 'not-a-date' })).toBeNull();
      expect(normalizeSession(null)).toBeNull();
    });
  });

  describe('sumWindowTokens (pure, pro-rata overlap)', () => {
    test('a session fully inside the window counts all its tokens', () => {
      const sessions = [{ startMs: NOW - 2 * HOUR, endMs: NOW - 1 * HOUR, tokens: 1000 }];
      expect(sumWindowTokens(sessions, NOW, FIVE_HOURS_MS)).toBe(1000);
    });

    test('a session fully OUTSIDE the window counts zero', () => {
      const sessions = [{ startMs: NOW - 10 * HOUR, endMs: NOW - 6 * HOUR, tokens: 1000 }];
      expect(sumWindowTokens(sessions, NOW, FIVE_HOURS_MS)).toBe(0);
    });

    test('a session straddling the window edge is pro-rated by time overlap', () => {
      // window = [NOW-5h, NOW]. Session spans NOW-6h..NOW-4h (2h), of which only
      // the last 1h (NOW-5h..NOW-4h) is inside -> 50% of tokens.
      const sessions = [{ startMs: NOW - 6 * HOUR, endMs: NOW - 4 * HOUR, tokens: 1000 }];
      expect(sumWindowTokens(sessions, NOW, FIVE_HOURS_MS)).toBe(500);
    });

    test('a zero-duration session counts fully if its instant is in the window, else zero', () => {
      const inside = [{ startMs: NOW - 1 * HOUR, endMs: NOW - 1 * HOUR, tokens: 300 }];
      const outside = [{ startMs: NOW - 8 * HOUR, endMs: NOW - 8 * HOUR, tokens: 300 }];
      expect(sumWindowTokens(inside, NOW, FIVE_HOURS_MS)).toBe(300);
      expect(sumWindowTokens(outside, NOW, FIVE_HOURS_MS)).toBe(0);
    });

    test('multiple sessions accumulate', () => {
      const sessions = [
        { startMs: NOW - 2 * HOUR, endMs: NOW - 1 * HOUR, tokens: 1000 },
        { startMs: NOW - 1 * HOUR, endMs: NOW, tokens: 500 },
      ];
      expect(sumWindowTokens(sessions, NOW, FIVE_HOURS_MS)).toBe(1500);
    });
  });

  describe('estimatePct (pure)', () => {
    test('no budget -> pct null, confidence none (honest: we do not know the ceiling)', () => {
      expect(estimatePct(50000, null)).toEqual({ pct: null, confidence: 'none' });
      expect(estimatePct(50000, 0)).toEqual({ pct: null, confidence: 'none' });
    });

    test('with a budget -> pct is a low-confidence estimate, clamped to [0,100]', () => {
      expect(estimatePct(40000, 100000)).toEqual({ pct: 40, confidence: 'low' });
      expect(estimatePct(150000, 100000)).toEqual({ pct: 100, confidence: 'low' });
      expect(estimatePct(0, 100000)).toEqual({ pct: 0, confidence: 'low' });
    });
  });

  describe('sumTokensFromUsage (pure)', () => {
    test('fresh tokens full weight, cache reads weighted down (0.1)', () => {
      const usage = {
        input_tokens: 100, output_tokens: 50,
        cache_creation_input_tokens: 30, cache_read_input_tokens: 200,
      };
      // fresh 180 + 0.1*200 (=20) = 200
      expect(sumTokensFromUsage(usage)).toBe(200);
    });
    test('missing / non-object usage -> 0, never NaN', () => {
      expect(sumTokensFromUsage(null)).toBe(0);
      expect(sumTokensFromUsage({})).toBe(0);
      expect(sumTokensFromUsage({ input_tokens: 'x' })).toBe(0);
    });
  });

  describe('sumTranscriptWindow (pure)', () => {
    const line = (tsMs, tokens, type = 'assistant') => ({
      type, timestamp: iso(tsMs), message: { usage: { input_tokens: tokens, output_tokens: 0 } },
    });
    test('counts only assistant messages inside the window', () => {
      const events = [
        line(NOW - 1 * HOUR, 100),
        line(NOW - 8 * HOUR, 999), // outside
        line(NOW - 2 * HOUR, 50),
        { type: 'user', timestamp: iso(NOW - 1 * HOUR) }, // not assistant
      ];
      const r = sumTranscriptWindow(events, NOW, FIVE_HOURS_MS);
      expect(r.tokens).toBe(150);
      expect(r.messagesCounted).toBe(2);
    });
    test('tolerates events without usage or timestamp', () => {
      const events = [
        { type: 'assistant', message: {} },
        { type: 'assistant', timestamp: 'bad', message: { usage: { input_tokens: 5 } } },
        line(NOW - 30 * 60 * 1000, 10),
      ];
      const r = sumTranscriptWindow(events, NOW, FIVE_HOURS_MS);
      expect(r.tokens).toBe(10);
      expect(r.messagesCounted).toBe(1);
    });
  });

  describe('estimateClaudeUsage — transcript source (live, preferred)', () => {
    // fake fs exposing ~/.claude/projects/<hash>/<session>.jsonl
    const makeTranscriptFs = (jsonlByPath) => ({
      existsSync: (p) => p.endsWith('/projects') || p in jsonlByPath || Object.keys(jsonlByPath).some((f) => f.startsWith(p)),
      readdirSync: (p) => {
        if (p.endsWith('/projects')) return ['proj-hash'];
        if (p.endsWith('/proj-hash')) return Object.keys(jsonlByPath).map((f) => f.split('/').pop());
        return [];
      },
      statSync: () => ({ mtimeMs: NOW }),
      readFileSync: (p) => {
        const key = Object.keys(jsonlByPath).find((f) => f === p || f.endsWith('/' + p.split('/').pop()));
        if (!key) throw new Error('ENOENT');
        return jsonlByPath[key];
      },
    });

    test('prefers the live transcript signal over session-meta (captures the in-progress session)', () => {
      const jsonl = {
        '/home/.claude/projects/proj-hash/live.jsonl': [
          JSON.stringify({ type: 'assistant', timestamp: iso(NOW - 30 * 60 * 1000), message: { usage: { input_tokens: 2000, output_tokens: 500 } } }),
          JSON.stringify({ type: 'assistant', timestamp: iso(NOW - 10 * 60 * 1000), message: { usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0 } } }),
          'garbage line that is not json',
        ].join('\n'),
      };
      const r = estimateClaudeUsage({ home: '/home', now: NOW, budget: 100000, fs: makeTranscriptFs(jsonl) });
      expect(r.source).toBe('transcript');
      expect(r.estimatedTokens).toBe(4000);
      expect(r.messagesCounted).toBe(2);
      expect(r.pct).toBe(4);
      expect(r.confidence).toBe('low');
    });
  });

  describe('estimateClaudeUsage (I/O shell, injected fs)', () => {
    const makeFs = (files) => ({
      existsSync: (p) => p in files || Object.keys(files).some((f) => f.startsWith(p)),
      readdirSync: () => Object.keys(files).map((f) => f.split('/').pop()),
      readFileSync: (p) => {
        const key = Object.keys(files).find((f) => f === p || f.endsWith('/' + p.split('/').pop()));
        if (!key) throw new Error('ENOENT');
        return JSON.stringify(files[key]);
      },
    });

    test('absent home / usage-data -> honest degraded result (pct null, source none)', () => {
      const fs = { existsSync: () => false, readdirSync: () => [], readFileSync: () => { throw new Error('ENOENT'); } };
      const r = estimateClaudeUsage({ home: '/nope', now: NOW, budget: 100000, fs });
      expect(r.estimatedTokens).toBe(0);
      expect(r.pct).toBeNull();
      expect(r.source).toBe('none');
      expect(r.confidence).toBe('none');
    });

    test('reads session-meta files and sums the rolling window', () => {
      const files = {
        '/home/.claude/usage-data/session-meta/a.json': {
          start_time: iso(NOW - 2 * HOUR), duration_minutes: 60, input_tokens: 1000, output_tokens: 500,
        },
        '/home/.claude/usage-data/session-meta/b.json': {
          start_time: iso(NOW - 10 * HOUR), duration_minutes: 60, input_tokens: 9999, output_tokens: 9999,
        },
      };
      const r = estimateClaudeUsage({ home: '/home', now: NOW, budget: 100000, fs: makeFs(files) });
      expect(r.estimatedTokens).toBe(1500); // b.json is outside the 5h window
      expect(r.pct).toBe(2);
      expect(r.source).toBe('session-meta');
      expect(r.confidence).toBe('low');
      expect(r.sessionsCounted).toBe(1);
    });

    test('a corrupt meta file is skipped, not fatal', () => {
      const fs = {
        existsSync: () => true,
        readdirSync: () => ['good.json', 'bad.json'],
        readFileSync: (p) => {
          if (p.endsWith('bad.json')) return '{ not json';
          return JSON.stringify({ start_time: iso(NOW - 1 * HOUR), duration_minutes: 30, input_tokens: 200, output_tokens: 100 });
        },
      };
      const r = estimateClaudeUsage({ home: '/home', now: NOW, budget: 100000, fs });
      expect(r.estimatedTokens).toBe(300);
      expect(r.sessionsCounted).toBe(1);
    });
  });
});
