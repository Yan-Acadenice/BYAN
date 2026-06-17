# Changelog - BYAN (create-byan-agent)

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [2.26.0] - 2026-06-16

### Added - Leantime FD auto-sync hook (FD lifecycle -> board, automatic)

The FD -> Leantime mirror is now AUTOMATIC. A `PostToolUse` hook
(`.claude/hooks/leantime-fd-sync.js`, registered in `.claude/settings.json`) fires
after `byan_fd_advance` / `byan_fd_update` and drives the board with no agent
action: it ensures the project at DISCOVERY, creates one task per backlog feature
at DISPATCH, and moves tasks through `todo -> doing -> blocked/review -> done` as
the FD advances. This supersedes the hand-driven section 2.5 fire points (which
the agent had to run by hand and could skip).

- **Pure core** (`_byan/mcp/byan-mcp-server/lib/leantime-fd-core.js`):
  `decideActions` maps a phase transition + the sidecar to ordered Leantime
  intents; unit-tested for every transition. The hook is a thin I/O shell that
  executes them.
- **Best-effort + bounded**: the hook exits 0 in every path (a sync issue does
  not block the turn), no-ops when Leantime is off, self-heals a dropped call on
  the next phase event (a per-call timeout + a hook wall-clock budget), and logs
  every attempt to `.byan-leantime/sync.jsonl`.
- **Idempotence**: a gitignored sidecar (`.byan-leantime/map.json`, keyed by
  fd_id) is the single id ledger — a REFACTOR loop re-builds without duplicating a
  project or task. The hook does not write `fd-state.json` (state-coupling).
- **Human visibility** (`assignUserToProject` + `LEANTIME_ASSIGN_USER_ID`): an
  API-created project is owned by the API service user and hidden from a person's
  project selector; the hook relates the configured human so the board shows up.
  The underlying Leantime RPC reconciles a user's whole project list, so the
  assign reads the full list first and writes the union (fail-closed if that read
  is incomplete) to avoid unassigning the user's other projects.

### Added - Leantime project-management integration (one-way FD -> board)

BYAN can now mirror its Feature Development lifecycle onto a self-hosted Leantime
instance. When `LEANTIME_API_URL` + `LEANTIME_API_TOKEN` are configured, the FD
phases drive a Leantime project and one task per backlog feature ; when absent,
the tools report disabled and FD proceeds unchanged. The sync is one direction
(FD -> Leantime) and best-effort : a down or misconfigured Leantime degrades to
`{ synced:false, reason }` and does not block a phase transition.

- **Client** (`_byan/mcp/byan-mcp-server/lib/leantime-sync.js`): a JSON-RPC 2.0
  client for `<base>/api/jsonrpc`, authenticated by the Leantime-native
  `x-api-key` header (kept distinct from the byan_web `ApiKey/Bearer` scheme).
  Best-effort and does not throw, with an `AbortController` timeout and a
  non-JSON-200 guard that rejects an HTML login body (the wrong-host lesson)
  instead of reading it as an empty board. Business fns: `ensureProject`
  (idempotent by name), `createTask`, `moveTask`, `assignTask`, `getTask`,
  `getBoard`, plus `resolveStatusMap` / `resolveClientId` / `resolveEditorId`.
- **MCP tools** (7): `byan_leantime_ping`, `byan_leantime_project_ensure`,
  `byan_leantime_task_create`, `byan_leantime_task_move`,
  `byan_leantime_task_assign`, `byan_leantime_task_get`,
  `byan_leantime_board_get`. All but `ping` pass through `requireLeantime()`.
- **FD wiring** (`.claude/skills/byan-byan/SKILL.md` section 2.5): fire points
  DISCOVERY -> project_ensure, DISPATCH -> task_create per feature, BUILD ->
  doing, REVIEW/VALIDATE-KO -> blocked, VALIDATE-OK -> review, DOC -> done.
  Leantime ids persist into fd-state (`project_context.leantime.projectId`,
  backlog `leantime.taskId`) so a REFACTOR loop reuses tasks instead of
  duplicating them.
- **Status mapping**: the canonical FD columns (`todo|doing|blocked|review|done`)
  resolve to per-project Leantime status ids at call time, with a conservative
  fallback when the labels cannot be read.
- **Tests**: `test/leantime-sync.test.js` (14 cases: auth header, non-JSON guard,
  timeout, idempotence, column resolution) + `test/leantime-tools.test.js`
  (the 7-tool declaration/handler surface in server.js).
- **Docs**: `.claude/rules/byan-api.md` section 8 (the `byan_leantime_*` family +
  the wrong-host lesson).
- **Pending**: the live wire-format verification (one real POST with a Leantime
  PAT, to confirm `params:{values:{}}` wrapping against the running instance) is
  a documented follow-up ; the tested format follows the Leantime master source.

### Removed - GitHub Copilot CLI + VSCode dropped as target platforms (3 -> 2)

BYAN now targets two platforms: Claude Code and Codex. GitHub Copilot CLI and
the VSCode extension are no longer install targets. This is a breaking change for
anyone who relied on the Copilot/VSCode output.

- **Install path** (`npx create-byan-agent`): the platform menu, auto-select, and
  generated stubs cover Claude Code + Codex only. The `byan_copilot_*` MCP tool
  family and the `marc` Copilot-oriented agent were removed in the core pass
  (commit `0f06cf8`).
- **Web UI** (ships on npm via `install/src/webui`): the chat CLI selector, the
  `cli-detector` definitions, the platform-detection list, and the marketing copy
  drop Copilot and VSCode; the `copilot-adapter` bridge and its `createBridge`
  case are gone (`createBridge('copilot')` now rejects with `Unknown CLI adapter`).
- **Dead code**: both shipped copies of the orphaned `copilot-context` module
  (`src/byan-v2/context/` and `install/src/byan-v2/context/`) and two stale
  non-jest harnesses (`test-byan-v2-workflow.js`, `test-workflow-simple.js`) were
  deleted.
- **Note**: the `byan-loadbalancer` Copilot *provider* (an LLM backend, not an
  install target) is unaffected and stays.

### Added - Auto-Benchmark: native sourced decision benchmarks (C1-C5)

When the agent is about to ask you to choose between options, it now benchmarks
the fork by default: one compact `Option | criteria | Niv` table with a best-first
recommendation, sourced and confidence-tagged, at the right level of detail — so
you no longer have to ask each time. Two layers cover this honestly (Claude Code
exposes no pre-display interception hook today, GH #28273):

- **Proactive doctrine** (the broadly-portable layer). The full doctrine lives in
  `.claude/rules/benchmark.md`, generated from the single source of truth
  `_byan/_config/autobench.yaml` by `byan-sync-rules`, and a lean pointer is
  upserted cross-platform into `.claude/CLAUDE.md`, `AGENTS.md`, and
  `.github/copilot-instructions.md` (idempotent `BYAN-AUTOBENCH` markers). It
  covers the TRIGGER 2-gate rule (>= 2 non-substitutable options diverging on
  >= 1 weighted criterion) + the exemption list (y/n confirms, destructive
  prompts) + internal/external routing + a verbatim few-shot decision tree, the
  SCALER 5-level evidence rubric + strict-domain floors + the link-only-if-WebFetch
  rule, the FORMAT compact table with hard caps (<= 4 options / <= 4 criteria /
  <= 3 links) + collapse-the-degenerate + `[bench:expand]` opt-in, and the
  ANTI-BLOAT latency guard + escape-hatch + no-re-benchmark.
- **Reactive Stop hook** (`.claude/hooks/autobench-stop-guard.js`), the safety
  net. It **ships DISARMED**: it observes and ledgers every turn but stays inert
  (does not block) until you opt in — set `enforcement.armed: true` in
  `_byan/_config/autobench.yaml` and run `byan-sync-rules` (config-only; there is
  no loose flag file) — so day one is zero noise / zero latency.
  Detection is **artifact-primary**: a real fork is recognized from an
  `AskUserQuestion` tool_use in the finished turn, with the choice-language regex
  as a last-resort fallback. Block-once is content-hashed (no loop); a session
  escape-hatch (`touch .byan-autobench/off`) plus a cross-session toggle suppress
  it.
- **Tooling.** A `byan-benchmark` skill (conductor) and a DATA-only native
  workflow (`.claude/workflows/byan-benchmark.js`), both registered in the
  workflow manifest / PORTABLE bucket / INDEX. A BYAN-only opt-in layer enriches
  the matrix via `byan_fc_check`. Every fire/miss is audited to
  `_byan-output/benchmark-ledger.jsonl`.

### Added - byan-install-core (F1): headless, deterministic install engine

First feature of the installer refactor (FD lot 1). A new internal workspace
package `byan-install-core` (`install/packages/install-core/`) that replaces the
LLM-driven AUTO interview with a deterministic engine. It is the shared core both
front-ends bind to: the npm CLI wizard (F2, next) and the Electron app (F5).

- **Four-verb lifecycle.** `detect(opts)` builds a serializable MachineProfile
  (os, arch, node, npm, git, claude, codex) and is spawn-free by default
  (`probeVersions` is opt-in). `plan(profile, answers)` is pure and turns the
  non-interactive answers contract into an ordered InstallPlan. `apply(plan, opts)`
  is the only mutator. `verify(plan|target)` is read-only.
- **No LLM, no `which`.** Detection uses a pure-Node PATH walk (`lookpath`,
  honoring Windows PATHEXT); recommendations come from a versioned JSON decision
  table (`data/recommender.json`), not a model call.
- **Per-OS env + validate-or-die .mcp.json.** `env-writer` and `mcp-renderer`
  reuse the existing `byan-platform-config` package (idempotent marker blocks;
  a config is parsed and validated before any write, so a broken file is not
  emitted on an invalid input).
- **Per-user install, no sudo.** `--install-cli claude|codex` installs via
  `npm -g`; the AUTH step is an explicit handoff (the engine returns the manual
  command and reports a pending state rather than a fake authenticated success).
- **ES5 preflight.** `byan-install-core/preflight` is a dependency-free, ES5-only
  entry a launcher can require on an ancient Node to gate the version before any
  modern module loads.
- Tests: 9 suites / 161 tests for the package; full repo suite green
  (no regression). The CLI wizard, `doctor`, journal/resume and the v2.19
  `--yes` end-to-end snapshot land in the following features (F2, F3).

## [2.25.0] - 2026-06-09

### Added - Advisory auto-feed (BYAN learns from each session, automatically)

The insight loop observed and proposed; the missing half was the LEARNING. BYAN's
advisory ledgers (ELO trust, the suitability ledger) updated only when the agent
remembered to call a record tool. This wires the automatic half — outcomes are
recorded at end of turn, with no agent action — while behavior surfaces stay
human-gated.

- **Capture.** The `byan_outcome_log` MCP tool appends one validated advisory
  outcome to a buffer (cheap; it does not write a ledger directly). kind=elo logs
  `{domain, result}`; kind=suitability logs `{model, leafId, success}`.
- **Drain.** `.claude/hooks/drain-advisory.js` is a Stop hook that, at end of each
  turn, records the buffered outcomes into the ELO ledger (full Glicko update) and
  the suitability ledger, advancing a line cursor for idempotency. It is strictly
  non-blocking (all work in try/catch, emits `{continue:true}` and exit 0 on every
  path) and crosses the ESM/CJS boundary (the CJS ELO engine via require, the ESM
  suitability store via dynamic import).
- **Advisory-only.** The loop writes only the buffer and the two advisory ledgers.
  Behavior surfaces (routing, personas, mantra thresholds) are left untouched —
  those stay a human decision, consistent with the insight loop's gated philosophy.
- 71 tests (the pure planners, the buffer, and a drain-hook e2e with ledger
  snapshot/restore) plus a live smoke test recording a real Glicko update. The tool
  and hook ship in the template; the hook registers alongside the existing Stop
  hooks.
- Explicit follow-ups (out of this scope): the adversarial verdict panel that would
  feed suitability without a manual log, and a fact-graph-derived ELO source.

## [2.24.0] - 2026-06-09

### Added - Session insight loop (gated self-improvement)

BYAN already has advisory learning surfaces (ELO trust, the suitability ledger)
and the native Claude Code hooks already leave outcome trails on disk, but the
loop was open: the agent had to read and act on them by hand. This closes it,
under a strict gated philosophy.

- **Harvester** `_byan/mcp/byan-mcp-server/lib/insight-harvest.js` +
  `bin/byan-insight-digest.js` + the `byan_insight_digest` MCP tool: read the
  native trails (`tool-log.jsonl` health, strict `audit.log` recurring gaps,
  the suitability ledger routing outcomes, the ELO profile trends) and aggregate
  them into a digest with conservative, GATED proposals. Pure aggregation +
  IO-isolated reader, mirroring the template-fidelity pattern.
- **Gated by design.** The harvester only READS; it writes nothing to a behavior
  surface (routing, personas, mantra thresholds). Every proposal carries
  `gated: true` and is surfaced for a human to ratify — an agent that rewrote its
  own routing on a heuristic would be the silent-downgrade BYAN exists to prevent.
- **Skill** `byan-insight` presents the digest as a gated improvement proposal
  (observe, propose, human ratifies), consistent with the advisory ELO /
  suitability doctrine.
- **Guard false-positive fix.** `tool-failure-guard` flagged any tool whose result
  echoed the literal phrase "internal error" as a failure, exempting only
  Write/Edit/Read. Bash (diagnostic stdout) and MCP tools (echoed stored data) now
  join the echo-heavy set: their `is_error` flag is trusted, content patterns are
  not. A genuine failure still sets `is_error`. Caught live (a Bash log-grep
  blocked the session twice) and covered by unit + e2e tests.
- 43 harvester unit tests + the detector tests; the e2e guard tests moved their
  content-pattern cases onto a non-echo tool. The tool and skill ship in the
  template.

### Changed - Closed the fused-route and output-folder legacy debts

- Removed the dead parallel router `src/core/dispatcher/execution-router.js` (zero
  live consumers) and its test; the routing docs (`workers.md`,
  `feature-workflow.md`) and the loadbalancer architecture comment now point only
  to `byan_dispatch` and its two-axis model (strategy from score, model tier from
  nature).
- Standardized the documented output folder from the legacy `_bmad-output/` to the
  runtime's `_byan-output/` across the agent and platform docs plus an inert config
  default. Left untouched on purpose: the deliberate back-compat read in
  `agent-packager.js` (recovers agent creations from older installs under
  `_bmad-output/bmb-creations`), the migration guides, and the anti-regression
  tests that assert the old name is gone.

## [2.23.0] - 2026-06-09

### Added - Stub path normalizer + a 5th pre-commit gate (no _bmad/@bmad drift)

The installer generated platform stubs (`.codex/prompts`, `.github/agents`,
`.claude/skills`) across many versions; older generators wrote the legacy path
layout (`_bmad/*/agents/X.md`, `@bmad/bmm/agents/X.md`,
`@bmad-output/bmb-creations/X/X.md`), so the tracked corpus carried a mix of stale
path forms while the agent source files stayed clean. This adds the mechanism that
removes the drift and blocks its return.

- **Tool** `_byan/mcp/byan-mcp-server/lib/stub-sync.js` + `bin/byan-sync-stubs.js`:
  normalizes stale `_bmad/` and `@bmad/` PATH tokens to the `_byan/` canonical
  layout, in place and surgically. The `@bmad-<word>` invocation syntax and the
  `_bmad-output/` artifact dir are preserved; no stub is overwritten wholesale, so
  the github full-copies and hand-authored skills keep their content. `--check`
  reports any residual stale ref and exits non-zero.
- **5th pre-commit gate.** `.githooks/pre-commit` runs `byan-sync-stubs --check`
  after the template-fidelity gate, blocking a commit whose tracked stubs have
  drifted. It self-disables when the tool or the stub dirs are absent
  (installed-user no-op).
- **First run.** 101 stub files normalized (codex prompts + the Codex global
  `instructions.md` + 5 github stubs + their template twins); the byan github
  full-copy changed only its 3 stale path lines, its other 1059 lines untouched.
- Design mirrors the template-fidelity sync (pure rewrite rules + IO-isolated
  apply); 20 unit tests pin every rule, the two preservation cases, the IO layer,
  and idempotence. The tool ships in the template, so the gate is live for
  installed users too.

## [2.22.0] - 2026-06-09

### Changed - byan_dispatch routes the model tier by task nature, not by size

`byan_dispatch` fused two unrelated decisions into one route string
(`mcp-worker-haiku`, `main-thread-opus`): a short sequential task was downgraded
to haiku purely on its length, and a long one was pinned up to opus. That is the
size-driven mis-tiering the native-workflow doctrine (`native-tiers.js`) was built
to forbid, so the two routers disagreed. This decouples the two axes and makes
`native-tiers.js` the single source of truth for the model tier across both worlds.

- **Two independent axes.** `dispatch.js` now returns
  `{ score, strategy, nature, tier, model, parallelizable, reasoning }`. STRATEGY
  (where the work runs: `main-thread` / `agent-subagent-worktree` / `mcp-worker`)
  stays derived from the scalar score + `parallelizable`. TIER (which model) is
  derived from the task NATURE, decoupled from size.
- **One source of truth.** `dispatch.js` imports `classifyLeaf` / `tierFor` /
  `TIER_MODEL` directly from `native-tiers.js` — a one-way dependency toward the
  tier authority rather than a duplicated rule. Only an `exploration` nature
  downgrades to `haiku`; `implementation` / `verification` / `analysis` (and any
  unmatched task) stay `deep` (inherit the session model). No pin-up to opus.
- **Conservative by default.** An optional `nature` arg sets the tier directly;
  absent or invalid, the task text is classified, whose own default is
  `implementation` (deep) — so a miss protects the work instead of downgrading it.
- **Consumers realigned.** The `byan_dispatch` tool schema gains an optional
  `nature` enum; the three consuming skills (byan-byan Phase 4, byan-hermes-dispatch
  step 3, byan-orchestrate) read `strategy` + `model` from the new shape. The
  fused-route strings are dropped from the live routing path.
- 22 dispatch unit tests pin the contract (no downgrade for protected natures,
  exploration to haiku, no pin-up, conservative fallback, strategy preserved across
  the score bands) plus the hermes-e2e non-regression. Template re-synced.

### Known debt

The legacy fused-route vocabulary (`mcp-worker-haiku` / `main-thread-opus`) still
appears in two doctrine docs (`_byan/worker/workers.md`,
`_byan/workflow/simple/byan/feature-workflow.md`) and a dead, unreferenced parallel
router (`src/core/dispatcher/execution-router.js` + its test). These have no live
consumer and are scoped to a follow-up cleanup.

## [2.21.0] - 2026-06-08

### Added - Template fidelity sync (the published package matches its CHANGELOG)

Only `install/templates/` ships on npm (`package.json` `files[]`), but the dev
code lives at root `_byan/` and `.claude/`. With no mechanism to mirror root into
the template, the template had drifted: 81 stale files had accumulated across
several chantiers, so the routing and ledger work below existed at root yet was
absent from the package a user would install. This adds the missing mechanism and
re-aligns the template.

- **Sync tool** `_byan/mcp/byan-mcp-server/lib/template-sync.js` +
  `bin/byan-sync-template.js`: re-syncs every file already in the template from its
  root twin, adds an explicit target list, and excludes runtime seeds
  (`_byan/memoire/**`). The mirrored perimeter is the template itself rather than a
  walk of root, so dev-only files do not leak into the package. `--check` reports
  drift and exits non-zero without writing.
- **First-run result.** 79 stale files re-synced and the 7 missing routing/ledger
  artifacts added, so the shipped `server.js` registers the `byan_suitability`
  tools and the downgraded workflows ship as intended. Runtime seeds left
  untouched.
- **Anti-recidive gate.** A fourth pre-commit gate runs `byan-sync-template.js
  --check` and blocks a commit whose template has drifted from root. It is a no-op
  for an installed user (the tool is dev-only, so the gate self-disables there).
- 19 unit tests: idempotence, exclusion of runtime seeds, drift detection,
  atomic-copy rollback, and perimeter tightness. Guide in
  `docs/template-fidelity.md`.

### Added - Model routing for native workflows (tier the leaves, keep heavy ones inherited)

The 20 native-workflow scripts (`.claude/workflows/*.js`) all ran every `agent()`
leaf on the session model (Opus by default): the read-the-file leaf paid the same
tier as the implement-and-verify leaf. This wires BYAN's complexity doctrine into
the Workflow tool's `opts.model` lever, conservatively.

- **Single source of truth** `_byan/mcp/byan-mcp-server/lib/native-tiers.js`: the
  tier vocabulary (`cheap`/`balanced`/`deep`), a label-driven leaf classifier, and
  the model map. `deep` is an OMISSION (inherit the session model), not a pin — we
  only ever route DOWN, and only exploration leaves.
- **Anti-downgrade guard** in `workflows-lint.js` (`modelRoutingViolations`),
  folded into `validateContract`, so `byan-lint-workflows` and the pre-commit gate
  reject any protected (implement/verify/analysis) leaf carrying a downgrade or any
  unknown model literal.
- **Conservative application.** Of 19 exploration-labelled leaves, only 5 are
  downgraded to `haiku` (`dev-story:load-story` + the 4 excalidraw
  `load-resources`). An adversarial review pass (3 skeptics) caught 4 candidates
  whose output feeds a downstream gate/score without a re-read
  (`document-discovery`, `parse-epics`, the two `discover-tests`); those were
  reverted to `deep`.
- **Regression guard** `test/native-routing-integration.test.js` pins the invariant
  on the shipped scripts. Contract documented in `docs/native-workflows-contract.md`.

### Added - Model-suitability ledger (advisory learning layer above the routing floor)

The static routing floor does not widen itself. The suitability ledger learns,
per `(model x leaf)`, whether a cheap model proved adequate, and advises keep /
watch / demote — above the floor, with a human deciding. It does not edit routing
and the linter floor stays the hard gate.

- **Math** `_byan/mcp/byan-mcp-server/lib/suitability.js`: a Beta-Bernoulli
  posterior, pure and deterministic (no clock/RNG/IO). The verdict reads the
  credible LOWER bound, so a thin sample stays `watch` (a high mean over 3 runs
  is not `keep-cheap`); `keep-cheap` needs roughly 30 clean outcomes.
- **Store** `lib/suitability-store.js`: the sole write path, atomic tmp+rename,
  best-effort no-op that does not throw or corrupt the ledger on a failed write.
- **Feeder** `lib/suitability-feeder.js`: maps an adversarial-panel verdict to a
  binary outcome (at least half refute = flagged).
- **MCP tools** `byan_suitability_record` / `byan_suitability_report`, **CLI**
  `bin/byan-suitability.js` (read-only), and **skill** `byan-suitability` (the
  hybrid wiring: the script returns DATA, the skill records via MCP).
- 38 unit tests. Auto-promotion is deferred (phase 2) so a hot-hand streak cannot
  slip a downgrade past human review.

### Changed - Widened the safe-downgrade set (5 -> 11 leaves)

An adversarial panel (one skeptic per leaf, each asked to PROVE the leaf is
analysis) re-judged 6 deep exploration leaves whose output is re-read or
re-synthesized by a later Opus step. The 6 cleared as genuine reads and now run
on haiku, doubling the downgraded set:

- document-project: scan-existing-docs (renamed from existing-docs) and source-tree
- the four excalidraw context leaves: read-context (wireframe), read-requirements
  (flowchart), context-scan (dataflow), parse-spec-intent (diagram)

Five labels were honestly renamed so the deterministic classifier reads them as
exploration; a leaf the panel found to be genuine analysis would have stayed deep.
The 4 earlier reverts (document-discovery, parse-epics, the two discover-tests)
were re-checked with token net-math and stay deep: adding a re-read is net-negative
or marginal there. native-routing-integration.test.js floor raised 1 -> 11; the
panel verdicts seed the suitability ledger.

## [2.20.1] - 2026-06-04

### Fixed - Post-audit hotfix (adversarial self-audit of 2.20.0)

- **N2 skill crash guard.** The shipped `byan-mantra-audit` skill invoked
  `src/byan-v2/generation/mantra-audit.js` blindly; a generated / npm-installed
  project does not ship that runtime, so the skill crashed with MODULE_NOT_FOUND.
  The skill now checks for the runtime first and degrades with a clear message. The
  deeper installer bug (the v2 runtime is not delivered to generated projects today,
  so the mantra gate stays a silent no-op there) is tracked as a separate chantier;
  the pre-commit gate and Stop hook already self-guard rather than crash.
- **scope-resolver precedence collapse.** An all-invalid `mantra_scopes` frontmatter
  (e.g. a `sdlc-cod` typo) silently collapsed a persona to universal-only, weakening
  the anti-stub floor it feeds. It now falls through to the agent/module map when no
  named scope is valid; an explicit `[universal]` is still honored. Regression-tested.
- **CHANGELOG accuracy (2.20.0).** The CIS floor figures paired inconsistent
  before-baselines; corrected to a single univ-only baseline.
- **Dead mantras documented.** M8 is not the only zero-match mantra under the keyword
  validator: M1 (Un seul responsable), M6 (INVEST), M28 (Sprint review) also match
  0/12 of their sdlc-process personas. Flagged for a future keyword / coverage pass.

### Fixed - Full jest suite green (35 -> 0 failures, all legitimate)

A clean `npm install && npm test` surfaced 35 pre-existing failures across 12 suites
(none from the mantra work, proven by git). All fixed without weakening an assertion:

- **VoiceIntegration crash.** It called `this.logger.debug/warn`, which a minimal
  logger lacks, killing the jest worker (and cascading into system-integration and
  full-bmad). Hardened the consumer with a level-fallback shim, added the missing
  `Logger.debug`, crash-proofed the detached voice-init in index.js, added the
  `SessionState` get/set store it relied on, and removed an emoji from source.
- **Stale unit tests realigned.** active-listener (`confirmed` -> live `validated`)
  and glossary-builder (string -> the live `{reason, suggestions}` object API) were
  brought up to the shipped contract two integration suites already prove; assertions
  were tightened, not lowered.
- **node:test files de-conflicted from jest.** The `/api/*`, `fs-migration-hook` and
  `e2e-remote-import` suites run under `node --test`; jest's broad glob swept them up.
  Excluded via `testPathIgnorePatterns` (they keep their own runner).
- **Perf microbench stabilized.** The construction-overhead test measured 1ms
  scheduling jitter; replaced with an interleaved median-of-200 hrtime measurement
  and a 20ms absolute ceiling that still catches a real regression.
- **Hermetic env.** `jest.setup.js` strips ambient `BYAN_API_*` so staging/flush
  suites no longer pass or fail by accident depending on the dev/CI shell.
- **Installer feature implemented (FD 20260428).** `setupClaudeNative` now writes the
  `enabledMcpjsonServers` whitelist to `.claude/settings.local.json` (byan + accepted
  extensions, idempotent), strips `BYAN_API_TOKEN` from `.mcp.json` (template + code),
  and honors the caller's `apiUrl` (new `install/lib/settings-local.js`). The stale
  `e2e-install-update` test (asserting the pre-security token-in-.mcp.json contract)
  was removed; correct-contract coverage lives in migrate-mcp-config + post-install.e2e.

Result: 104 suites / 2039 tests green.

## [2.20.0] - 2026-06-04

### Changed - Mantra taxonomy v2: sdlc-ops split + creative family (corpus 64 -> 71)

The N2 embodiment audit surfaced two taxonomy biases. (1) sdlc-code conflated
code-craft with release/ops, so a dev agent was judged against release mantras it
never performs. (2) The corpus had no creative mantra, so the six CIS agents were
scored only against analytical principles that are the opposite of their craft.

- **sdlc-ops scope.** Six release/deploy mantras (M8 freeze, M16 semver, M17
  changelog, M18 env parity, M19 CI/CD, M20 rollback) move from sdlc-code to a new
  `sdlc-ops` scope. Deploy/ops agents (rachid, patnote, yanstaller, marc, codex,
  claude) gain it; dev/architect shed it (they craft, not release).
- **Creative family (7 mantras, CR-1..CR-7).** A new `creative` scope + category,
  derived from the real CIS personas: Diverge Before Converge (brainstorming),
  Anchor in the Human Need (design-thinking), Reframe to the Root Cause
  (problem-solving), Judge Ideas by New Value (innovation), Find the Authentic
  Story (storytelling), Serve the Audience's Attention (presentation), Prototype-
  Test-Pivot (iteration). The 6 CIS agents are now scored on their own craft.
- **scope-resolver** registers the two new scopes in `VALID_SCOPES` so they are
  not silently dropped at resolution (the design's own Zero-Trust blocker).
- **Corpus 64 -> 71.** metadata recomputed (scopes, categories, priorityLevels);
  the strict 12-mantra regime is byte-untouched. No-scope total tests updated to
  71; the all-five-scopes union test drops 60 -> 54 as the six ops mantras leave
  sdlc-code. Keyword lists were cleaned of over-broad signals per an adversarial
  review.

Measured (floor, univ-only baseline -> univ+creative): dev sheds ops (applicable
42 -> 36). The CIS agents are scored on their own craft, which shifts the floor by
relevance rather than uniformly: brainstorming-coach 45 -> 48, innovation-strategist
65 -> 59 (it matches fewer of its own creative mantras in vocabulary).

### Changed - Domain-aware mantra validator (Option C: N1 anti-stub floor + N2 embodiment audit)

The mantra compliance bar was an all-64 keyword-density proxy with an 80% gate
that focused personas did not reach (measured median 11%, 0 of 120 gated files at
>= 80%): it implicitly graded each agent as a software-delivery agent, so a UX or
storyteller persona was failed for missing Scrum/Merise vocabulary. The gate
stayed green only through broad exemptions, masking the mis-fit. This reworks the
metric to score each persona only against the mantras that apply to it.

- **Taxonomy.** Each of the 64 mantras carries a `scope`
  (`universal` | `sdlc-process` | `sdlc-code` | `sdlc-modeling` | `sdlc-test`) in
  `mantras.json`. The four runtime-enforced mantras (IA-1, IA-9, IA-21, IA-23,
  checked by hooks / fact-check rather than declared in a persona file) are
  flagged `behavioral` and excluded from persona-file scoring.
- **Domain-aware validator.** `validate(def, { scope })` scores only the
  applicable subset (universal + the persona's declared scope, behavioral
  excluded); `totalMantras` becomes the applicable count. With no scope it scores
  all 64 (legacy behavior preserved, existing tests untouched). A reusable
  `applicableMantras(scope)` is exposed. Score bands moved to single constants.
- **Per-agent scope resolution.** `scope-resolver.js` resolves a persona to its
  scope set, precedence explicit-frontmatter > per-agent map > module-derived >
  `universal`, with `universal` force-unioned. The map lives in
  `src/byan-v2/data/agent-scopes.json`.
- **Emoji-icon fix.** The no-emoji mantra (IA-23) excludes `icon="..."`
  frontmatter attributes from its scan (an icon glyph is display metadata, not
  pollution); a real emoji in the body is still caught.
- **Anti-stub floor, honestly named.** The pre-commit gate and Stop hook score the
  canonical Gen3 persona sources (`_byan/agent/<name>/<name>.md`) domain-aware at a
  floor of 30 (the real roster spans 34-73, median 50). It is an anti-stub /
  anti-zombie floor, not a deep quality bar.
- **N2 embodiment audit (out-of-band).** `src/byan-v2/generation/mantra-audit.js` (`prepare` /
  `score`) plus the `byan-mantra-audit` skill measure genuine embodiment via an
  LLM judge, kept out of the commit path (the judgment is semantic).
- **Bugs fixed in passing.** B1: the stale `install/templates/.githooks/pre-commit`
  mirror is re-synced (it lagged the source, missing the workflow-lint block). B2:
  the gate no longer targets empty legacy dirs (`_byan/agents`, `_byan/bmb/agents`),
  it targets the real sources. B3: the FD VALIDATE wording (SKILL, fd-phase-guard,
  feature-workflow, GUIDE) is realigned to the floor, no longer asserting an
  unreachable 80%. Config `categories` is revived as `scopes`.

New unit tests: scope filtering, behavioral exclusion, emoji-icon, scope-resolver,
N2 audit. Strict regime (12 mantras, byan-strict at 100%) untouched.

### Added - Native workflow bridge, Phase 1 (Hybrid: gate outside, engine inside)

BYAN workflows are LLM-interpreted and human-gated; Claude Code's in-CLI Workflow
tool runs a deterministic JS script with no in-run human gate. Phase 1 ports the
non-gated subset (autonomous + deterministic pipeline) to the native tool, while
the gated majority stays markdown by design. Scope is coupled to target: broad
coverage (gated workflows) would need the Agent SDK and is parked (Phase 2).

- **F1 — registry + dual-path resolver.** `byan-build-workflows`
  (`_byan/mcp/byan-mcp-server/bin/`, ESM, sibling to `byan-build-index`) reads
  the workflow manifest and writes `.claude/workflows/INDEX.md` idempotently
  (20 portable workflows: 11 autonomous + 9 pipeline). `resolveWorkflow(name)`
  prefers `.claude/workflows/<name>.js`, else falls back to the markdown workflow
  (Gen3-first dual-path).
- **F2 — pilot port `dev-story`.** `.claude/workflows/dev-story.js` runs the
  red-green-refactor loop as a JS `while` loop with a real 3-cycle convergence
  counter (replacing the doc-only "3 failures -> HALT" rule). The deterministic
  core lives in `lib/native-loop.js` (unit-tested) and is mirrored inline since
  the sandbox forbids imports. The script returns a structured verdict; the
  `byan-native-dev-story` skill owns the human gate and records state via MCP.
- **F3 — enforcement bridge.** `byan-lint-workflows` fails if a
  `.claude/workflows/*.js` imports/requires `lib/fd-state.js` (or the strict-mode
  lib); wired into `.githooks/pre-commit` since the in-session hooks do not fire
  inside a script. Contract documented in `docs/native-workflows-contract.md` and
  `.claude/rules/native-workflows.md`.

25 new unit tests (node --test). Mirrored into `install/templates/`.

- **F4 + F5 - the 19 remaining portable workflows ported.** Every autonomous
  (10: create-story, qa-automate, the 8 testarch-*) and pipeline (9:
  check-implementation-readiness, code-review, the 4 create-excalidraw-*,
  document-project, quick-dev, sprint-planning) workflow now has a faithful
  native `.claude/workflows/<name>.js` that mirrors its real source steps. Each
  keeps human gates OUT of the script (returns a structured verdict), uses no
  import/state-coupling/wall-clock/RNG, and passes `node --check` +
  `byan-lint-workflows`. `.claude/workflows/INDEX.md` now reports 20/20 native
  (11 autonomous + 9 pipeline). Mirrored into `install/templates/`.

- **F6 - native-workflow contract validator.** `byan-lint-workflows` now enforces
  the full contract on every `.claude/workflows/*.js`: no state coupling
  (comment-stripped), no wall-clock/RNG token anywhere in the raw text (the
  launch validator rejects those even in comments or strings - the exact failure
  a manual review caught while porting), a pure `export const meta` literal first,
  and `node --check` syntax. `validateContract()` is exported and unit-tested
  (clock-in-comment case included). Wired into the pre-commit gate. Speculative
  brainstorm items (golden-file LLM diff, dry-run mode, schema-first frontmatter)
  were dropped per Ockham.

### Fixed - hygiene debts surfaced while porting (F7)

- **Dispatch matrix doc realigned to code.** The DISPATCH table in
  `_byan/workflow/simple/byan/feature-workflow.md` advertised `<30 / 30-60 / >=60`
  (Worker/Sonnet/Opus) which did not match `byan_dispatch` / `lib/dispatch.js`
  (`main-thread <15` / `agent-subagent-worktree <40+parallel` / `mcp-worker-haiku
  <40` / `main-thread-opus >=40`). The doc now mirrors the code, the single
  source of truth.
- **Strict scope-guard mid-segment glob fixed.** `matchesPrefix` reduced a glob
  to the literal lead before the first wildcard and then forced a `/` boundary,
  so a mid-segment glob like `.claude/skills/byan-*/**` wrongly denied
  `.claude/skills/byan-native-dev-story/...`. It now matches mid-segment globs as
  a raw prefix while preserving the directory-boundary behavior (`_byan/**`
  matches `_byan/x` but not `_byanX`). Tested in `strict-hooks.test.js`.

Two related items were investigated and deliberately left unchanged: retargeting
the mantra pre-commit bar onto canonical Gen3 agent sources does not help (those
sources also score below the 80% keyword-density bar - `byan` 73%, `dev` 38% - so
the bar itself, not its target, is the open question, left as a policy decision);
and the "FD state pushed to byan_web" claim is absent from the repo (FD state is
pure-local by design; only strict mode pushes to byan_web), so there was nothing
to fix.

---

## [2.19.2] - 2026-06-02

### Fixed - `update-byan-agent update` is non-destructive, non-interactive, and local

Field testing of the 2.19.1 updater surfaced four real bugs in
`update-byan-agent/bin/update-byan-agent.js` (the published template `_byan` was
verified healthy and is untouched):

- **No more redundant network install.** The updater runs via
  `npx -p create-byan-agent@latest`, so the `@latest` package (and its template)
  is already on disk next to the running bin. It now resolves the template from
  the running package root (`path.resolve(__dirname, '..', '..')`, with a
  `node_modules/create-byan-agent` fallback) instead of re-running
  `npm install --no-save create-byan-agent@latest` into the user project (which
  pulled ~215 packages, took minutes, had no timeout, and emitted no output).
  The `.github/agents`, Claude-native, and fs-migration refreshes now resolve
  from that same local root, so the F22 Gen3 stub refresh is no longer silently
  skipped when the user project has no local `node_modules`.
- **Non-destructive rebuild.** The replacement template is validated as a
  non-empty directory and fully staged beside the live tree before anything is
  deleted; the swap is then two atomic renames. A failed or empty source aborts
  the update with the existing `_byan` left intact (previously `_byan` was
  `rm -rf`'d up front, so a failing install left the project relying on backup
  rollback).
- **Non-interactive support.** `update` accepts `-y/--yes` and
  `--non-interactive`, and auto-confirms when `--force`, `--yes`,
  `--non-interactive`, or a non-TTY stdout is detected. In CI / headless / piped
  runs the updater no longer hangs on the `Y/n` prompt.
- **Honest diagnostics.** A template that cannot be used now reports whether the
  package could not be resolved at all vs. the template directory being present
  but empty, and prints the probed paths — instead of the misleading
  "_byan directory not found in npm package" that blamed a healthy package.

Covered by `update-byan-agent/__tests__/apply-update.test.js` (11 tests:
local resolution, full Gen2->Gen3 replace, stub refresh, swap atomicity, and the
destructive-safety guard). The updater bin now reports its real package version
instead of a stale hard-coded literal.

---

## [2.19.1] - 2026-06-02

### Fixed - Agent stubs repointed to the by-type (Gen3) layout

2.19.0 shipped the platform on the Gen3 by-type layout (`_byan/agent/<name>/`),
but the Copilot CLI stubs (`.github/agents/*.md`) and the `byan-byan-test`
Claude skill still loaded agents from the old Gen2 module paths
(`_byan/bmb/agents/<name>.md`) with no fallback. On a fresh AUTO-mode install,
or after `update-byan-agent` refreshed the stubs, those loaders pointed at files
that no longer exist at that path, so the agent failed to load.

- Every shipped stub now loads agents Gen3-first with a legacy fallback:
  `_byan/agent/<name>/<name>.md (new layout); if absent, _byan/*/agents/<name>.md (legacy layout)`.
  Both loader forms are covered (`LOAD the FULL agent file from ...` and the
  `<step>Load persona from ...` activation form), in the template and at the
  repo root.
- The `byan-byan-test` Claude skill stub points Gen3-first as well.
- A regression guard (`install/__tests__/template-gen3-layout.test.js`) asserts
  no shipped stub references a Gen2-only agent path, so this cannot drift back.

The repoint is layout-agnostic: a project still on Gen2 keeps resolving via the
legacy fallback, a Gen3 project resolves the new home first. This makes both the
fresh install and the update path non-breaking regardless of which layout the
target project is on.

---

## [2.19.0] - 2026-06-01

### Added - Platform migrated to the by-type (Gen3) layout

The 2.18.0 tooling could migrate `_byan/` to the by-type layout, but the
platform code still resolved the old module layout. This release makes the read
side layout-aware, then executes the physical cutover (Phase B), and finally
makes fresh installs born on the by-type layout. The platform repo, the install
template and the resolver are now all on Gen3, with a Gen2 fallback retained for
existing installs.

#### Read side — layout-aware resolution (F12-F14)

- **F12 — read-side layout resolver.** New `src/byan-v2/lib/layout-resolver.js`
  resolves agents, soul/tao, knowledge, memory and config Gen3-first with a Gen2
  fallback. Adopted across `elo-store`, the fact-check stack, the agent packager,
  the webui chat bridge/detector, the stub generators and the Claude Code hooks.
- **F13 — webui `api.js`.** Moved off the dead Gen1 `_bmad/` tree: install
  detection, rollback target, the scaffolded skeleton and the base-config writer
  now use `_byan/` (tolerant of a legacy `_bmad/` checkout). The base-config
  writer guards on `resolveConfig()` so it does not shadow the authoritative
  `_byan/bmb/config.yaml`.
- **F14 — completeness audit + the breaks it surfaced.** A multi-agent audit of
  all layout-path references confirmed 7 breaks the resolver adoption had missed:
  6 drifted `install/templates/.claude/hooks/*` mirrors (re-synced to their
  already-correct source twins) and `install/src/webui/chat/session-manager.js`
  (chat history dir hardcoded to `_byan/_memory/`, now resolved Gen3-first).

#### Cutover — the physical move (F16-F18)

- **F16 — migration map completed + body-reference rewriter.** The migration map
  gained the retained-module rule (module `config`/`help`/`teams`/`data` and core
  `base`/`activation`/`model-selector` stay in place), the testarch and resources
  rules, and the workers move. New `rewrite-refs.js` + `byan-rewrite-refs` CLI
  rewrite intra-file `_byan/...` references for `move` entries only, so the pass
  is idempotent (`split`/`keep` targets stay untouched).
- **F18 — Phase B executed.** The platform `_byan/` tree was physically moved to
  the by-type layout: agents to `agent/<name>/`, workflows to `workflow/simple/`,
  knowledge to `connaissance/`, memory to `memoire/`, tasks to `command/`,
  workers to `worker/`, and the root soul to `agent/byan/`. Content references and
  manifest path columns were rewritten and `INDEX.md` regenerated. `config.yaml`
  was left in place (its readers depend on the keys a split would separate). The
  flagship-agent collision (byan/marc/rachid existing in both the flat and a
  module dir with different bodies) resolves module-wins: the module copy is
  canonical at `_byan/agent/<name>/<name>.md`, the flat copy preserved at
  `_byan/agent/<name>-flat/`.

#### Tooling and enforcement (F16, F19, F20)

- **F19 — yanstaller migrates existing projects.** The update hook
  (`install/lib/fs-migration-hook.js`) runs the full chain — `migrate-fs` ->
  `rewrite-refs` -> `rewrite-manifests` -> `reconcile-manifests` -> `build-index`
  — so an existing install converges to the by-type layout. It stays dormant
  unless `BYAN_FS_MIGRATE=1` or `_byan/_config/migrate-fs.enabled` is set, and it
  backs up `_byan/` before acting. New `byan-rewrite-manifests` CLI rewrites the
  manifest path columns.
- **F20 — strict scope-guard glob fix.** `matchesPrefix` reduced a glob to its
  literal prefix before matching, so an `allowedPath` like `_byan/**` or
  `src/**/*.test.js` is honored instead of refusing writes inside the intended
  directory; non-glob prefixes keep their exact behavior.

#### Born Gen3 — fresh installs (F21)

- **F21 — install template on the by-type layout.** `install/templates/_byan/`
  was migrated to Gen3 (the same chain, with the bundled MCP server left
  byte-identical), and `create-byan-agent-v2.js` was updated to match: the copy
  whitelist now lists the by-type dirs (`agent`, `workflow`, `connaissance`,
  `command`, `worker`, `memoire`) alongside the retained module dirs, and the
  active soul (soul/tao/soul-memory/creator-soul) is written to
  `_byan/agent/byan/` so it resolves Gen3-first. A new
  `install/__tests__/template-gen3-layout.test.js` guards the template shape and
  the installer whitelist against a regression to Gen2.

### Notes

- The Gen2 fallback in the resolver remains, so an install that predates this
  release keeps working; the F19 hook converts it to Gen3 on update when enabled.
- `byan_version` in the installed configs is unchanged (separate axis, per the
  2.18.0 release convention).
- See `docs/refactor/` for the per-feature notes: `F12-layout-adoption.md` (read
  side), `F7-migration-map.md` (map + rewriter) and `README.md` (index).

---

## [2.18.0] - 2026-05-27

### Added - BYAN refactor: workflow atomisation + by-type file system tooling

Refactor `_byan/` from the BMAD module layout toward an explicit by-type layout,
and atomise the dev workflow. Design + tooling delivered (FD byan-refactor-cli-workflows,
10 features under Strict Mode, 99/99 tests). See `docs/refactor/README.md`.

#### Tooling (shipped in install/templates/_byan/mcp/byan-mcp-server/)

- **`byan-build-index`** — generates `_byan/INDEX.md` (cross-platform FS map) from the
  manifests; deterministic and idempotent.
- **`byan-migrate-fs`** — migrates the legacy module layout to the by-type layout;
  idempotent, non-destructive (a customized target is preserved, not overwritten),
  dry-run by default.
- **`migration-map`** — pure mapping legacy -> by-type with collision/provenance handling.
- **`byan-reconcile-manifests`** — dedups the `*-manifest.csv` files.
- **yanstaller wiring (dormant)** — `install/lib/fs-migration-hook.js`, called in the
  update flow. Acts only when explicitly enabled AND the legacy layout is present
  (backs up `_byan/`, then migrate -> reconcile -> build-index); a no-op otherwise.
  Awaits platform adoption of the new layout before activation.

#### Design (docs/refactor/)

- Merise data dictionary + MCD (12 entities), `workflow_dev` spec, `cdcf` simple workflow,
  target arborescence (SYSTEME + PROJET zones).

#### Fixed

- npm package size: excluded parasitic dev `node_modules` from the tarball (~80MB -> 6.3MB)
  while keeping the required `byan-platform-config` bundle.
- Removed 3 stale `create-byan-agent` CLI variants (canonical: `-v2`).
- Deduped the `drawio` agent-manifest row.

---

## [2.17.0] - 2026-05-27

### Added - BYAN Strict Mode shipped to npm + byan_web persistence

Anti-downgrade enforcement now packaged for `npx create-byan-agent` and backed by the byan_web API.

#### Strict Mode distribution

- Mirrored the full strict feature into `install/templates/` so a fresh install ships it: MCP tools (`byan_strict_*`), Claude Code hooks (Stop / PreToolUse / UserPromptSubmit), the `byan-strict` skill, `strict-mode.yaml`, and the generated runtime config.
- `settings.json` template now registers the three strict hooks.
- Installer wires the cross-platform pre-commit gate: copies `.githooks/` and sets `core.hooksPath` when the target is a git repo (`claude-native-setup.js`).

#### Server-side persistence (API authority)

- byan_web migration `033-strict-sessions.sql` + `routes/strict-sessions.js` (POST lock/upsert, PATCH verify/complete/abort, GET list + by id), scoped to the API key user with optional project attachment.
- New `lib/strict-sync.js` isolates network I/O: each local mutation pushes best-effort to the API; `byan_strict_status` and the pre-commit gate consult the API first and fall back to the local mirror when it is unreachable.
- `.mcp.json` carries `BYAN_API_TOKEN` via env (no secret committed).

---

## [2.16.2] - 2026-05-02

### Added - Electron desktop app v1.0 (Linux + Windows)

Commits ea7abf3 + e905bee. App lives in `app/` as a standalone package (not a workspace of the root); builds and publishes independently of `create-byan-agent`.

#### Core shell and security (F1, F2, F12)

- **F1 app shell** — Electron main process in TypeScript (`app/main/`), compiled to `dist/main/`. Window lifecycle, splash, tray (Linux/Win only).
- **F2 IPC contract** — Preload bridge via `contextBridge` (`app/preload/`). All renderer-to-Node calls go through typed IPC channels; `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`.
- **F12 strict CSP** — Content Security Policy header injected by main process; default-src self, no inline scripts, no eval.

#### Local server lifecycle and renderer (F3, F13)

- **F3 lifecycle** — Main process spawns and supervises the existing `install/src/webui/server.js` local server on a free port; emits `server-ready` IPC event to renderer.
- **F13 dev hot reload** — `npm run dev` runs renderer (Vite dev server, port 5173), main watcher (`tsc -w`), and preload watcher concurrently via `concurrently`; `BYAN_DEV=1` env flag switches main to load the Vite URL instead of `dist/renderer/index.html`.

#### Authentication (F5)

- **F5 hybrid login** — Three login modes selectable at runtime: cloud (`byan.acadenice.fr`), local (auto-detected server), custom URL. Mode persisted in app config; switchable from the native menu.

#### Onboarding (F4)

- **F4 5-step onboarding** — Welcome -> Platform detection -> Config preview -> Apply -> Done. Covers Linux and Windows; macOS branch present but gated (F21 deferred). Onboarding state persisted via Electron store; skipped on subsequent launches.

#### Secure storage (F6)

- **F6 keytar** — API tokens stored via `keytar` (libsecret on Linux, Credential Manager on Windows). Token stored in the OS keychain, not in plaintext config files; IPC `get-token` / `set-token` channels exposed through preload only.

#### Native integration (F19)

- **F19 native menu** — Application menu built with `Menu.buildFromTemplate`; entries: File (quit), Edit (cut/copy/paste/select-all), View (reload, devtools in dev mode), Help (about). Consistent on Linux and Windows.

#### Cross-platform build (F10)

- **F10 build** — `npm run build` compiles main + preload (TypeScript) and bundles renderer (Vite). `npm run build:linux` produces AppImage + deb via electron-builder. `npm run build:win` produces NSIS installer via cross-compilation (Wine on Linux CI or native Windows runner).

#### CI matrix (F11, P1)

- **F11 + P1 GitHub Actions matrix** — Workflow `.github/workflows/electron-ci.yml` runs on `ubuntu-latest` (Linux build + unit tests) and `windows-latest` (Windows build + unit tests) in parallel. Draft GitHub Release created automatically when a `v*` tag is pushed; AppImage, deb, and NSIS installer attached as artifacts.

#### Test suite (F18)

- **F18 E2E Playwright** — Playwright suite in `app/__tests__/` using `playwright-electron`; covers: app launch, onboarding flow, login modal, token store round-trip, native menu visibility. `npm run test:e2e` runs the full suite headlessly.

### Changed

- `install/src/webui/server.js` and `install/src/webui/api.js` — minor edits to support port-injection from the Electron main process (F3: server accepts `BYAN_PORT` env var, binds to `127.0.0.1` only, emits a ready signal to stdout that main process parses).

### Notes

- **F21 macOS** — deferred; code branch exists, not tested, no CI runner. Target: v1.1.
- **F9 auto-update** — electron-updater integration deferred to P2 (v1.1). Update check menu item is present but inert.
- **F14 MCP control panel** — deferred to P2 (v1.1).
- **First CI run** — push tag `v0.1.0-rc` to trigger the first draft release and validate artifact upload end-to-end before promoting to `v1.0.0`.

---

## [2.9.10] - 2026-04-21

### Fixed - MCP auth scheme wrong for byan_web API keys

- **`authHeaders()` in `install/templates/_byan/mcp/byan-mcp-server/server.js`** now auto-detects the auth scheme: tokens prefixed `byan_` use `Authorization: ApiKey <token>` (byan_web convention), everything else falls back to `Bearer`. Previously everything was sent as `Bearer`, which byan_web rejects with 401, and the MCP tools silently returned empty fallback payloads (`{projects: []}`).
- **Verified** against `https://byan-api.stark.a3n.fr/api/auth/me` with a real byan_web API key → `HTTP 200`, user identified.

---

## [2.9.9] - 2026-04-21

### Fixed - MCP copy filter broke on global npm install (root cause of 2.9.6 bug)

- **`copyMcpServer` filter now resolves paths relative to the template src** — the previous filter `(s) => !s.includes('node_modules')` inspected the absolute path, so when BYAN was installed globally (e.g. `/usr/local/lib/node_modules/create-byan-agent/...`), every template file looked like it lived under `node_modules` and was silently skipped. The empty `_byan/mcp/byan-mcp-server/` dossier observed on 2.9.6/2.9.7/2.9.8 had this cause — the post-copy assertion added in 2.9.7 only surfaced the symptom.
- **`makeNodeModulesFilter(srcRoot)` extracted and exported** — used by `copyMcpServer`; splits the relative path on path separators and skips any component named `node_modules`.
- **Regression test** added that builds a filter rooted at `/usr/local/lib/node_modules/create-byan-agent/.../byan-mcp-server` and confirms `server.js` passes while a nested `node_modules/` subdir is rejected.
- **Observed on**: `sudo npm install -g create-byan-agent@2.9.8` → `npx create-byan-agent` → `MCP server copy produced no server.js`.

---

## [2.9.8] - 2026-04-21

### Fixed - `update-byan-agent` CLI broken on fresh npm install

- **`update-byan-agent/` added to `package.json` `files` array** — previously only `update-byan-agent/bin/` shipped (because it was listed in `bin`), but `update-byan-agent/lib/` (analyzer, backup, customization-detector) was missing. Running `update-byan-agent` crashed with `Cannot find module '../lib/analyzer'`.
- **Observed on**: npm install 2.9.7, `cd ~/byan_web && update-byan-agent` → `MODULE_NOT_FOUND`.

---

## [2.9.7] - 2026-04-21

### Fixed - MCP server empty-directory install bug

- **`copyMcpServer` now asserts `server.js` exists after copy** — previously, a partial copy could leave `_byan/mcp/byan-mcp-server/` empty, causing Claude Code to fail with `Cannot find module '.../server.js'` on the next launch. The post-copy check now throws a clear error instead of silently succeeding.
- **`create-byan-agent-v2.js` surfaces Claude native-setup failures in red** — prior behavior showed a yellow "partial" warning that users missed; now the failure is explicit and points at the MCP directory to inspect.
- **Regression test** added in `claude-native-setup.test.js` that mocks `fs.copy` to a no-op and verifies the post-copy assertion throws.
- **Observed on**: byan_web install with 2.9.6, dossier `_byan/mcp/byan-mcp-server/` vide, MCP failed in Claude Code.

---

## [2.7.0] - 2026-02-21

### Added - Soul System + Tao System

#### Tao System (Voice Directives)

**New concept: Agent Tao** -- Each agent now has a `tao.md` that defines HOW they speak. The soul says WHO you are, the tao says HOW you show it.

- **Tao agent** (`_byan/agents/tao.md`) -- Voice Director, forges and audits agent voices
- **tao-template.md** -- 7-section template: Register, Signatures, Temperature, Forbidden Vocabulary, Non-dits, Emotional Grammar, Concrete Examples
- **BYAN tao** (`_byan/tao.md`) -- BYAN's voice: "Attends -- pourquoi ?", "OK. On construit.", "Ca, c'est du generique."
- **Step 2b/2c loading** -- Tao loaded silently during activation, after soul
- **TAO rule** -- Injected into all agents with tao files
- **Anti-uniformity test** -- Each tao verified: if you remove the name, you still know who speaks
- **3-layer voice model** -- Creator accent (shared) + Module accent (profession) + Agent accent (individual)
- **16 tao files created** -- BYAN + 7 BMM + 5 CIS + TEA + Core + Forgeron
- **Creation workflow integration** -- interview-workflow and quick-create now generate tao alongside soul

#### Soul System

**New concept: Agent Souls** -- Each BYAN agent now has a `soul.md` that provides personality and behavioral guardrails, distilled from the creator's values through a psychological interview ("forge").

#### Architecture

- **Two-layer soul**: Immutable core (3 truths from creator, never modified) + living layer (evolves through experience, user-validated)
- **Inheritance chain**: `creator-soul.md` -> BYAN `soul.md` -> each agent's `{id}-soul.md`
- **Soul memory**: Living journal (`soul-memory.md`) that captures resonances, tensions, and insights across sessions
- **Anti-dissonance protocol**: Entries validated against immutable core before writing
- **Periodic revision**: Every 14 days, agent runs a 5-question auto-diagnostic on its living layer

#### Core Files

- `_byan/creator-soul.md` -- Yan's immutable soul (source of all agent souls)
- `_byan/soul.md` -- BYAN's soul distilled from creator
- `_byan/soul-memory.md` -- BYAN's living journal

#### Workflows

- `forge-soul-workflow.md` -- 4-phase psychological interview (Blessure -> Fierte -> Coleres -> Essence)
- `soul-memory-update.md` -- Automatic memory update (introspection -> proposal -> anti-dissonance -> writing)
- `soul-revision.md` -- Periodic 5-question auto-diagnostic

#### Agent & Integration

- **Le Forgeron** -- Dedicated soul forging agent (`_byan/bmb/agents/forgeron.md`) with its own soul
- **[FORGE] menu** -- Added to BYAN for direct soul forging from menu
- **[SOUL] menu** -- View/edit BYAN's soul from menu
- **EXIT hook** -- Mandatory soul introspection before quitting any session
- **Mid-session triggers** -- Emotion patterns (frustration, pride, tension) trigger immediate introspection

#### Soul Inheritance in Agent Creation

- `soul-template.md` -- Template used when BYAN creates new agents
- `soul-memory-template.md` -- Template for new agent soul memories
- Interview and quick-create workflows updated to generate soul as deliverable
- `base-agent-template.md` updated with step 2a (soul loading), SOUL rule, SOUL-MEMORY rule, exit hook, revision check

#### Soul Compliance (Validation)

- Step 5b added to `validate-agent-workflow.md` -- 8-point soul compliance checklist
- Scoring: -10% per WARNING, -20% per FAIL, <60% = rework needed

#### 23 Agent Souls Created

| Module | Agents |
|--------|--------|
| BYAN | byan, forgeron |
| BMM (7) | analyst, architect, dev, pm, quinn, sm, ux-designer |
| CIS (5) | brainstorming-coach, creative-problem-solver, design-thinking-coach, innovation-strategist, presentation-master |
| TEA (1) | tea (Murat) |
| Core (1) | bmad-master |
| _byan (7) | skeptic, marc, rachid, yanstaller, turbo-whisper, jimmy, mike |

#### Creator's Immutable Core (from Forge)

1. "Il y a toujours une solution -- trouver la meilleure ou la moins pire"
2. "La verite avant tout -- le mensonge est une trahison fondamentale"
3. "Tout le monde merite le respect -- sans condition"

---

## [2.5.0] - 2026-02-19

### 🔄 Version Update

**Minor version bump to 2.5.0**

- Updated package version from 2.4.6 to 2.5.0
- Synchronized version references in README.md and package.json description
- Preparation for new features and improvements

---

## [2.4.5] - 2026-02-12

### 🐛 Fixed - Copilot CLI Auth Command

**Problem:** Auth check used `gh auth status` instead of `copilot --version`. GitHub CLI (gh) is separate from Copilot CLI.

**Fix:** 
- Auth check: `gh` → `copilot --version`
- Login instruction: `gh auth login` → `copilot auth`

---

## [2.4.4] - 2026-02-11

### 🐛 Fixed - Config Prompt Scope Bug

**Problem:** `config.userName` was undefined when user skipped interview or Turbo Whisper installation, causing crashes.

**Root Cause:** The `const config = await inquirer.prompt(...)` was inside the `if (installMode === 'custom' && interviewResults)` conditional block. Users taking other paths never got prompted for their name.

**Fix:** Moved user config prompt (name + language) BEFORE the conditional block so it's asked for ALL installation modes.

```javascript
// Before: config defined inside conditional (bug)
if (installMode === 'custom' && interviewResults) {
  const config = await inquirer.prompt(...); // Only for custom mode!
  ...
}
// config.userName → undefined for auto/express modes

// After: config defined before conditional (fixed)
const config = await inquirer.prompt([...]); // Asked for ALL modes
if (installMode === 'custom' && interviewResults) {
  // config available here
}
// config.userName → always defined
```

---

## [2.4.3] - 2026-02-11

### 🐛 Fixed - Codex Trusted Directory + Auth Loop

**Codex Fix:** Added `--skip-git-repo-check` to `codex exec` command to allow Phase 2 chat when not inside a trusted git repository.

**Auth Flow Improvement:** Replaced simple version check with real authentication verification:
- **Copilot**: `gh auth status` (actual login check)
- **Claude**: `claude -p "reply OK" --max-turns 1` (real API call)
- **Codex**: version check (no auth status command available)

If not authenticated, user gets 3 choices: Retry (loop), Auto mode (skip AI chat), or Cancel. No more silent bypass.

---

## [2.4.2] - 2026-02-11

### 🐛 Fixed - Claude Phase 2 System Prompt Separation

**Problem:** On Windows 11, Claude Code Phase 2 chat responded with generic "How can I help you today?" instead of acting as Yanstaller persona.

**Root Cause:** `claude -p "entire_blob"` treats the argument as a user query, not system instructions. The entire system context (Hermes docs, agent catalog, conversation history, instructions) was passed as `-p` argument. Claude ignored it and responded with its default greeting.

**Fix:** Split system prompt from user message using proper Claude Code CLI flags:
- System context → `--append-system-prompt-file` (temp file, auto-cleaned)
- User message → `-p` (just the actual user query)

```javascript
// Before (broken): everything as -p argument
runCliCommand('claude', ['-p', fullPrompt], projectRoot);

// After (fixed): proper separation
runCliCommand('claude', [
  '-p', message,                          // user query only
  '--append-system-prompt-file', tmpFile   // system context in file
], projectRoot);
```

**Impact:** Claude Code Phase 2 now correctly receives Yanstaller persona, Hermes knowledge, and conversation history as system instructions while treating user input as the actual query.

---

## [2.4.0] - 2026-02-11

### ✨ Added - Claude Code Native Agent Integration

**New Feature: BYAN agents natively integrated with Claude Code**

Claude Code uses `.claude/CLAUDE.md` and `.claude/rules/*.md` for project memory.
Yanstaller now creates this structure automatically when Claude is detected.

**Files Created in User Project:**
```
.claude/
  CLAUDE.md                      # Main project memory with Hermes entry point
  rules/
    hermes-dispatcher.md         # Hermes commands, routing rules, pipelines
    byan-agents.md               # 35+ agents across 5 modules (tables)
    merise-agile.md              # Methodology, mantras, dev cycle, test levels
```

**Hermes Always Included:**
- Hermes dispatcher is the universal entry point on ALL Claude Code projects
- `CLAUDE.md` references Hermes and links to rules via `@.claude/rules/` imports
- Claude Code auto-loads all `.claude/rules/*.md` at session start

**How It Works:**
- User runs `npx create-byan-agent` and selects Claude Code platform
- Yanstaller detects Claude and installs `.claude/` structure
- Claude Code reads `CLAUDE.md` + all `rules/*.md` at every session start
- User asks "quel agent pour mon projet?" → Claude knows Hermes and all agents
- No MCP server needed for agent knowledge (native Claude Code memory)

**Verification:**
- Installation checks: CLAUDE.md, rules/ directory, hermes-dispatcher.md
- Updated success message with Claude-specific activation instructions

**Based on Claude Code SDK:**
- Uses official `.claude/rules/*.md` modular rules system
- Uses `@path` import syntax for cross-referencing
- Rules auto-loaded per session (no manual configuration)

---

## [2.3.8] - 2026-02-11

### 🐛 Fixed - Windows 11 + Claude Code Compatibility

**Cross-Platform CLI Execution:**
- Replaced `execSync` with `spawnSync` in Phase 2 chat (no shell = no character interpretation)
- On Unix: args passed directly (no `@`, `$`, `%` interpretation)
- On Windows: `shell: true` for `.cmd` file support, stdin for long prompts
- Removed all bash-only syntax: `$(cat ...)`, `2>/dev/null`, single-quote escaping

**Version Display Fix:**
- `BYAN_VERSION` now reads from `package.json` (was hardcoded as `2.3.0`)
- Banner now shows correct installed version

**Claude-Aware Model Selection:**
- When Claude platform selected, model switches from `gpt-5-mini` to `claude-haiku-4.5`
- `generateDefaultConfig()` now accepts `selectedPlatform` parameter
- Display: "Model adapte: claude-haiku-4.5 (plateforme: Claude)"

**Claude Auth Improvements:**
- Login command fixed: `claude login` (was `claude auth`)
- Shows 3 connection methods on failure:
  1. `claude login` (OAuth)
  2. `export ANTHROPIC_API_KEY=sk-ant-...`
  3. `/login` dans Claude Code
- Auth error detection in Phase 2 chat with specific guidance

**Files Modified:**
- `install/lib/phase2-chat.js`: New `runCliCommand()` helper, cross-platform `sendChatMessage()`
- `install/bin/create-byan-agent-v2.js`: `spawnSync` imports, dynamic version, platform-aware model

---

## [2.3.7] - 2026-02-11

### 🐛 Fixed - Codex Prompt Escaping

**Issue:** Bash interpreted `@hermes` as shell command in Codex prompts
- Phase 2 chat with Codex failed with `/bin/bash: ligne 1: @hermes : commande introuvable`
- Root cause: `echo "${prompt}"` with double quotes allowed bash to interpret special characters
- The Hermes documentation contains `@hermes` examples, which bash tried to execute

**Fix:**
- Changed `install/lib/phase2-chat.js`: Use single quotes for Codex echo command
- Escape single quotes within content: `replace(/'/g, "'\\''")` 
- Prevents bash from interpreting `@`, `$`, backticks, and other special chars
- Copilot and Claude already working (direct arguments, not shell expansion)

**Impact:** Yanstaller Phase 2 now works correctly with Codex platform

---

## [2.3.6] - 2026-02-11

### ✨ Enhanced - Hermes in Yanstaller Knowledge Base

**Feature:** Yanstaller Phase 2 now knows complete BYAN ecosystem
- Added full Hermes documentation to Phase 2 system prompt (~1500 tokens)
- Documents all 35+ agents across 5 modules (Core, BMM, BMB, CIS, TEA)
- Includes 7 predefined workflows with agent chains
- Explains smart routing capabilities and pipelines
- Yanstaller recommends Hermes as universal entry point

**Knowledge Expansion:**
- Before: ~300 tokens (basic user profile)
- After: ~1500 tokens (complete ecosystem)
- 5x increase in contextual intelligence

**Impact:** Users asking about Hermes or agents get intelligent, informed responses

---

## [2.3.5] - 2026-02-11

### 🐛 Fixed - Multi-Platform CLI Commands

**Issue:** Codex and Claude commands were incorrect
- Codex: `codex -p "prompt"` doesn't exist (wrong flag)
- Claude: `claude -p "prompt" --no-input` used wrong flags
- Both failed during Phase 2 chat in Yanstaller

**Fix:**
- `install/lib/phase2-chat.js`:
  - Codex: Changed to `codex exec` with stdin (line 175)
  - Claude: Changed to `claude -p` print mode (line 184)
  - Copilot: Already correct with `-p` flag

**Verified:**
- Copilot: `copilot -p "prompt" -s` ✓
- Codex: `echo "prompt" | codex exec` ✓
- Claude: `claude -p "prompt"` ✓

---

## [2.3.4] - 2026-02-11

### 🐛 Fixed - Yanstaller Phase 2 Config Bug

**Issue:** ReferenceError during Phase 2 chat initialization
- Error: `Cannot access 'config' before initialization`
- Root cause: `config` variable used at line 737 but defined at line 817
- Phase 2 chat failed to start

**Fix:**
- `install/bin/create-byan-agent-v2.js`: Moved config prompt to Phase 1.5 (before Phase 2 chat)
- Config now collected at lines 714-729 (userName, language)
- Passed to `launchPhase2Chat()` as parameters
- Removed duplicate config definition

**Impact:** Yanstaller Phase 2 now starts correctly with all platforms

---

## [2.3.3] - 2026-02-10

### 🐛 Fixed - GitHub Repository URLs

**Issue:** README and package.json pointed to wrong GitHub repository
- Old URL: `github.com/yannsix/byan-v2` (incorrect)
- Correct URL: `github.com/Yan-Acadenice/BYAN`

**Changes:**
- `README.md`: Updated 10 GitHub link occurrences
- `package.json`: Updated repository URLs (3 occurrences)
  - repository.url
  - bugs.url
  - homepage

**Impact:** Users can now find correct repository and report issues properly

---

## [2.3.2] - 2026-02-10

### 🏛️ Added - Hermes Universal Dispatcher

**Major Feature: Hermes Agent**
- New `hermes` agent: Universal dispatcher for entire BYAN ecosystem (573 lines XML)
- Intelligent routing to 35+ specialized agents across 5 modules
- 6-step mandatory activation sequence with config loading
- Menu-driven interface with 9 commands (LA, LW, LC, REC, PIPE, ?, @, EXIT, HELP)
- Smart routing rules: keyword-based agent recommendations
- 7 predefined pipelines (Feature Complete, Idea→Code, Bug Fix, etc.)
- Fuzzy matching for agent names
- Quick help system without loading full agents
- Multi-agent pipeline suggestions for complex goals

**Integration:**
- Added Hermes entry to agent-manifest.csv (first entry - core module)
- Created HERMES-GUIDE.md: Complete 10k+ word documentation
- Routing rules for all 35+ agents (bmm, bmb, cis, tea, core modules)
- Manifest-driven architecture (agent-manifest, workflow-manifest, task-manifest)

**Capabilities:**
1. **[LA]** List Agents - Display all 35+ agents by module
2. **[LW]** List Workflows - Show available workflows
3. **[LC]** List Contexts - Discover project contexts
4. **[REC]** Smart Routing - Recommend best agent(s) for task
5. **[PIPE]** Pipeline - Multi-agent workflow suggestions
6. **[?]** Quick Help - Brief agent info without loading
7. **[@]** Invoke - Direct agent activation
8. **[EXIT]** Exit Hermes gracefully
9. **[HELP]** Redisplay menu

**Files:**
- `install/templates/.github/agents/hermes.md` (573 lines, 168 XML tags)
- `install/HERMES-GUIDE.md` (10k+ words, complete usage guide)
- Updated `install/templates/_byan/_config/agent-manifest.csv` (Hermes first)

### 🐛 Fixed - Node.js 12 Compatibility

**Issue:** Optional chaining operator (`?.`) caused syntax errors on Node 12
- Node 12 doesn't support optional chaining (requires Node 14+)
- Server installations with older Node versions failed

**Changes:**
- Replaced all optional chaining in `install/` directory (9 instances across 5 files):
  - `install/bin/create-byan-agent-v2.js` (4 fixes)
  - `install/lib/phase2-chat.js` (1 fix)
  - `install/lib/yanstaller/platform-selector.js` (2 fixes)
  - `install/lib/yanstaller/agent-launcher.js` (2 fixes)
- Changed `package.json` engines requirement: `node >=18.0.0` → `>=12.0.0`
- All optional chaining replaced with explicit null checks

**Before:**
```javascript
interviewResults.agents.essential?.join(', ')
config?.communication_language || 'English'
```

**After:**
```javascript
interviewResults.agents.essential ? interviewResults.agents.essential.join(', ') : ''
config ? config.communication_language : 'English'
```

**Documentation:**
- Created `TEST-GUIDE-v2.3.2.md` with Node 12+ verification steps

### 🔧 Technical Details

**Hermes Architecture:**
- XML-based agent definition with mandatory activation
- 6-step activation: Load persona → Load config → Store vars → Display menu → Wait → Process
- Handler system: number, command, invoke, fuzzy
- Manifest-driven: Reads CSV files at runtime (never pre-load)
- Fail-fast error handling with actionable suggestions
- KISS principle: Minimal interface, maximum efficiency

**Mantras Applied:**
- #7: KISS (Keep It Simple, Stupid)
- #37: Ockham's Razor - Simplicity first
- #4: Fail Fast - Immediate actionable errors
- IA-21: Self-Aware Agent - "I dispatch, I do not execute"
- IA-24: Clean Code - Minimal, clear communication

**Agent Manifest:**
- 35+ agents across 5 modules (core, bmm, bmb, cis, tea)
- CSV format: name, displayName, title, icon, role, identity, style, principles, module, path
- Hermes entry: First line (dispatcher priority)

### 📚 Documentation

**New Guides:**
- `install/HERMES-GUIDE.md`: Complete Hermes documentation
  - Overview and installation
  - All 9 commands with examples
  - Routing rules table
  - Predefined pipelines
  - Troubleshooting
  - Roadmap

- `TEST-GUIDE-v2.3.2.md`: Node 12+ compatibility guide
  - Verification steps
  - Before/after code examples
  - Testing checklist

### 🎯 Use Cases

**Hermes Examples:**

1. **New Project Discovery:**
   ```bash
   @hermes
   [1] [LA]  # List all agents by module
   [?dev]    # Quick info on Dev agent
   @dev      # Invoke Dev agent
   ```

2. **Smart Routing:**
   ```bash
   @hermes
   [4] [REC]
   # User: "créer API backend avec tests"
   # Hermes recommends: PM → Architect → Dev → Tea
   ```

3. **Pipeline Creation:**
   ```bash
   @hermes
   [5] [PIPE]
   # User: "feature complète de A à Z"
   # Hermes suggests: PM → Architect → UX → SM → Dev → Tea
   ```

### 🔄 Migration from 2.3.0/2.3.1

**No Breaking Changes** - Fully backward compatible

**New in 2.3.2:**
- Hermes agent available via `@hermes`
- Improved Node 12+ support (was 18+ in 2.3.0/1)
- Enhanced agent discovery via manifest

**Upgrade:**
```bash
npm install -g create-byan-agent@2.3.2
```

**Or via npx (always latest):**
```bash
npx create-byan-agent
```

### 📦 Package Info

**Size:** ~1.4 MB, 900+ files  
**Dependencies:**
- Required: commander, inquirer, fs-extra, chalk, winston, dotenv
- Optional: byan-copilot-router (cost optimizer)

**Engines:**
- Node.js: >=12.0.0 (was >=18.0.0 in 2.3.0/1)
- npm: >=6.0.0

### 🚀 Performance

**Hermes Performance:**
- Menu display: <50ms
- Agent list (35+): <100ms
- Smart routing: <200ms
- Agent invocation: <500ms
- Manifest parsing: <100ms (CSV)

**Install Performance:**
- Yanstaller: ~30-60 seconds (unchanged)
- Cost Optimizer: +5 seconds if enabled (optional)

---

## [2.3.1] - 2026-02-10

### 🔧 Fixed - Yanstaller Integration Issues

**Issue:** Yanstaller didn't prompt for platform or verify authentication

**Changes:**
- Added platform selection question after detection (Copilot/Codex/Claude)
- Added authentication verification with helpful error messages
- Modified `create-byan-agent-v2.js` to add platform selection (+60 lines)
- Updated `phase2-chat.js` to accept selectedPlatform parameter
- Changed `sendChatMessage()` to use selectedPlatform instead of array
- Added fallback to AUTO mode if authentication fails

**Files:**
- `install/bin/create-byan-agent-v2.js` (platform selection logic)
- `install/lib/phase2-chat.js` (platform parameter)
- Commit: "fix: improve Yanstaller integration and error handling"

---

## [2.3.0] - 2026-02-10

### ✨ Added - Cost Optimizer Integration

**Feature: Cost Optimizer Worker**
- Integrated `@byan/copilot-router` (v1.0.1) as optional dependency
- New worker template: `install/templates/_byan/workers/cost-optimizer.js`
- Automatic installation option during Yanstaller setup
- 87.5% cost savings (based on real measurements)

**Changes:**
- Added `byan-copilot-router` to `optionalDependencies` in package.json
- Created cost-optimizer worker template with CopilotRouter integration
- Modified installer to ask: "Activer l'optimiseur de coûts LLM?"
- Auto-copy worker to `_byan/workers/` if enabled
- Worker auto-detects if router module installed

**Worker Features:**
- Complexity analysis (5 factors)
- Intelligent routing: worker (cheap) vs agent (expensive)
- Automatic fallback on worker failure
- Cost tracking and statistics
- JSON/CSV export
- Daily/weekly reports

**Files:**
- `install/templates/_byan/workers/cost-optimizer.js` (202 lines)
- `install/templates/_byan/workers/README.md` (documentation)
- Updated `install/bin/create-byan-agent-v2.js` (installer question)

---

## [2.2.0] - 2026-02-08

### ✨ Added

**New Agents:**
- `hermes` (prototype): Universal dispatcher for BYAN agents
- `marc`: GitHub Copilot CLI integration specialist
- `rachid`: NPM/NPX deployment specialist
- `patnote`: Update manager and conflict resolution
- `carmack`: Token optimizer for BYAN agents

**Developer Experience:**
- Enhanced CLI with better error messages
- Improved platform detection (Copilot/Codex/Claude)
- Auto-detection of installed AI platforms

### 🔧 Changed

- Refactored agent templates for better modularity
- Improved manifest system (agent-manifest.csv)
- Better configuration management

---

## [2.1.0] - 2026-02-05

### ✨ Added

**BYAN v2 Core:**
- Intelligent agent creation via 12-question interview
- 64 mantras integration (Merise Agile + TDD)
- Multi-platform support (GitHub Copilot, Codex, Claude)
- Yanstaller: Smart installer with platform detection
- Agent manifest system
- Workflow manifest system

**Agents:**
- `byan`: Intelligent agent creator
- `bmad-master`: Workflow orchestrator
- `analyst`: Business analyst (Mary)
- `architect`: System architect (Winston)
- `dev`: Developer (Amelia)
- `pm`: Product manager (John)
- `sm`: Scrum master (Bob)
- `quinn`: QA engineer
- `tech-writer`: Documentation specialist (Paige)
- `ux-designer`: UX designer (Sally)
- `quick-flow-solo-dev`: Fast brownfield dev (Barry)
- `brainstorming-coach`: Brainstorming (Carson)
- `tea`: Test architect (Murat)
- And 20+ more specialized agents

**Modules:**
- `core`: Foundation (bmad-master, yanstaller, merise expert)
- `bmm`: Business Modeling & Management (SDLC agents)
- `bmb`: Builder agents (BYAN, agent-builder, etc.)
- `cis`: Creative & Innovation Strategy
- `tea`: Test Architecture

---

## [2.0.0] - 2026-01-15

### 🎉 Initial Release - BYAN v2

**Major Rewrite:**
- Complete platform rewrite from v1.x
- Markdown + YAML agent definitions
- XML-based agent structure
- Multi-platform support
- Module system (core, bmm, bmb, cis, tea)

**Core Features:**
- Intelligent agent creation
- Structured interview process
- Manifest-driven architecture
- Config system with YAML
- Template engine
- Platform detection
- NPX integration

---

## [1.x] - 2025 (Legacy)

**Note:** v1.x was the original BYAN prototype. See git history for details.

---

## Legend

- 🎉 Major release
- ✨ New features
- 🔧 Changes
- 🐛 Bug fixes
- 📚 Documentation
- 🔄 Migration guide
- 💥 Breaking changes
- 🔐 Security fixes
- 🚀 Performance improvements

---

**Latest:** [2.3.2] - Hermes Universal Dispatcher + Node 12+ Support  
**Download:** `npm install -g create-byan-agent@2.3.2`  
**NPX:** `npx create-byan-agent` (always latest)
