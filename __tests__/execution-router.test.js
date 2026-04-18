const ExecutionRouter = require('../src/core/dispatcher/execution-router');

describe('ExecutionRouter', () => {
  const router = new ExecutionRouter();

  test('score < 15 → main-thread', () => {
    expect(router.route({ complexity: 5 }).strategy).toBe('main-thread');
  });

  test('score 15-39 + parallelizable → agent-subagent-worktree', () => {
    const r = router.route({ complexity: 25, parallelizable: true });
    expect(r.strategy).toBe('agent-subagent-worktree');
    expect(r.parallelizable).toBe(true);
  });

  test('score 15-39 sequential → mcp-worker-haiku', () => {
    expect(router.route({ complexity: 25, parallelizable: false }).strategy).toBe(
      'mcp-worker-haiku'
    );
  });

  test('score >= 40 → main-thread-opus regardless of parallelizable', () => {
    expect(router.route({ complexity: 50, parallelizable: true }).strategy).toBe(
      'main-thread-opus'
    );
    expect(router.route({ complexity: 80, parallelizable: false }).strategy).toBe(
      'main-thread-opus'
    );
  });

  test('complexity estimated from task length when absent', () => {
    expect(router.route({ task: 'x' }).score).toBe(0);
    expect(router.route({ task: 'x'.repeat(500) }).score).toBe(50);
  });

  test('score is clamped to 100', () => {
    expect(router.route({ task: 'x'.repeat(5000) }).score).toBe(100);
  });

  test('parallelizable defaults to false for non-boolean values', () => {
    expect(router.route({ complexity: 25, parallelizable: 'yes' }).strategy).toBe(
      'mcp-worker-haiku'
    );
    expect(router.route({ complexity: 25 }).parallelizable).toBe(false);
  });

  test('every result includes score, strategy, reasoning, parallelizable', () => {
    const r = router.route({ complexity: 30, parallelizable: true });
    expect(r).toEqual(
      expect.objectContaining({
        score: expect.any(Number),
        strategy: expect.any(String),
        reasoning: expect.any(String),
        parallelizable: expect.any(Boolean),
      })
    );
  });
});
