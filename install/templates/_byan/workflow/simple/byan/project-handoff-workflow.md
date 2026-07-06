---
name: project-handoff
description: "Export/import portable Markdown project state between Claude Code and Codex"
version: "1.0.0"
module: byan
phases: 4
---

# BYAN Project Handoff Workflow

## Purpose

Use this workflow when a BYAN session must move between Claude Code and Codex,
usually because one assistant is close to a usage limit. The handoff artifact is
a Markdown file under `_byan-output/handoffs/`; it is portable repo state, not
native assistant memory.

## Contract

- Source of truth: repository files plus `_byan/` and `_byan-output/`.
- Artifact: `_byan-output/handoffs/<timestamp>-<from>-to-<to>-<task>.md`.
- Format: human-readable Markdown with a parseable `json byan-handoff` block.
- Direction: Claude -> Codex and Codex -> Claude use the same format.
- Native memories (`~/.claude`, `~/.codex`) may help locally but are not needed
  to resume.

## Commands

Export from the current assistant:

```bash
byan-handoff export --from claude --to codex \
  --task "current feature" \
  --summary "what happened so far" \
  --next "first action for the next assistant"
```

Import on the next assistant:

```bash
byan-handoff latest --from claude --prompt
```

Or import a specific file:

```bash
byan-handoff import _byan-output/handoffs/<file>.md --prompt
```

## Phase 1: Export

1. Re-read the active request and any locked BYAN strict scope.
2. Run `byan-handoff export` with explicit `--from`, `--to`, `--task`,
   `--summary`, and at least one `--next`.
3. Add useful optional details:
   - `--decision "..."` for architectural or product decisions.
   - `--command "..."` for tests or checks already run.
   - `--blocker "..."` for gaps, failures, or risks.
   - `--note "..."` for context the next assistant should not rediscover.
4. Report the generated file path to the user.

## Phase 2: Transfer

The user opens the same repository with the other assistant. No hidden copy step
is required when both assistants share the same working tree. If the handoff is
moving to another machine, copy the Markdown file with the repo or paste its
`Resume Prompt` section.

## Phase 3: Import

1. Run `byan-handoff latest --from <source> --prompt` or
   `byan-handoff import <file> --prompt`.
2. Treat the printed prompt as the starting context.
3. Inspect the listed files before editing.
4. Check `_byan-output/fd-state.json` and strict status if the handoff names an
   active FD.

## Phase 4: Continue

1. Continue from the `Next Actions` section.
2. Update the same FD rather than starting a parallel one unless the handoff says
   the old FD is complete or aborted.
3. Before switching back, create a new handoff in the opposite direction.

## Validation Checklist

- [ ] Handoff file exists under `_byan-output/handoffs/`.
- [ ] `byan-handoff latest --from <source> --prompt` prints a usable resume prompt.
- [ ] The next assistant inspected files listed in `Files Touched`.
- [ ] Any strict-mode gaps are surfaced, not hidden.
