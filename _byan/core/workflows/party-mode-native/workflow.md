---
name: party-mode-native
description: Party Mode variant that spawns real Claude Code subagents in parallel via the Agent tool with worktree isolation. Use when a task decomposes into N independent subtasks that can truly run concurrently (separate files, separate branches, separate reasoning). Contrast with legacy party-mode which role-plays all agents in one session.
version: 1.0.0
module: core
---

# Party Mode Native (Claude Code)

## When to use this instead of legacy party-mode

Use **party-mode-native** when :

- You have N >= 2 subtasks that truly do not depend on each other.
- Each subtask owns its own files / branch / scope (no write conflicts).
- You want wall-clock savings from parallel execution, not just multi-persona discussion.

Use the **legacy party-mode** when :

- You need multi-persona discussion on a single problem.
- The agents talk to each other and to the user in a shared thread.
- No file isolation needed.

---

## Architecture

```
Main Claude (orchestrator)
  │
  ├─ spawn Agent (Explore | general-purpose | Plan | ...)
  │     isolation: worktree → branch party-mode/<session>/agent-1
  │     prompt: {role spec + output contract}
  │     writes: _byan-output/party-mode-sessions/<session>/agent-1.json
  │
  ├─ spawn Agent ... (agent-2)
  └─ spawn Agent ... (agent-N)

  (wait all complete in parallel — single tool-call block)

  aggregate results → merge → report → optional git merge of worktrees
```

---

## Protocol

### 1. Session init

Generate a session id (timestamp + short slug) and create its directory :

```
_byan-output/party-mode-sessions/<YYYYMMDD-HHmmss>-<slug>/
  ├─ briefing.json        # inputs: user goal + role specs
  ├─ agent-<role>.json    # one per subagent, filled on completion
  └─ summary.md           # aggregated report written by orchestrator
```

The orchestrator writes `briefing.json` before spawning. Each subagent
writes its own `agent-<role>.json` as its last action.

### 2. Role spec contract

For each subagent, build a spec :

```json
{
  "role": "string — short id, kebab-case",
  "subagent_type": "Explore | Plan | general-purpose | claude-code-guide",
  "isolation": "worktree",
  "branch": "party-mode/<session>/<role>",
  "goal": "string — what this agent must achieve",
  "inputs": { "...": "any relevant context" },
  "deliverables": [
    "file paths or artifacts to produce"
  ],
  "output_file": "_byan-output/party-mode-sessions/<session>/agent-<role>.json",
  "report_schema": {
    "status": "ok | partial | failed",
    "summary": "string < 200 words",
    "files_changed": ["..."],
    "next_steps": ["..."]
  }
}
```

### 3. Parallel spawn (Claude Code Agent tool)

The orchestrator dispatches all subagents **in a single message** with
multiple `Agent` tool calls. Each prompt embeds the role spec verbatim
plus the contract :

```
You are the "<role>" agent in a party-mode-native session.
Spec: <paste role spec JSON>
When done, write your report as JSON to <output_file> then reply with a
one-line confirmation. Follow report_schema exactly.
```

### 4. Aggregation

When all subagents return, the orchestrator :

1. Reads every `agent-<role>.json`.
2. Validates each against `report_schema`.
3. Writes `summary.md` with a merged view (strategy table, conflicts, next steps).
4. Optionally merges the worktree branches sequentially (NOT in parallel :
   merge conflicts must be resolved deterministically).

### 5. Exit conditions

- **All ok** → summary written, branches ready for manual merge review.
- **Any failed** → summary flags failures ; orchestrator proposes retry
  only for failed roles.
- **User aborts** → orchestrator stops any still-running subagent polling
  and writes a partial summary.

---

## Invariants

- **Never spawn a subagent that writes to the same path as another** in
  the same session. The worktree isolation prevents most conflicts but
  the orchestrator still validates non-overlapping file scopes before
  dispatching.
- **Never batch-validate** — each agent's report is validated individually
  so one malformed output doesn't invalidate the others.
- **Never auto-merge** worktree branches without human review ; party-mode
  produces parallel work, it doesn't own the integration decision.

---

## Helper API

Coordination helpers live in :

```
_byan/core/workflows/party-mode-native/coordination.js
```

Exports :

- `initSession(slug, roles)` → creates dir, writes briefing.json, returns session object
- `readAgentReport(session, role)` → parses agent-<role>.json
- `writeSummary(session, mergedReport)` → writes summary.md
- `listSessions()` → returns all past session ids

---

## Gate for using this workflow

Before invoking, answer :

1. Are there truly N independent subtasks ? (not just one task parallelized)
2. Are file scopes non-overlapping ? (list them)
3. Does each role have a crisp deliverable and acceptance criterion ?
4. Do you have budget for N × subagent-boot-cost (~5-10k tokens each) ?

If any answer is no, fall back to sequential execution or legacy
party-mode.
