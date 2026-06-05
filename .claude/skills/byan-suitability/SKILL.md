---
name: byan-suitability
description: Advisory model-suitability ledger — record adversarial verdicts, read learned ratings, human decides downgrades
---

# BYAN Model-Suitability Ledger (advisory)

This skill operates the model-suitability ledger: a registry, keyed by
`(model x leaf)`, that learns from outcomes whether a CHEAP model is safe on a
given workflow leaf. It is the learning layer that sits ABOVE the static
conservative default and the linter floor — it does not weaken either. It only
advises; a human decides whether to keep, watch, or demote a downgrade.

## What this is NOT

- It does not edit `.claude/workflows/*.js`. Zero auto-edit of routing.
- It does not touch the linter floor (`workflows-lint.js`). The floor still
  blocks a protected-leaf downgrade at commit time, regardless of the ledger.
- It does not auto-promote or auto-demote. The verdict is a recommendation for a
  human, not an action. (Auto-promotion is a deferred phase-2 capability and was
  deliberately killed in design review: a hot-hand streak must not slip a
  downgrade past human review.)

## The math (why a thin sample does not say "keep")

Each `(model x leaf)` pair holds a Beta-Bernoulli posterior over the cheap
model's adequacy rate. The verdict reads the credible interval, not the point
estimate:

- `keep-cheap` — the credible LOWER bound is at or above the keep threshold
  (default 0.85). Only sustained success earns this (~30 clean outcomes).
- `demote` — the credible UPPER bound is at or below the demote threshold
  (default 0.70). Clear evidence the cheap model fails too often.
- `watch` — anything in between, including every thin sample. A wide interval
  (low n) lands here, so "92% over 3 runs" reads as `watch`, not `keep-cheap`.

The report surfaces the lower bound and `n` by design, not a bare percentage,
because the same point estimate means different things at n=3 and n=300.

## Wiring — feeder B (the hybrid pattern)

The signal is the adversarial VALIDATE pass: N skeptics (an odd panel, e.g. 3)
each try to REFUTE that the cheap model is adequate on one downgraded leaf. A
leaf is flagged (cheap inadequate) when at least half refute.

A `.claude/workflows/*.js` script cannot call MCP tools or write state (the
sandbox / state-coupling rule). So the wiring is hybrid:

1. The adversarial pass returns its per-leaf verdicts as DATA:
   `[{ model, leafId, refutedVotes, totalVotes }, ...]`.
2. On the main-thread turn (where MCP tools fire), map each verdict to an
   outcome with `verdictsToOutcomes` from
   `_byan/mcp/byan-mcp-server/lib/suitability-feeder.js`
   (`success = the cheap model survived the panel`).
3. For each outcome, call the MCP tool `byan_suitability_record`
   (`{ model, leafId, success, source: 'adversarial-pass' }`). This is the only
   write path to the ledger; `record` is best-effort and does not throw.

## Reading the ledger

- MCP: `byan_suitability_report` (optional `model` filter) — returns advisory
  rows, most-actionable first, each with the lower bound, `n`, and a verdict.
- CLI: `node _byan/mcp/byan-mcp-server/bin/byan-suitability.js [--model haiku] [--json]`
  — the same data, read-only.

## Honest caveat

Today only a handful of exploration leaves are downgraded, and all are already
cheap, so the ledger produces little actionable signal in the short term. This
is foundation — an evidence rail for when the workflow leaf-set grows — not an
immediate token win. Do not oversell a `keep-cheap` on a thin `n`.
