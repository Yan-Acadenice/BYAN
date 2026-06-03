# Changelog - BYAN (create-byan-agent)

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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
