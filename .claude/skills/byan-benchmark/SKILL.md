---
name: byan-benchmark
description: Orchestrating conductor for the native byan-benchmark engine. Detects a real decision fork (>=2 non-substitutable options that diverge on >=1 weighted criterion), runs the autonomous DATA-only matrix engine (.claude/workflows/byan-benchmark.js) via the Workflow tool, renders the compact 1-table best-first, and emits the BYAN-BENCH marker so the auto-benchmark Stop hook is satisfied. Invoke when you are about to present a choice between options, when the user says "benchmark X vs Y", "compare these approaches", "which option", or when the auto-benchmark doctrine arms on a fork.
---

# byan-benchmark - Conductor (gate outside, engine inside)

You are the human-gated conductor for the native byan-benchmark workflow. The
autonomous scoring runs in `.claude/workflows/byan-benchmark.js` (the in-CLI
Workflow tool); YOU own the fork detection, the rendered table, the BYAN-BENCH
marker, and any FD/strict state. This split is the Hybrid pattern: the engine is
native and deterministic, the gate stays on a real main-thread turn where the
BYAN hooks fire.

## Why this skill exists

A launched Workflow script is autonomous: it cannot pause to ask a human, the
main-thread hooks (including the auto-benchmark Stop hook) do not fire inside it,
and it must not mutate BYAN state on its own. So the script returns a DATA matrix;
this skill turns that data into a rendered, gated decision and emits the marker.

## Protocol

### 1. Detect the fork + gates

Apply the 2-gate trigger before launching anything:

- **G1** - there are >=2 non-trivial, non-substitutable options.
- **G2** - the options diverge on >=1 weighted criterion (if they are coherent
  with the locked stack, there is nothing to benchmark).

NEVER benchmark a y/n confirm, a destructive prompt (delete/drop/rm -rf/
overwrite/force push/reset --hard), or a trivial ack. For the degenerate /
obvious-default case, do NOT table it - emit the skip marker (see step 5b).

Routing decides links BEFORE depth decides verbosity:
- `scope: internal` (within the existing repo/stack) - NO external links,
  coherence-first.
- `scope: external` (a new dependency / vendor / standard) - sourcing allowed,
  but a URL appears ONLY if WebFetch opened it THIS turn; otherwise `[UNVERIFIED]`.

### 2. Run the engine (dual-path)

Prefer the native script. If `.claude/workflows/byan-benchmark.js` exists, run it
via the Workflow tool; otherwise fall back to the markdown workflow
(`_byan/workflow/simple/bmb/byan-benchmark/workflow.md`). The programmatic
resolver is `resolveWorkflow('byan-benchmark')` in
`_byan/mcp/byan-mcp-server/lib/workflows-generator.js`.

```
Workflow({ name: 'byan-benchmark', args: {
  question: '<the fork as a question>',
  options:  [{ name: 'Option A', note: '...' }, { name: 'Option B', note: '...' }],
  criteria: [{ name: 'C1 ...', weight: 2 }, { name: 'C2 ...', weight: 1 }],
  judges:   [ /* optional opposed-lens panel; omit for a single neutral judge */ ],
  domain:   'general | security | performance | compliance',
  scope:    'internal | external'
} })
```

The script runs RECON -> SOURCE -> JUDGE -> RECOMMEND and returns DATA only:

```json
{ "workflow": "byan-benchmark", "question": "...", "scope": "internal",
  "domain": "general", "options": [...], "criteria": [...],
  "matrix": [{ "option": "...", "cells": [{ "criterion": "...", "verdict": "...",
               "level": "L2", "score": 8, "source": "...", "unverified": false }],
             "total": 0 }],
  "recommendation": { "best": "...", "line": "...", "confidence": "assertive|lean" },
  "dissent": { "option": "...", "why": "..." },
  "degenerate": false, "needsHumanGate": true }
```

### 3. (BYAN only, opt-in) enrich cells with byan_fc_check

This step is BYAN-only - other platforms skip it. For each cell whose `verdict`
is a HARD CLAIM (a factual assertion in security / performance / compliance, or
any absolute), call the MCP tool to raise the cell's authority:

```
mcp__byan__byan_fc_check({ text: '<the cell claim>' })  ->  { level, score, ... }
```

Stamp the returned `{ level, score }` onto the cell's `level` column. This makes
the Niv column an audited evidence level, not a self-graded one. Respect the
strict-domain floors: a `security`/`performance` claim below L2, or a
`compliance` claim below L1, stays flagged `[UNVERIFIED]`. Enrichment is opt-in;
skip it for low-stakes internal forks to keep latency down.

### 4. Render the compact 1-table (best-first)

Render ONE compact table, ordered best-first, within the hard caps:

- **<= 4 options**, **<= 4 criteria**, **<= 3 links**, **1 screen**.

```
| Option   | C1 ... | C2 ... | C3 ... | Niv |
|----------|--------|--------|--------|-----|
| A (best) | ...    | ...    | ...    | L2  |
| B        | ...    | ...    | ...    | L4  |

Reco: <recommendation.line>   (confidence: <assertive recommend X | lean X, low-confidence>)
Dissent: <dissent.option> wins on <dissent.why>.
```

The confidence verb is load-bearing: `assertive` -> "recommend X"; `lean` ->
"lean X (low-confidence)". A URL appears ONLY if WebFetch opened it this turn;
otherwise tag the cell `[UNVERIFIED]` and cite from model-knowledge.

### 5. Emit the BYAN-BENCH marker (satisfies the Stop hook)

#### 5a. Real benchmark presented

On the SAME turn that shows the table, emit the marker verbatim on a single
line, IMMEDIATELY BEFORE the table (so it survives truncation):

```
<!-- BYAN-BENCH:done g1=<#options> g2=<#divergent-criteria> scope=<internal|external> conf=<assertive|lean> -->
```

`g1` >= 2 and `g2` >= 1 or the marker is invalid.

#### 5b. Degenerate / deliberate skip

If the engine returned `degenerate: true`, or the fork is an obvious-default /
confirm / destructive / already-coherent case, do NOT table it - emit the skip
marker instead (a positive signal that the fork was CONSIDERED and deliberately
not tabled):

```
<!-- BYAN-BENCH:skip reason=<obvious-default|never-listed|escape-hatch|already-coherent> -->
```

### 6. Expanded form (named trigger)

The default is the compact 1-table. If the user types `[bench:expand]`, render
the expanded form: full per-judge scorecards, every cell's evidence and source,
and the dissent rationale in full. Still emit the `done` marker.

### 7. Record the run (only after the gate)

After the user acts on the recommendation, if inside an FD or strict session,
record the outcome through the `byan_fd_*` / `byan_strict_*` MCP tools so the
audit trail stays in the MCP authority. Do NOT write FD/strict state files
directly. The auto-benchmark miss-ledger
(`_byan-output/benchmark-ledger.jsonl`) is appended by the Stop hook, not by
this skill.

## Invariants

- The script returns DATA; THIS skill owns rendering, the marker, completion and
  state. (Enforcement contract: see `docs/native-workflows-contract.md`.)
- The human gate stays on a real main-thread turn, outside the script.
- Dual-path: native `.js` preferred, markdown fallback. No silent downgrade.
- No fabricated URL: `[UNVERIFIED]` unless WebFetch opened it this turn.
- Strict-domain floors: security/performance L2+, compliance L1.
- Escape-hatch respected: if `.byan-autobench/off` is present (or the
  cross-session opt-out is set), the doctrine does not force a benchmark.
- No emoji in outputs (IA-23). Comments/notes justify the WHY only (IA-24).
