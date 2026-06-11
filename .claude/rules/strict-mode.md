# BYAN Strict Mode — Anti-Downgrade Enforcement

> The user asked for something complete. Strict mode exists to stop the agent
> from quietly delivering less: an MVP instead of the prod app, a stub instead
> of the feature, a template filled without care.

## Principe

Strict mode locks a contract (the scope) at the start of a task, forces the
agent to self-verify its work against that contract at least three times, and
blocks the delivery (the commit) until verification is earned. It works on the
2 platforms BYAN targets: Claude Code, Codex.

| Layer | Mechanism | Platforms |
|-------|-----------|-----------|
| Scope lock + self-verify + complete | MCP tools (`byan_strict_*`) | both (MCP) |
| In-session blocking | Claude Code hooks (Stop / PreToolUse / UserPromptSubmit) | Claude Code |
| Context injection | `AGENTS.md` block | Codex |
| Final net | `.githooks/pre-commit` audit gate | both (commit time) |

Codex has no in-session blocking hook. The pre-commit gate is the
net that catches it: a commit cannot land if a strict session was engaged but
not completed correctly.

## Source de verite

One file drives everything: `_byan/_config/strict-mode.yaml`. It holds the
confidence floor, the self-verify config, the activation keywords, the scope
lock template, the 12 hard mantras, and the per-platform injection blocks.

Edit the YAML, then run the generator:

```bash
node _byan/mcp/byan-mcp-server/bin/byan-sync-rules.js
```

The generator emits (idempotent, between `BYAN-STRICT:BEGIN/END` markers):

- `.claude/skills/byan-strict/SKILL.md` — the Claude Code skill
- `.claude/hooks/lib/strict-config.json` — runtime config for the hooks
- `AGENTS.md` block — Codex
- `src/byan-v2/data/strict-mantras.json` — the MantraValidator ruleset

Do not hand-edit the generated blocks; edit the YAML and regenerate.

## Le protocole (4 etapes)

1. **Lock the scope** — `byan_strict_lock_scope` with a verbatim restatement of
   the request and a non-empty list of testable `acceptanceCriteria`. Optional
   `allowedPaths` restrict where writes may land. Optional `domain` (e.g.
   security, performance, javascript) feeds one VALIDATED tick to the ELO loop on
   a successful completion — pass it when one technical domain dominates the
   task, explicit only, omit otherwise. The locked scope is the contract.
2. **Build the full scope** — do not substitute an MVP or a stub. If a part
   cannot be done, surface it as a gap in self-verify; do not cut it silently.
3. **Self-verify >= 3 times** — `byan_strict_self_verify` with `verdict` `ok`
   or `gap` (a `gap` needs a non-empty `findings` array). Re-read the original
   request each pass. The last pass must be `ok`.
4. **Complete** — `byan_strict_complete` returns an audit token. Below three
   passes, or with a `gap` on the last pass, completion is rejected.

## Activation

- **Manual** — `byan_fd_start` with `strict: true`, or load the `byan-strict`
  skill, or call `byan_strict_lock_scope` directly.
- **Auto-detect** — when the request mentions an activation keyword (`prod`,
  `production`, `client`, `contrat`, `template officiel`, `livrable`,
  `deliverable`, `mise en production`, `release`), the agent is prompted to
  suggest strict mode. It suggests and confirms; it does not lock silently.
- **Cross-platform check** — `byan_strict_suggest` (MCP) scans any text against
  the keyword list, for platforms without an in-session hook.

## Les outils MCP

| Tool | Role |
|------|------|
| `byan_strict_lock_scope` | Lock the contract (scope + criteria + paths) |
| `byan_strict_self_verify` | Record a verification pass (`ok` / `gap`) |
| `byan_strict_complete` | Earn the audit token (needs >= 3 passes, last `ok`) |
| `byan_strict_status` | Read the current session state |
| `byan_strict_abort` | Deliberate, audited exit from strict mode |
| `byan_strict_suggest` | Detect production-grade keywords in a text |

State lives in `.byan-strict/` (gitignored): `state.json` (current) and
`audit.log` (append-only JSONL). The pre-commit gate reads this trail.

## Persistance cote byan_web (autorite)

The byan_web API is the **authority** for strict sessions; the local
`.byan-strict/` state is a mirror. BYAN is an online tool (no network, no
Claude), so the server is reachable whenever strict mode runs, and its record
is final.

- **Push** — every mutation pushes best-effort to the API after the local write:
  `lock_scope` -> `POST /api/strict-sessions` (idempotent on the local session
  id), `self_verify` -> `PATCH` (append a pass), `complete` -> `PATCH`
  (audit token), `abort` -> `PATCH`. The session is scoped to the API key's
  user and attached to a `projectId` (arg or `BYAN_PROJECT_ID`).
- **Read** — `byan_strict_status` and the pre-commit gate consult the API first;
  the local mirror is the fallback only when the API is genuinely unreachable
  (so an offline machine is not hard-blocked, but online the server wins).
- **Best-effort** — a missing `BYAN_API_TOKEN`, a timeout, or a non-2xx
  degrades to `synced: false` rather than throwing. The local protocol keeps
  working regardless; the sync layer (`lib/strict-sync.js`) isolates all
  network I/O so `strict-mode.js` stays pure-local.
- **Config** — `.mcp.json` passes `BYAN_API_TOKEN` via `${BYAN_API_TOKEN}`
  (env expansion); the secret stays out of any tracked file. API side:
  migration `033-strict-sessions.sql` + `routes/strict-sessions.js`.

## Les hooks Claude Code

Registered globally in `.claude/settings.json`; each one is a no-op unless a
strict session is engaged (active + scope locked + not completed):

- **`strict-context-inject.js`** (UserPromptSubmit) — injects the strict banner
  and live pass status; suggests strict mode on activation keywords.
- **`strict-scope-guard.js`** (PreToolUse) — denies `Write`/`Edit` outside the
  locked `allowedPaths` (exempt: `.byan-strict/`, `_byan-output/`, `.git/`).
- **`strict-stop-guard.js`** (Stop) — blocks end-of-turn when the assistant
  claims the work is done but `byan_strict_complete` has not produced an audit
  token. A mid-task yield without a completion claim is allowed.

## Le filet pre-commit

`.githooks/pre-commit` runs `strict-precommit-gate.js` on every commit:

- No strict session on disk -> pass (strict was not engaged).
- Aborted session -> pass (deliberate, audited).
- Engaged but not completed -> **block**.
- Completed with < 3 passes or last verdict not `ok` -> **block**.
- Completed correctly -> pass.

Emergency bypass: `git commit --no-verify`.

## Confiance sur les claims durs

Claims in `security`, `performance`, or `compliance` need LEVEL-1 sourcing
(95%) under strict mode, or they are BLOCKED. This raises the default
fact-check floors. See @.claude/rules/fact-check.md for the proof levels.

## Les 12 mantras durs

`STRICT-1` Scope Lock First · `STRICT-2` No Downgrade · `STRICT-3` No Silent Cut ·
`STRICT-4` Self-Verify Three Times · `STRICT-5` Re-Read The Original ·
`STRICT-6` Evidence Over Assertion · `STRICT-7` Hard Claim Floor ·
`STRICT-8` Gap Is Not Failure · `STRICT-9` Audit Trail ·
`STRICT-10` No Premature Complete · `STRICT-11` Honest Status ·
`STRICT-12` Full Over Fast.

Full text in `_byan/_config/strict-mode.yaml` and the generated SKILL.md.

## FAQ

**Strict mode trapped my turn — I cannot finish.** You claimed completion while
a session was engaged. Either run `byan_strict_self_verify` until the scope is
satisfied then `byan_strict_complete`, or `byan_strict_abort` to exit.

**A write was denied.** The target is outside the locked `allowedPaths`. If it
belongs to the scope, re-lock with the corrected paths; otherwise do not write
it.

**The commit is blocked.** A strict session is engaged but not completed.
Complete or abort it. `--no-verify` bypasses (emergency only).

**Can I force strict mode on every commit?** No. Strict mode is opt-in /
auto-suggested. The gate enforces completion once engaged; it does not force
engagement.
