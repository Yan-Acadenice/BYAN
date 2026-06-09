---
name: byan-insight
description: Harvest the native Claude Code outcome trails (tool-log, strict-audit gaps, suitability ledger, ELO) into a GATED self-improvement digest for BYAN. Invoke when the user asks "what did this session teach BYAN", "insight digest", "self-improvement", "qu'est-ce que BYAN a appris", or wants to review recurring gaps / routing outcomes / tool health before deciding what to improve. Observe and propose; the human ratifies each change.
---

# BYAN Insight Loop (gated self-improvement)

BYAN already has advisory learning surfaces (ELO trust, the suitability ledger,
soul-memory) and the native Claude Code hooks already leave outcome trails on
disk. This skill closes the loop: it READS those trails, aggregates them into a
digest, and surfaces GATED proposals. It does not modify a behavior surface.

## The one hard rule: observe and propose, do not silently self-modify

An agent that rewrote its own routing, personas, or mantra thresholds on a
heuristic would be the exact silent-downgrade BYAN exists to prevent. So this
loop stops at a PROPOSAL. Applying a change (a routing tweak, a new checklist
item, a persona edit) stays a human decision — ideally run as its own FD. The
advisory data (ELO, suitability) is read-only here; behavior surfaces are left
to the human gate.

## Protocol

1. **Harvest.** Call the MCP tool `byan_insight_digest` (read-only, no args). It
   returns `{ gated: true, digest, render }` where `digest` is
   `{ toolHealth, recurringGaps, routingOutcomes, eloTrends, proposals }`.
   - `toolHealth` : call count, failure rate, top failing tools, output-token cost
     (from `_byan-output/tool-log.jsonl`).
   - `recurringGaps` : clustered self-verify gap themes with counts (from
     `.byan-strict/audit.log`) — what BYAN keeps missing.
   - `routingOutcomes` : per cheap-model x leaf keep-rate (from the suitability
     ledger) — where a downgrade is proven good or bad.
   - `eloTrends` : per-domain trust rating.
   - `proposals` : conservative, GATED suggestions (each `gated: true`).
2. **Present.** Show the `render` text, then the proposals as a numbered list.
   Make explicit that nothing has been applied.
3. **Gate.** For each proposal the user accepts, run the change as its own scoped
   work (a short FD for a behavior change; a direct edit for a doc/checklist).
   Do not auto-apply a proposal.

## CLI equivalent

```
node _byan/mcp/byan-mcp-server/bin/byan-insight-digest.js [--root <dir>] [--json]
```

Prints the human-readable digest, or the raw JSON with `--json`. Self-disables
(empty digest) when the trails are absent, so a fresh checkout is not an error.

## What it deliberately leaves alone

- It does not call `byan_elo_record` / `byan_suitability_record` for you (those
  stay where the outcome actually happens, e.g. a VALIDATE pass).
- It does not edit `lib/dispatch.js`, `native-tiers.js`, a persona, or the mantra
  thresholds. Those are behavior surfaces; a proposal names them, a human
  changes them.
