/**
 * Execution strategy router.
 *
 * Decides WHERE a task runs (not which model). Four strategies, routed by
 * complexity score and whether the task is parallelizable with siblings:
 *
 *   main-thread              score < 15
 *   agent-subagent-worktree  score 15-39 + parallelizable = true
 *   mcp-worker-haiku         score 15-39 + sequential
 *   main-thread-opus         score >= 40
 *
 * Complementary to EconomicDispatcher (which picks the model).
 */

class ExecutionRouter {
  /**
   * @param {{task?: string, complexity?: number, parallelizable?: boolean}} input
   * @returns {{score: number, strategy: string, reasoning: string, parallelizable: boolean}}
   */
  route(input = {}) {
    const { task, complexity, parallelizable } = input;

    const score =
      typeof complexity === 'number'
        ? complexity
        : Math.min(100, Math.floor((task?.length || 0) / 10));

    const isPar = parallelizable === true;

    if (score < 15) {
      return {
        score,
        strategy: 'main-thread',
        reasoning: `Score ${score} < 15. Inline in current context, no delegation overhead.`,
        parallelizable: isPar,
      };
    }

    if (score < 40 && isPar) {
      return {
        score,
        strategy: 'agent-subagent-worktree',
        reasoning: `Score ${score} + parallelizable. Spawn Claude Code Agent tool with worktree isolation.`,
        parallelizable: isPar,
      };
    }

    if (score < 40) {
      return {
        score,
        strategy: 'mcp-worker-haiku',
        reasoning: `Score ${score}, sequential. Delegate to lightweight Haiku worker via MCP.`,
        parallelizable: isPar,
      };
    }

    return {
      score,
      strategy: 'main-thread-opus',
      reasoning: `Score ${score} >= 40. Complex task, keep in main thread with Opus reasoning.`,
      parallelizable: isPar,
    };
  }
}

module.exports = ExecutionRouter;
