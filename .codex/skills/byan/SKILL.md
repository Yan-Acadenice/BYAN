---
name: byan
description: BYAN local project skill. Use when working in the BYAN repo, invoking BYAN agents/workflows/commands, enforcing BYAN Strict Mode, or needing the portable BYAN filesystem map.
---

# BYAN Local Skill

Use this skill when the user asks for BYAN behavior, mentions BYAN/BMAD, asks to
run an agent or workflow from this repo, or works on the BYAN platform itself.

## Source Of Truth

BYAN's portable core lives in this repository. Do not treat native assistant
memory, generated caches, or platform-specific projections as authoritative.

Read `_byan/INDEX.md` first to find agents, workflows, commands, and project
artefacts. Avoid broad filesystem scans unless the index is missing, stale, or
insufficient for the requested task.

Core references:

- `_byan/INDEX.md` — filesystem map for BYAN agents, workflows, commands, and projects.
- `AGENTS.md` — Codex adapter for BYAN Strict Mode and delivery defaults.
- `.claude/rules/portable-core.md` — portable-core doctrine: `_byan/` and
  `_byan-output/` are the source of truth; native platform features are
  write-through accelerators.
- `_byan/agent/byan/byan.md` — BYAN core meta-agent when the task requires the
  full BYAN persona and FD workflow.

## Strict Mode

When BYAN Strict Mode is active, follow the audit protocol before delivery:

1. Lock scope with `byan_strict_lock_scope` before building.
2. Build the locked scope without silent downgrade.
3. Run at least three `byan_strict_self_verify` passes against the original
   request and acceptance criteria.
4. Call `byan_strict_complete` only after the final pass is `ok`.

Surface gaps explicitly. Do not round skipped tests, blocked tools, or partial
work up to done.

## Working Rules

- Prefer BYAN's local manifests and `_byan/INDEX.md` over filesystem wandering.
- Keep Codex-specific material under `.codex/` or installed Codex skills under
  `$CODEX_HOME/skills` / `~/.codex/skills`.
- Use existing BYAN agents and workflows instead of inventing parallel
  conventions.
- If a public surface changes, update the matching doc, manifest, template, or
  generated projection when applicable.
- Preserve BYAN's no-emoji convention in code, commits, docs, and prompts.

## Claude/Codex Handoff Import

When the user says `importe depuis claude` or `importe depuis codex`, handle it
without asking for more context if a matching handoff exists:

1. Run `byan-handoff latest --from <requested source> --prompt`.
2. Treat the generated prompt as the resume context, inspect the listed files,
   then continue the work.

If no matching handoff exists, say that no handoff from that source was found and
offer `byan-handoff latest --prompt` as the fallback only if the user accepts
resuming from the newest handoff across all sources. Do not rely on native
Claude/Codex memory as the source of truth.

## Installed Bundles In This Repo

Prebuilt Codex skill bundles are available under `dist/skill-bundles/`, including:

- `byan-byan.zip` — full BYAN FD/meta-agent skill.
- `byan-strict.zip` — strict scope-lock and audit protocol.
- `byan-codex.zip` — Codex/OpenCode integration specialist.

Use those bundles when the user asks for a specific packaged BYAN skill. Use this
local `byan` skill as the general repo-aware entrypoint.
