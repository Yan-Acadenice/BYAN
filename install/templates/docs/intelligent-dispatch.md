# Intelligent dispatch — Codex/Claude routing + architect-dev loop

Route each task to the runtime that is genuinely better for it (Codex or Claude),
on the right model and effort for its complexity, and let an architect (Claude)
and a dev (Codex or Claude) exchange turn by turn until the work converges.

This is "option B": a deterministic orchestration loop (the durable, testable
backbone), with the Codex transport behind a swappable adapter so the tighter
`codex mcp-server` coupling can slot in later without touching the core.

## The routing table (cross-checked, 5 independent sources)

| Task nature | Runtime | Why |
|-------------|---------|-----|
| execution / shell / terminal / deploy / devops / CI / scripting / browser / automation | Codex | Codex leads autonomous execution, terminal-task benchmarks, browser/computer use |
| architecture / design / planning / refactor / quality / analysis / exploration / anything unknown | Claude | Claude leads planning, repo-scale refactor, code quality ; unknown stays on Claude (safe default) |
| verification / review / validate / audit / qa | Claude (hard rule) | A runtime must not grade its own work |

The raw "who is better overall" score (SWE-bench Verified) is a near tie whose
leader flips by leaderboard, so it is left out of the routing signal — only the
task-type signal is used, which is stable across sources.

## Model and effort by complexity

- **Claude side**: complexity picks the model on a four-rung ladder (v3) —
  low -> haiku, medium -> sonnet, high -> opus, extreme -> fable (last resort,
  ~2x Opus price). There is no separate effort knob on Claude: the model tier IS
  the effort. This is a per-task RECOMMENDATION, not a live switch of the running
  session model (Claude Code exposes no such switch).
- **Codex side**: fixed model (`gpt-5.4`, the entitled subscription model) with a
  real reasoning-effort knob — low / medium / high — scaled to complexity via
  `codex exec -c model_reasoning_effort=...`.

## The three red lines (enforced in code, not left to the caller)

1. **No Fable on Codex.** `assertNoFable` throws rather than emit a Fable model on
   the Codex path (Codex runs the ChatGPT-subscription model and cannot run a
   Claude model). On the Claude path Fable IS allowed, but only at the extreme
   complexity rung (v3 product reversal — the old blanket ban is lifted).
2. **Verification stays on Claude.** The router forces a verification nature to
   Claude ; the orchestrator re-asserts it and throws if it ever regresses.
3. **Codex does not write.** Codex runs read-only and returns a unified diff ;
   Claude applies it with `git apply`. This works under a locked-down sandbox
   (e.g. Landlock) and keeps the apply + later verification on Claude.

## How the agents "talk" (the honest live-chat answer)

There is no simultaneous free-form chat between two models — that does not exist
natively. What delivers the same outcome is a turn-by-turn loop through a shared
board, like a chat server holding a conversation:

1. The architect (Claude) posts the design to the board.
2. The dev (Codex or Claude) reads the board, does the work, posts a result — or
   a question.
3. If there is an open question, the architect answers ; the loop continues.
4. Convergence when the dev delivers a result with no open question (or a round
   cap is hit). If the dev runtime fails (Codex unavailable/errored), the loop
   reports `dev-failed` so the caller falls back to Claude.

## Files

| File | Role |
|------|------|
| `lib/dispatch-router.js` | F1 — pure routing brain (nature+complexity -> runtime+model+effort) |
| `lib/codex-bridge.js` | F2 — Codex transport: `codex exec` -> diff, `git apply`, adapter seam (exec shipped, mcp a V2 slot) |
| `lib/dispatch-blackboard.js` | F3 — the turn-by-turn shared board (build/render pure, JSONL I/O isolated) |
| `lib/dispatch-orchestrator.js` | F4 — the loop core (routes, runs architect<->dev, converges) ; executors injected |
| `.claude/workflows/intelligent-dispatch.js` | Native launch facade for one routed task (design -> implement -> verify) |

All four libs are pure/injectable and unit-tested under `test/dispatch-*.test.js`
and `test/codex-bridge.test.js`.

## Launching it

The orchestrator runs as full Node on the main thread (or an MCP worker), because
a native workflow script has no imports and no filesystem — it cannot use these
libs directly. So the main-thread FD / hermes skill decides routing with F1,
provides the executors (a Claude subagent for Claude turns, the Codex bridge for
Codex turns), and drives `orchestrate({ tasks, executors })`. The native workflow
script `intelligent-dispatch.js` is the thin facade for the single-task case: its
dev leaf holds the Bash tool and is what actually invokes `codex exec`.

## V2 slot — tighter coupling

`getAdapter('codex-mcp')` is a declared but unavailable adapter. When
`codex mcp-server` is wired, Codex becomes a tool Claude can call mid-reasoning
(and Codex can call BYAN tools back) — the closest thing to live. It drops in as a
new transport behind the same F2 seam, with no change to F1 or the loop.
