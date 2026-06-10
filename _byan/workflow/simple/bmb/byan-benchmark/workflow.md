---
name: byan-benchmark
description: 'DATA-only benchmark engine for any decision fork: options x weighted-criteria matrix + best-first reco + dissent. Markdown fallback for non-native platforms (dual-path).'
---

# byan-benchmark Workflow (markdown fallback)

**Goal:** Given a decision fork (>=2 non-substitutable options + weighted
criteria + an optional judge panel), produce a scored options-x-criteria matrix,
a best-first recommendation, and the dissenting view - as DATA. The human gate
and the rendered table live in the orchestrating `byan-benchmark` skill, not here.

**Your Role:** You are the benchmark engine. You score; the user decides. State
mutations (FD/strict) stay out of this workflow - that is the skill's job at the
gate.

This markdown is the dual-path FALLBACK. The native engine is
`.claude/workflows/byan-benchmark.js`; `resolveWorkflow('byan-benchmark')`
prefers the `.js` and falls back to this file on platforms without the native
Workflow tool.

---

## ARGS CONTRACT

- `question` - the fork stated as a question.
- `options` - array of `{ name, note? }` (>=2 for a real benchmark).
- `criteria` - array of `{ name, weight }` (>=1).
- `judges` - optional reusable panel `[{ key, lens, weighting }]`; default a
  single neutral judge.
- `domain` - drives strict floors (`security`/`performance` -> L2, `compliance`
  -> L1).
- `scope` - `internal` (no external links, coherence-first) or `external`
  (sourcing allowed, but a URL only if opened this turn).

---

## STEPS

### 1. RECON - parse the fork

Normalise `options` to `[{name, note?}]` and `criteria` to `[{name, weight}]`
(default weight 1). The fork is **valid** only if there are >=2 distinct,
non-substitutable options AND >=1 criterion. A degenerate / obvious-default fork
is not benchmarkable - return `degenerate: true` with a reason so the skill emits
a `BYAN-BENCH:skip` marker.

### 2. SOURCE - gather evidence per option

For each option, write one evidence note per criterion. Routing decides links
before depth: `internal` stays on model-knowledge with no external links;
`external` may cite a source, but a URL appears only if WebFetch opened it this
turn - otherwise the claim is `unverified: true`. Honour the strict domain floor.

### 3. JUDGE - score each cell

Per the judge panel (default neutral), score each option on each criterion 1-10,
grade the evidence level against the 5-level rubric (L1 95% spec -> L5 20%
opinion), and compute `weightedTotal = sum(score * weight)`. A cell below the
strict-domain floor is flagged `unverified: true`.

### 4. RECOMMEND - rank best-first + dissent

Consolidate the judges into one matrix, best-first by combined weighted total.
Recommend the winner with a one-line best-first reco. Use `confidence: assertive`
only when the winner leads by a wide margin and its key cells are verified;
otherwise use `confidence: lean` (low-confidence, hedged verb). Capture the
dissent: the runner-up a reasonable judge would defend and the criterion it wins on.

---

## RETURN (DATA only)

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

No state mutation. No emoji. The skill renders the compact 1-table, emits the
BYAN-BENCH marker, and records state via MCP at the human gate.
