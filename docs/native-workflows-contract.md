# Native Workflows — Contract (Phase 1)

> How BYAN workflows run on Claude Code's native Workflow tool, and the rules a
> native workflow script must respect. Phase 1 of the native-workflow bridge.

## The two execution models

| | BYAN markdown/YAML workflow | Native (in-CLI Workflow tool) |
|---|---|---|
| Engine | the LLM interprets step files | a deterministic JS script |
| Human gate | a menu/HALT per step | none in-run (autonomous once launched) |
| Enforcement hooks | fire on the main-thread turn | do not fire inside the script |

A launched Workflow script is autonomous and runs OUTSIDE the conversation turn.
It cannot pause mid-run to ask a human, and the BYAN main-thread hooks
(`fd-phase-guard`, `strict-scope-guard`, `strict-stop-guard`, `mantra-validate`)
do not fire for work done inside it. That single fact drives the whole contract.

## What is portable, and what is not

Only workflows whose steps run WITHOUT a per-step human gate are portable. The
read-based classification of the 45-workflow manifest gives three buckets
(source of truth: `_byan/mcp/byan-mcp-server/lib/workflows-generator.js`):

- **autonomous** (11) — `dev-story`, `create-story`, `qa-automate`, the 8
  `testarch-*`. Run to completion with only error HALTs.
- **pipeline** (9) — `sprint-planning`, `code-review`, `document-project`,
  `check-implementation-readiness`, `quick-dev`, the 4 `create-excalidraw-*`.
  Deterministic multi-stage, minimal interaction.
- **gated** (25) — the `create-*` authoring flows, the CIS coaching workflows,
  `party-mode`, the builders, etc. Their defining feature is a human menu per
  step, so they stay LLM-interpreted markdown. They are out of scope for a
  native port.

The registry of portable workflows is generated into `.claude/workflows/INDEX.md`
by `byan-build-workflows` (run: `node _byan/mcp/byan-mcp-server/bin/byan-build-workflows.js`).

## Dual-path resolution

`resolveWorkflow(name)` prefers the native script `.claude/workflows/<name>.js`
when it exists, and otherwise falls back to the markdown workflow path from the
manifest. This is the same Gen3-first dual-path idea used for agent stubs:
adding a native script is additive, and removing it falls back cleanly.

## The Hybrid rule — gate outside, engine inside

The gated parts of a workflow stay in a skill on a real main-thread turn (where
the hooks fire); only the autonomous work runs inside the native script.

- The script returns DATA (a structured verdict). It does not decide completion.
- The orchestrating skill (e.g. `byan-native-dev-story`) owns the human gate and
  records FD/strict state via the MCP tools.

## The state-coupling rule (enforced)

A native workflow script must respect:

1. It returns data; it does not mutate BYAN platform state on its own.
2. FD and strict state are mutated only through the `byan_fd_*` / `byan_strict_*`
   MCP tools. Importing or requiring `lib/fd-state.js` (or the `strict-mode` lib)
   from a script is forbidden, and a direct write to `fd-state.json` /
   `.byan-strict/` is out of bounds.
3. The story file (or any workflow artifact) the script produces is fine to
   write — that is the product, not platform state.

This rule is enforced two ways, because the in-session hooks do not fire inside
a script:

- **`byan-lint-workflows`** (`node _byan/mcp/byan-mcp-server/bin/byan-lint-workflows.js`)
  scans `.claude/workflows/*.js` and fails on a forbidden import/require.
- **the pre-commit gate** (`.githooks/pre-commit`) runs that linter, so a
  coupling violation blocks the commit. Bypass is `git commit --no-verify`
  (emergency only).

Because a script cannot rely on the hooks, it should also re-assert the contract
inline (a comment block naming this file) so the next reader sees the rule.

## Resume safety

The Workflow runtime forbids wall-clock and RNG calls inside a script (they
break runId resume). Timestamps and ids are passed in via `args`. Helper logic
that needs testing lives in a lib module (e.g.
`_byan/mcp/byan-mcp-server/lib/native-loop.js`) and is mirrored inline in the
script, since the sandbox forbids `import` inside a script.

## Model routing — tier the leaves, keep heavy ones inherited

Each `agent()` leaf runs on the session's main-loop model unless the call sets
`opts.model`. The ported scripts left it unset, so the read-the-file leaf paid
the same (Opus) tier as the implement-and-verify leaf. The routing convention
fixes that, conservatively.

Source of truth: `_byan/mcp/byan-mcp-server/lib/native-tiers.js`. It owns the
tier vocabulary, the leaf classifier, and the model map.

| Tier | `opts.model` | Used for |
|------|--------------|----------|
| `deep` | **omitted** (inherit the session model) | implement, verify, analysis — the default |
| `balanced` | `sonnet` | mid-weight leaf, explicit manual opt-in only |
| `cheap` | `haiku` | a pure exploration leaf: read / load / parse / detect |

Two hard rules:

- **No pin-up.** `deep` is an omission, not `model: 'opus'`. Omitting lets a
  leaf inherit whatever the session runs — Opus by default, Sonnet if the user
  chose Sonnet. Pinning a fixed high tier would override that and could silently
  downgrade a Sonnet/Opus session's heavy leaf.
- **Only exploration downgrades.** A leaf is pinned to `cheap` only when it is
  unambiguous read/extract work. `classifyLeaf` keys off the LABEL (the prompt
  is too noisy — an exploration leaf often says "report what you found").
  Protected types (implementation / verification / analysis) and any unknown
  label default to `deep`.

The classifier is permissive (it labels by keyword), so it is a FLOOR, not a
ceiling: the linter forbids downgrading a protected leaf, but it does not force
every exploration-labelled leaf to downgrade. Author judgment decides the actual
downgrade — keep an exploration-labelled leaf on `deep` when any of these hold,
even if the label reads like a plain read:

- it embeds a HALT/prerequisite gate or a classification judgment
  (`detect-mode`, a `load-context` that gates on missing inputs);
- its output feeds a downstream gate or score and is NOT re-read later
  (`document-discovery` picks the doc version a readiness gate then analyses;
  the two `discover-tests` leaves feed a coverage/quality score and a
  PASS/CONCERNS/FAIL gate);
- it performs an EXACT conversion consumed verbatim downstream
  (`parse-epics` derives kebab keys that must match the status build exactly —
  one mis-kebab is unrecoverable).

These cases were surfaced by an adversarial review pass (three skeptics voting
on each candidate); the safe set ended at the leaves that are genuinely a read
with a forgiving or re-read consumer (`load-story`, the excalidraw
`load-resources`). Blast radius outweighs the token saving on the rest.

Enforcement (because the in-session hooks do not fire inside a script):

- `workflows-lint.js` -> `modelRoutingViolations` rejects (a) a `model:` value
  that is not a known downgrade tier, (b) a downgrade on a non-exploration leaf
  (`protected-leaf-downgraded`), (c) a downgrade with no in-object label.
  It is part of `validateContract`, so `byan-lint-workflows` and the pre-commit
  gate enforce it.
- `test/native-routing-integration.test.js` pins the invariant on the SHIPPED
  scripts: every script passes the contract, and every downgrade sits on an
  exploration leaf.

If a future runtime needs full model ids instead of the `haiku`/`sonnet`
aliases, `TIER_MODEL` in `native-tiers.js` is the only edit; the linter then
flags every script literal that drifts from it, so the fan-out stays bounded.

## Model-suitability ledger — an advisory learning layer above the floor

The routing above is a STATIC floor: it does not downgrade a protected leaf, and
the safe exploration set is fixed by author judgment. The suitability ledger is
an optional learning layer that sits ABOVE that floor. It records, per
`(model x leaf)`, whether a cheap model proved adequate, and advises whether a
downgrade should be kept, watched, or demoted. It does not edit routing and does
not touch the linter floor — a human reads its advice and decides.

| Piece | File | Role |
|-------|------|------|
| Math | `lib/suitability.js` | Beta-Bernoulli posterior, pure + deterministic (no clock/RNG/IO); verdict from the credible interval |
| Store | `lib/suitability-store.js` | the only write path; atomic tmp+rename; best-effort no-op on a failed write |
| Feeder | `lib/suitability-feeder.js` | adversarial-panel verdict -> binary outcome (at least half refute = flagged) |
| Tools | `byan_suitability_record` / `byan_suitability_report` | MCP surface (record is the sole state-write entry) |
| CLI | `bin/byan-suitability.js` | read-only advisory report |
| Skill | `.claude/skills/byan-suitability/SKILL.md` | the hybrid wiring (script returns DATA, skill records via MCP) |

The verdict reads the credible LOWER bound, not the point estimate: `keep-cheap`
needs the lower bound at or above 0.85 (roughly 30 clean outcomes), `demote`
needs the upper bound at or below 0.70, and anything thinner stays `watch`. So a
high mean on a small sample reads as `watch` rather than `keep-cheap`.

The state-coupling rule still holds: a workflow script cannot write the ledger
(the sandbox forbids it). The adversarial pass returns its per-leaf verdicts as
DATA; the orchestrating skill maps them with `verdictsToOutcomes` and records
each via `byan_suitability_record` on a main-thread turn. Auto-promotion is a
deferred phase-2 capability, held back so a streak cannot slip a downgrade past
human review.

Short-term, with only a handful of already-cheap exploration leaves, the ledger
yields little actionable signal — it is an evidence rail for when the leaf-set
grows, not an immediate token win.
