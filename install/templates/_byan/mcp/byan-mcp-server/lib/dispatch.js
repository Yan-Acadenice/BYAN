export function dispatch({ task, complexity, parallelizable }) {
  const score =
    typeof complexity === 'number'
      ? complexity
      : Math.min(100, Math.floor((task?.length || 0) / 10));
  const isPar = parallelizable === true;

  let route, reasoning;
  if (score < 15) {
    route = 'main-thread';
    reasoning = `Score ${score} < 15. Inline in current context, no delegation overhead.`;
  } else if (score < 40 && isPar) {
    route = 'agent-subagent-worktree';
    reasoning = `Score ${score} + parallelizable. Spawn Claude Code Agent tool with worktree isolation.`;
  } else if (score < 40) {
    route = 'mcp-worker-haiku';
    reasoning = `Score ${score}, sequential. Delegate to lightweight Haiku worker via MCP.`;
  } else {
    route = 'main-thread-opus';
    reasoning = `Score ${score} >= 40. Complex task, keep in main thread with Opus reasoning.`;
  }
  return { score, route, reasoning, parallelizable: isPar };
}
