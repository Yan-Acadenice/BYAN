# Template Fidelity — keeping the npm package honest

## Why this exists

BYAN ships through npm as `create-byan-agent`. Only `install/templates/` is in
`package.json` `files[]`, so that directory is the entire payload a user installs.
The development code, however, lives at root: `_byan/` and `.claude/`.

There was no mechanism to mirror root into the template. The two diverged
silently, and a published version could promise features (in its CHANGELOG) that
its package did not contain, because the work had landed at root but not in
`install/templates/`.

`byan-sync-template.js` is that mechanism, plus a pre-commit gate that stops the
drift from coming back.

## The model

The mirrored perimeter is **the template itself**. Every file already present
under `install/templates/` is re-synced from its root twin. The tool does not walk
root and copy down, which is what keeps the thousands of dev-only files at root
(tests, build output, `src/`) out of the package.

Growth of the shipped set is explicit: a new file enters the template only by
being added to `TARGET_ADDITIONS` in `lib/template-sync.js` — a reviewed edit, not
a side effect of a glob.

Runtime seeds are excluded: `_byan/memoire/**` holds per-machine state (ELO
scores, the fact graph). Re-syncing them would push dev state into the package, so
they keep their template value.

## Usage

```bash
# Apply: re-sync drifted template files and add the target list.
node _byan/mcp/byan-mcp-server/bin/byan-sync-template.js

# Check: report drift, exit non-zero if any remains. No writes.
node _byan/mcp/byan-mcp-server/bin/byan-sync-template.js --check

# Against a specific repo root (the pre-commit gate uses this form):
node _byan/mcp/byan-mcp-server/bin/byan-sync-template.js --check --root /path/to/repo
```

Apply prints `synced - N updated, M added`. `--check` prints `OK` on a faithful
template, or one `drift:` / `missing:` line per file followed by a non-zero exit.

## The pre-commit gate

`.githooks/pre-commit` runs `--check` as its fourth gate. A commit whose template
has drifted from root is blocked, with the re-sync command in the message. The
gate is a no-op for an installed user: the tool is dev-only, so `[ -f "$TOOL" ]`
is false there and the gate self-disables.

Emergency bypass, as with the other gates: `git commit --no-verify`.

## Workflow when you change a mirrored file

1. Edit the file at root (e.g. a `.claude/workflows/*.js` script or an MCP lib).
2. Run the apply command to propagate the change into the template.
3. Stage both the root change and the template change, then commit.

If you forget step 2, the pre-commit gate catches it and prints the command to
run.

## Files

- `_byan/mcp/byan-mcp-server/lib/template-sync.js` — pure classification
  (`buildPlan` / `checkDrift`) plus the I/O-injected walk and copy (`walkRelFiles`
  / `applyPlan`). The copy is atomic (staged `.tmp`, then rename).
- `_byan/mcp/byan-mcp-server/bin/byan-sync-template.js` — the CLI (`--check` /
  apply).
- `_byan/mcp/byan-mcp-server/test/template-sync.test.js` — 19 unit tests.
- `.githooks/pre-commit` — the fourth gate.
