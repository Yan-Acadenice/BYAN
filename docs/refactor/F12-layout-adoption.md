# F12 — Platform Gen3 layout adoption (Phase A: read-side)

> The FS migrator (F7/F8) can move files from the legacy module layout to the
> flat semantic layout. F12 makes the platform CODE able to READ both, so that
> migration is non-breaking. This is the read-side adoption; the actual cutover
> (Phase B) stays a user-side, atomic operation.

## The three layout generations

| Gen | Shape | State |
|-----|-------|-------|
| Gen1 | `_bmad/<module>/agents/…` | dead (not on disk) |
| Gen2 | `_byan/<module>/agents/…` + flat `_byan/agents/`, `_byan/knowledge/`, `_byan/_memory/`, root `_byan/soul.md`… | current on disk |
| Gen3 | `_byan/agent/<name>/`, `_byan/connaissance/`, `_byan/memoire/`, `_byan/context/config.yaml`, `_byan/agent/byan/soul.md`… | target (created by the migrator) |

## The read-side resolver

`src/byan-v2/lib/layout-resolver.js` (CJS) is the single read-side authority —
"where does logical thing X physically live?". Every lookup is a pure existence
check (no writes), Gen3-first then Gen2-flat → Gen2-module → Gen1. Idempotent and
additive: before migration it finds Gen2, after migration it finds Gen3, during
the transition either works.

API: `resolveAgent`, `resolveSoul` / `soulPath`, `knowledgePath`, `memoryPath`,
`resolveConfig`, `listAgents`, `agentDirs`, `isAgentPath`, `detectLayout`, `locate`,
`MODULES`.

The WRITE-side authority stays `_byan/mcp/byan-mcp-server/lib/migration-map.js`
(where files SHOULD go). The resolver MODULES list mirrors migration-map's; a
unit test asserts equality so the two stay in sync. They cannot share an import:
the MCP server is a separately shipped ESM package, the root is CJS.

## What adopted the resolver

| Area | Files | Note |
|------|-------|------|
| Knowledge/memory state | `fact-check/index.js`, `knowledge-graph.js`, `elo-store.js`, `byan-v2/index.js` | defaults via `knowledgePath`/`memoryPath` |
| Agent discovery | `agent-packager.js` (`_findAgentFile`, `_getAgentDirectories`), `bridge.js`, `cli-detector.js` | fixes a latent bug: discovery did not search `_byan/<module>/agents/`, so `dev`/`analyst` were invisible |
| Hooks | `mantra-validate.js` (also fixes a `bmb`-only path check), `stage-to-byan.js`, `inject-soul.js`, `inject-tao.js`, `soul-memory-check.js`, `pre-compact-save.js`, `soul-memory-triggers.js` | soul hooks use a self-contained Gen3-first check (a hook must not crash on a failed require) |
| Generators | `platforms/codex.js`, `platforms/copilot-cli.js`, `create-byan-agent-v2.js`, `agent-packager._generateStubs`, `build-copilot-stubs.js` | emit Gen3-first load instructions (with a legacy hint) instead of dead Gen1 `_bmad/*/agents/` |
| Updater (separate npm package) | `update-byan-agent/lib/{analyzer,customization-detector}.js` via new `layout-paths.js` | self-contained mirror — the updater cannot reach the root resolver |
| MCP soul (ESM package) | `soul.js` | self-contained Gen3-first resolution |
| Manifest rewrite | `manifest-reconcile.js` → new `rewritePaths()` / `rewritePathColumn()` | mapPath-driven Gen2→Gen3 path-column rewrite, dry-run by default |

## Out of scope / unchanged

- `migration-map.js` MODULES / KEEP_PREFIXES / `mapPath` (write-side authority).
- `mantra-validator.js` — its `mantras.json` / `strict-mantras.json` live under
  `src/byan-v2/data/`, outside `_byan/`, so the FS migration does not touch them.

## Known gap (deferred — different axis)

`install/src/webui/api.js` is still on **Gen1** `_bmad/`: `isByanInstalled()`
probes `_bmad/` (so it returns false on a real `_byan/` install — a pre-existing
bug), and `ensureDirectoryStructure()` / `writeBaseConfig()` create the old
`_bmad/core/...` module tree. This is the unfinished BMAD→BYAN rename, a Gen1→Gen2
concern on a different axis than this Gen2→Gen3 read-side adoption, and it sits
outside the locked scope (`install/src/webui/chat`, not `install/src/webui`). It
needs its own pass: point the webui at `_byan/`, create the Gen3 layout (or stop
creating module dirs), and resolve installs via `detectLayout`/`resolveConfig`.

## The updater config order (a caught regression)

The authoritative installed config (carrying `byan_version`) is the Gen2 module
config `_byan/bmb/config.yaml`. A stale root `_byan/config.yaml` may also exist.
The updater's candidate order is therefore `context/config.yaml` → `bmb/config.yaml`
→ root `config.yaml`, so version detection stays correct on Gen2. (The general
`resolveConfig` in the root resolver uses context → root → bmb, for the memory_sync
/ bmad_features config; the two concerns are deliberately ordered differently.)

## Phase B (user-side cutover — NOT done here)

1. Run the FS migrator `--apply` on the repo.
2. Run `manifest-reconcile.rewritePaths({ apply: true })` then dedup then
   `buildIndex` — coupled into the same atomic step as the FS move so there is no
   stale window where `INDEX.md` / help menus point at dead paths.
3. Regenerate the emitted stubs (`.codex/prompts/*`, `.github/agents/*`) with the
   now-Gen3 generators so they point at real Gen3 files.
4. Decide the Gen3 home of the unmapped items (the module-config gap:
   `_byan/<module>/config.yaml`; `_byan/core/activation/soul-activation.md`;
   `workers.md`) in `migration-map.js`, then re-run.

## Verification (Phase A)

- `layout-resolver` 35 unit tests (Gen2/Gen3/mixed, idempotence, MODULES sync).
- `soul` 8, `manifest-rewrite` 7, updater 12 — all green; template mirror 15.
- Full jest run: the failure set is identical with and without these changes
  (all baseline: missing `winston`/`js-yaml` dev deps, e2e, api-DB, node:test
  files run by jest). The changes add 35 passing tests and 0 failures.
- Real-repo dry-run of `rewritePaths` reports 695 path changes across 5 manifests
  and writes nothing (`git diff _byan/_config` is clean).
