---
name: byan-orchestrate
description: Orchestrate a complex multi-role task across the BYAN roster with token-optimal model assignment and parallel execution. Use when a single task decomposes into 2+ distinct roles (e.g. "design + code + test", "analyst + architect + dev"), when you want to run BMAD specialists in parallel, or when you need a structured plan with per-role model choice before spawning. Extends byan-hermes-dispatch from 1-shot to N-role workflows. Keyword triggers : orchestrate, multi-role, team, BMAD team, advanced workflow.
---

# BYAN Advanced Orchestrator

You compose three existing building blocks into one multi-role flow :

| Block | Role |
|-------|------|
| `byan_dispatch` MCP tool | Per-task execution strategy (main-thread / agent-subagent-worktree / mcp-worker-haiku / main-thread-opus) + complexity score |
| `byan-hermes-dispatch` skill | Specialist lookup (architect, dev, analyst, …) from a routing table |
| `party-mode-native` workflow | Parallel spawn via Agent tool + worktree + coordination JSON |

Your job : **minimize total tokens while keeping the deliverable correct**. That means picking the cheapest model that can do each role, parallelizing where safe, and never spawning a subagent when inline is enough.

## Protocol

### 1. Decompose the user task into roles

Output a role list of the form :
```json
[
  { "role": "analyst", "goal": "understand market/users", "parallelizable_with": ["architect"] },
  { "role": "architect", "goal": "pick tech stack + shape", "parallelizable_with": ["analyst"] },
  { "role": "dev", "goal": "implement feature X", "parallelizable_with": [] },
  { "role": "quinn", "goal": "validate with tests", "parallelizable_with": [] }
]
```

Ask the user to validate the role list before spawning (show it as a table). Do NOT auto-execute a 4-agent team without a yes.

### 2. Pick model per role (token optimization)

Use this a priori mapping — override only if the task clearly needs more :

| Role category | Default model | Rationale |
|---|---|---|
| analyst, pm, sm, ux-designer, tech-writer, brainstorming-coach, storyteller | sonnet | Text structuring, not deep reasoning |
| dev, quick-flow-solo-dev | sonnet | Code generation, mid complexity |
| architect, quinn, tea, creative-problem-solver | opus | Deep reasoning, trade-offs |
| carmack, rachid, marc, patnote | haiku | Narrow mechanical tasks |

Then call `byan_dispatch` with each role's goal to get a complexity score. If the score demands a different tier (score >= 40 → bump to opus ; score < 15 → inline, no subagent), **override the default for that role**.

### 3. Compute the execution plan

For each role, combine the model and the dispatch strategy to produce :

```json
{
  "role": "dev",
  "model": "sonnet",
  "strategy": "agent-subagent-worktree",
  "score": 28,
  "parallelizable_with": ["quinn"],
  "estimated_tokens": 8000
}
```

`estimated_tokens` : rough = `model_boot_tokens + goal.length / 4 * 3`. `model_boot_tokens` ≈ 5000 (Haiku), 7000 (Sonnet), 10000 (Opus).

Sum over all roles = **session budget estimate**. Show this to the user before spawning.

### 4. Spawn

Group roles by `parallelizable_with` graph. For each parallel cluster :

- If cluster has N > 1 roles AND all use `agent-subagent-worktree` strategy → use the **party-mode-native** workflow : `coordination.initSession(roles, …)`, then dispatch all Agent tool calls in a single message.
- If cluster has N = 1 OR strategy = `main-thread` → execute inline in the current turn.
- If strategy = `mcp-worker-haiku` → spawn an Agent tool call WITHOUT worktree (faster boot, single-turn).

For each Agent tool call, the prompt must start with :
```
You are acting as the <role> BMAD agent. Load your persona from
.github/agents/bmad-agent-<role>.md (read it first, then respond in
character). Task: <goal>. Deliverables: <list>. Report back as JSON
with status/summary/files_changed per the party-mode-native contract.
```

### 5. Aggregate and report

After all subagents return (or inline roles finish), read each `agent-<role>.json` via `coordination.readAgentReport`, then write `summary.md` via `coordination.writeSummary`. Report to the user :

| Role | Model | Strategy | Tokens spent | Outcome |
|------|-------|----------|--------------|---------|
| analyst | sonnet | worktree | 7200 | ok |
| architect | opus | worktree | 11500 | ok |
| dev | sonnet | worktree | 9800 | ok |
| quinn | opus | main-thread | 6400 | ok |

Total tokens : 34900. Deliverable : <link to aggregated output>.

## Invariants

- **Never spawn without showing the plan first.** The user must see role × model × strategy before a single Agent tool call fires.
- **Never default to opus.** Opus is opt-in via high complexity score or explicit role mapping. Default = sonnet, upgrade only with justification in the plan.
- **Never parallel-spawn roles that write to the same paths.** If file scopes overlap, serialize them even if `parallelizable_with` suggests otherwise.
- **Never ship a plan without `estimated_tokens` per role.** Budget visibility is the whole point.
