# Codex Auto-Delegation

Hand delegable work to Codex on your **ChatGPT subscription** (no API credit)
when Claude nears its 5h limit — automatically, from inside Claude Code.

This is the native, opt-in layer on top of the Codex load-balancer pool
(`docs/loadbalancer-multipool.md`). It does not replace judgment: only delegable
work crosses the line.

## What it does

Every turn, a `UserPromptSubmit` hook estimates how much of the Claude 5h window
you have burned and looks at the task you just asked for. If the task is
delegable (code / mechanical) — or if you are over the pressure threshold — BYAN
injects a one-line note directing you to hand it to Codex via
`codex:codex-rescue --model gpt-5.4`. You still verify Codex's output before commit.

**Both engines must be present.** The lane only arms — and the note only fires —
when TWO conditions hold together: the yanstaller option wrote
`_byan/_config/autodelegate.json` with `enabled:true`, AND Codex is actually
linked on this machine (`~/.codex/auth.json` from `codex login`, or
`CODEX_API_KEY`). Option on but no linked Codex = one engine only = no delegation.
This is the runtime `codexLinked()` gate in `codex-autodelegate.js`, the mirror of
the installer's arm-time `codexAuthState` check.

**Armed = directive, enforced by a tooth (option B).** Because the note only
appears when the lane is armed (both engines present), it reads as a directive:
delegate the delegable part. And it is not just prose — the `codex-delegate-guard`
PreToolUse hook DENIES a delegable **code** Write/Edit that skipped Codex. The
two valid reasons to stay on Claude are (1) Codex unavailable (auto-detected via
`codex --version`), or (2) the USER opted out — the `.byan-codex-autodelegate/off`
switch, or a phrase like "reste sur Claude" / "sans codex" in the request. The
"small script / latency / I verify anyway" excuse is explicitly NOT valid: that
was the self-dodge (a `// BYAN-DELEGATE: reviewed` marker BYAN wrote itself) that
option B removed. BYAN can no longer self-grant a bypass; only the human can.

The deny is a wall against BYAN's silent self-dodge, not a trap for the user: the
human keeps the escape switch and the opt-out phrase, and a doc/config write (not
code) does not trip it. Honest ceiling: Claude Code has no control point before a
response is shown, so the *choice* to delegate stays model-driven; the tooth acts
one step later, at the Write, denying the skip.

Three triggers, in priority order:

1. **Pressure** — estimated Claude 5h usage `>= threshold` (default **80%**) ->
   propose offloading **everything** delegable this session.
2. **Nature** — the request looks like delegable coding work -> propose handing
   **that** task over. Works with no gauge at all.
3. **Perf** (opt-in, off by default) — a configurable forces table says Codex is
   reputed stronger for this kind of task. See "Perf routing" below.

**The red line** (held): only delegable natures are proposed. Judgment,
analysis, soul and verification stay on Claude.

## Enable it

At install (`npx create-byan-agent`), the Codex step asks:

> Add Codex as a backup pool?

Before that optional backup-pool prompt, the yanstaller performs the native Codex
setup whenever Codex is selected (Codex-only or Claude+Codex):

1. it writes the BYAN MCP entry into `~/.codex/config.toml`;
2. it installs BYAN's native Codex skills into `~/.codex/skills`, including the
   `byan` entrypoint skill used by `$byan`;
3. it keeps the project-local `.codex/prompts/` stubs for backward
   compatibility.

If `~/.codex` does not exist yet, the yanstaller creates it because Codex was
explicitly selected.

Those are separate from auto-delegation. Without the native skills, Codex may
have the MCP server wired but still fail to expose `$byan` / BYAN skill
invocations on a fresh machine.

Answer yes to the backup-pool prompt and it links your local Codex (the
`codex login` session — your ChatGPT subscription, **not** an API key) and writes
`_byan/_config/autodelegate.json`, which **arms** the hook. Without that file the
hook is a silent no-op (disarmed by default).

Non-interactive install: set `BYAN_CODEX_AUTODELEGATE=1`.

If Codex is not linked yet, the installer prints the device-flow to run on the
machine (needed on a headless server, where the default localhost browser
redirect fails):

```
codex login --device-auth
```

then re-run the installer.

### The entitled model (why gpt-5.4)

On a ChatGPT subscription the OpenAI backend rejects every `-codex`-suffixed
model (`gpt-5-codex`, `gpt-5.x-codex`) — those ids are API-key only. The plain
`gpt-5.x` family (e.g. `gpt-5.4`) is the entitled one. That is why the invocation
pins `--model gpt-5.4`. See `src/loadbalancer/providers/codex-provider.js`
(`resolveCodexModel`).

## Configure it

`_byan/_config/autodelegate.json`:

| Key | Default | Meaning |
|-----|---------|---------|
| `enabled` | `true` (once written) | Master switch. Delete the file or set `false` to disarm. |
| `threshold` | `80` | Pressure percentage that flips to "offload everything delegable". |
| `budget` | `null` | Your plan's rough token ceiling for the 5h window. Without it, `pct` is null and only the nature trigger fires (see caveat). |
| `invocation` | `codex:codex-rescue --model gpt-5.4` | What the nudge tells BYAN to run. |
| `perfRouting` | `false` | Enable the perf trigger. |
| `perfForces` | `[]` | The forces table (see below). |

Session escape hatch: `touch .byan-codex-autodelegate/off` silences the nudge
without editing the config; remove it to re-enable.

## The honest caveats

- **The 5h gauge is an ESTIMATE, not Anthropic's number.** No provider exposes a
  machine-readable 5h quota; `/usage` fetches the authoritative figure live and
  does not persist it. The estimator sums the real per-message token counts from
  your local transcripts (`~/.claude/projects/*/*.jsonl`) over the rolling 5h
  window, weighting cache reads at 0.1 (they are billed roughly a tenth and
  repeat every turn). It is proportional, not exact — and `pct` is only computed
  when you set a `budget`. Without a budget, delegation runs on the nature
  trigger alone.
- **`~/.claude` is a native accelerator, not a source of truth** (PORTABLE-3).
  If it is absent the estimator degrades to `pct: null` and the feature falls
  back to nature-based delegation. The feature keeps working.
- **Perf routing is a heuristic below the L2 floor.** "Model X is better at task
  Y" is a performance claim; BYAN's fact-check floor for performance is L2 (a
  reproducible benchmark). A community arena such as designarena.ai is weaker
  than that. So the forces table ships empty — it asserts nothing until you
  populate it, and every match is tagged `heuristic`, not presented as measured.

## Perf routing (opt-in)

Set `perfRouting: true` and fill `perfForces` with entries:

```json
{
  "perfRouting": true,
  "perfForces": [
    { "category": "bulk-refactor", "pattern": "rename across|codemod", "favors": "codex" }
  ]
}
```

`pattern` is a case-insensitive regex matched against your request. `favors:
"codex"` pushes a delegation nudge even below the pressure threshold. Populate it
from your own benchmarks, or from an arena taken as a weak signal — BYAN tags it
heuristic either way.

## Files

| Piece | File |
|-------|------|
| Usage estimator | `.claude/hooks/lib/usage-estimator.js` |
| Decision core + nudge | `.claude/hooks/lib/autodelegate-decision.js` |
| Perf routing | `.claude/hooks/lib/perf-routing.js` |
| Hook | `.claude/hooks/codex-autodelegate.js` |
| Installer opt-in | `install/lib/codex-autodelegate-setup.js` |
| Native Codex MCP + skills setup | `install/lib/codex-native-setup.js` |
