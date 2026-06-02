# F23 - update-byan-agent hardening (local, non-destructive, non-interactive)

## Problem (field-reported on 2.19.1)

Running `update-byan-agent update` on a real install failed. The published
`_byan` template was verified healthy (810 entries in the tarball, installs
fine) — the bug was entirely in the updater bin. Four defects:

- **BUG3 — redundant network install.** The bin ran
  `npm install --no-save create-byan-agent@latest` into the user project
  (~215 packages, minutes, no timeout, no output) even though it is launched
  via `npx -p create-byan-agent@latest`, i.e. the `@latest` package (and its
  template) is already on disk next to the running bin.
- **BUG2 — destructive non-atomic order.** It `rm -rf`'d the project's `_byan`
  FIRST, then ran the install, then copied. A failing install left `_byan`
  deleted, depending on backup rollback.
- **BUG4 — `--force` is not non-interactive.** `--force` only skipped the
  up-to-date check; an `inquirer` confirm still prompted, so CI / headless /
  piped runs hung on `Y/n`.
- **BUG1 — misleading error.** A failure printed
  `_byan directory not found in npm package`, blaming a healthy package; the
  real cause was the internal install failing/incomplete.

A second-order risk: the `.github/agents`, Claude-native, and fs-migration
refreshes resolved from `node_modules/create-byan-agent`. With BUG3 fixed (no
install), that path would not exist, so the F22 stub refresh would silently
stop happening on update.

## Fix

New module `update-byan-agent/lib/apply-update.js` (pure, no network / inquirer /
spinners), wired into the `update` action:

- **`resolvePackageRoot({ installPath, binDir })`** — resolves the package root
  from the running bin (`path.resolve(binDir, '..', '..')`), with a
  `node_modules/create-byan-agent` fallback for non-`npx` invocations. Throws a
  diagnostic that distinguishes "package not resolvable" from "template present
  but empty", printing probed paths (BUG1, BUG3).
- **`applyUpdate({ installPath, pkgRoot })`** — validates the template `_byan`
  is a non-empty dir BEFORE touching anything, then rebuilds `_byan` and
  `.github/agents` via **`stageAndSwap`**: copy the source into a `.staging`
  sibling, verify non-empty, then two atomic renames (live -> `.prev`,
  `.staging` -> live), then drop `.prev`. On a swap failure the previous content
  is restored and no `.staging` debris is left; a failed `.prev` cleanup is
  swallowed so a committed swap still reports success (BUG2). `.github/agents`
  resolves from the same local `pkgRoot`, so the F22 Gen3 stubs are refreshed
  (no regression).
- The bin's `update` action gains `-y/--yes` and `--non-interactive`, and
  auto-confirms when `--force`, `--yes`, `--non-interactive`, or a non-TTY
  stdin/stdout is detected (BUG4). An interactive TTY without those flags still
  prompts. `--dry-run` still short-circuits before any write. The bin now
  reports its real package version instead of a stale hard-coded `2.6.1`.

Claude-native + fs-migration refreshes were repointed to the local `pkgRoot`.
The customization preserve/restore, backup rollback, and `.mcp.json` migration
behaviors are unchanged.

## What is NOT changed

The published `install/templates/_byan` template — verified healthy in the
field, left untouched. Only the updater (`update-byan-agent/`), the version, and
the CHANGELOG changed.

## Tests

`update-byan-agent/__tests__/apply-update.test.js` (12 tests): local resolution
+ diagnostics, full Gen2-residue -> Gen3 replace, Gen3-first stub refresh, swap
atomicity (no `.staging`/`.prev` residue), stale-residue cleanup, and the
destructive-safety guard (missing/empty source leaves the existing `_byan`
intact). Updater suite 24/24 green. Install jest baseline unchanged (2 known
pre-existing failing suites). The root `e2e-install-update.test.js` failure is
pre-existing (migrate-mcp-config, proven via stash) and unrelated.

## Release

create-byan-agent `2.19.1 -> 2.19.2`; update-byan-agent `1.1.0 -> 1.2.0`.
Republish from the repo root (`npm publish`).
