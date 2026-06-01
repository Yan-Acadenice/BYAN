# F21 — Fresh installs born on the by-type (Gen3) layout

## Problem

After F18 the platform repo `_byan/` is on the by-type layout, and the resolver
reads Gen3-first (F12). But `install/templates/_byan/` — the snapshot the
installer copies into a new project — was still on the module layout. So a fresh
`npx create-byan-agent` install was born on Gen2 while the platform it mirrors is
Gen3. The resolver's Gen2 fallback kept such an install working, but the
documented soul-activation path (`_byan/agent/byan/soul.md`) would miss, and the
install diverged from the platform.

## Who consumed the Gen2 template

| Consumer | Coupling to the Gen2 template | Action |
|----------|------------------------------|--------|
| `install/bin/create-byan-agent-v2.js` | hardcoded Gen2 names: `byanDirs` whitelist, `ensureDir` scaffolding, soul source paths | fixed |
| `update-byan-agent/bin/update-byan-agent.js` | none — `copyRecursive` of the whole `_byan/` tree (layout-agnostic) | safe as-is |
| `install/bin/build-copilot-stubs.js` | none — uses the layout-resolver against the repo root | safe as-is |
| `install/lib/fs-migration-hook.js` (F19) | none — migrates an existing install, not the template | safe as-is |

Only the interactive installer was coupled. The updater copies the template
wholesale, so it benefits from the migration without a change; the F19 hook then
deduplicates a Gen2/Gen3 overlap on update when enabled.

## What was done

### 1. Migrate the template

The same chain F19 runs on a project was run on the template, pointed at it with
`--root install/templates`:

```
byan-migrate-fs       --root install/templates --apply   # 721 moved, 0 conflicts
byan-rewrite-refs     --root install/templates --apply   # 292 files, 842 refs
byan-rewrite-manifests --root install/templates --apply  # 735 path columns
byan-reconcile-manifests --root install/templates --apply
byan-build-index      --root install/templates           # 26 agents, 45 workflows, 7 commands
```

The bundled MCP server (`install/templates/_byan/mcp/`) is excluded from the move
and ref rewrite, and stays byte-identical (verified by hashing before/after).
`config.yaml` stays at the template root (its readers depend on the keys a split
would separate), matching the platform.

### 2. Adopt the layout in the installer

`create-byan-agent-v2.js`, three spots:

- **`byanDirs` whitelist** -> the by-type dirs (`agent`, `workflow`,
  `connaissance`, `command`, `worker`, `memoire`) plus the retained module dirs
  (`core`, `bmb`, `bmm`, `tea`, `cis`), `_config` and `data`. `command` and
  `worker` are included on purpose: their content (core tasks, `workers.md`) was
  installed before via the module/root copies, so omitting them would be a silent
  cut.
- **`ensureDir` scaffolding** -> the Gen3 base dirs (`agent`, `core`, `_config`,
  `memoire`, `_output`); `fs.copy` creates the deep subdirs.
- **soul** -> the active soul (`soul.md`/`tao.md`/`soul-memory.md`/`creator-soul.md`)
  is written to `_byan/agent/byan/` via a new `soulActiveDir`, so it resolves
  Gen3-first and matches `soul-activation.md`. The `*-reference` / `*-template`
  inspiration files stay at the `_byan/` root.

### 3. Guard against regression

`install/__tests__/template-gen3-layout.test.js` (16 tests):

- the template snapshot is structurally Gen3 (byan at `agent/byan/byan.md`, soul
  with the agent, no flat `agents/` or `<module>/agents/*.md`, MCP present);
- the installer whitelist references the by-type dirs and not the Gen2 array;
- replaying the installer copy logic into a tmpdir yields an install whose `byan`
  and `dev` agents and `soul`/`tao` resolve Gen3-first via the layout-resolver.

## Verification

- Template: `agent/byan/byan.md` resolvable, 4 active soul files under
  `agent/byan/`, references at root, `mcp/` hash unchanged, INDEX regenerated.
- Installer: `node --check` clean; a headless replay of the copy logic resolves
  `byan` -> `_byan/agent/byan/byan.md` and soul/tao Gen3-first.
- Root jest: no new regression (baseline 30 failed suites / 15 failed tests
  unchanged; the 16 new tests pass).
- Install jest: the 2 failing suites (`post-install.e2e`, `fs-migration-hook`)
  are pre-existing and exercise files untouched by F21 (`claude-native-setup`,
  `mcp-extensions`, a `node:test` file run by jest).
- MCP migration bins still `--check` and import.
