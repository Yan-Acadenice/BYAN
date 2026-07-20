# Codex Auto-Delegation

Hand delegable work to Codex on your **ChatGPT subscription** (no API credit)
when Claude nears its 5h limit — automatically, from inside Claude Code.

This is the native, opt-in layer on top of the Codex load-balancer pool
(`docs/loadbalancer-multipool.md`). It does not replace judgment: only delegable
work crosses the line.

## What it does

Every turn, a `UserPromptSubmit` hook estimates how much of the Claude 5h window
you have burned. When you are over the pressure threshold (default **75%**), BYAN
injects a one-line note directing you to hand the delegable work to Codex via
`codex:codex-rescue --model gpt-5.4`. You still verify Codex's output before commit.

**v3 — pressure-only, and the router decides Codex vs Claude.** Two deliberate
changes from v2:

- **Pressure is the only auto-trigger (F1).** A delegable-looking task no longer
  proposes Codex on its own. Delegating to the subscription Codex (which trails
  Claude on quality — see below) is worth it to SPARE the Claude budget, not per
  coding task. So off-pressure, code runs on Claude with no nag.
- **The guard obeys the router (F2).** WHERE a task runs (Codex vs Claude) is the
  `dispatch-router`'s call, by task nature: execution / shell / deploy / devops /
  browser -> Codex ; architecture / refactor / quality / planning + all
  verification -> Claude. The delegation guard only bites for a task the router
  itself routes to Codex.

**Both engines must be present.** The lane only arms — and the note only fires —
when TWO conditions hold together: the yanstaller option wrote
`_byan/_config/autodelegate.json` with `enabled:true`, AND Codex is actually
linked on this machine (`~/.codex/auth.json` from `codex login`, or
`CODEX_API_KEY`). Option on but no linked Codex = one engine only = no delegation.
This is the runtime `codexLinked()` gate in `codex-autodelegate.js`, the mirror of
the installer's arm-time `codexAuthState` check.

**Armed = directive, enforced by a guard (option B + v3).** Because the note only
appears when the lane is armed (both engines present), it reads as a directive:
delegate the delegable part. And it is not just prose — the `codex-delegate-guard`
PreToolUse hook DENIES a **code** Write/Edit that skipped Codex, but ONLY when all
of these hold together (v3): the lane is armed, the ROUTER routes this task to
Codex, you are under budget PRESSURE, and Codex is available. Miss any one and it
allows. The two per-turn ways to stay on Claude are (1) Codex unavailable
(auto-detected via `codex --version`), or (2) the USER opted out — the
`.byan-codex-autodelegate/off` switch, or a phrase like "reste sur Claude" /
"sans codex" in the request. The "small script / latency / I verify anyway"
excuse is explicitly NOT valid: that was the self-dodge (a
`// BYAN-DELEGATE: reviewed` marker BYAN wrote itself) that option B removed. BYAN
can no longer self-grant a bypass; only the human can.

The deny is a wall against BYAN's silent self-dodge, not a trap for the user: the
human keeps the escape switch and the opt-out phrase, a doc/config write (not
code) does not trip it, and off-pressure OR router-to-Claude nothing bites at all.
Honest ceiling: Claude Code has no control point before a response is shown, so
the *choice* to delegate stays model-driven; the guard acts one step later, at the
Write, denying the skip.

The auto-trigger, plus one opt-in:

1. **Pressure (F1, the only auto-trigger)** — estimated Claude 5h usage
   `>= threshold` (default **75%**) -> propose offloading **everything** delegable
   this session. Needs a `budget` gauge; without one, pressure stays uncomputed
   and nothing is proposed (documented, non-blocking).
2. **Perf** (opt-in, off by default) — a configurable forces table says Codex is
   reputed stronger for this kind of task. See "Perf routing" below.

**The red line** (held): only delegable natures are proposed. Judgment,
analysis, soul and verification stay on Claude — and the router keeps them there.

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
| `threshold` | `75` | Pressure percentage that flips to "offload everything delegable" (v3: aligned with the guard's pressure floor). |
| `budget` | `null` | Your plan's rough token ceiling for the 5h window. Without it, `pct` is null, pressure stays uncomputed, and nothing is auto-proposed (v3 pressure-only; see caveat). |
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
  when you set a `budget`. Without a budget, pressure stays uncomputed and the
  auto-trigger stays silent (v3 pressure-only).
- **`~/.claude` is a native accelerator, not a source of truth** (PORTABLE-3).
  If it is absent the estimator degrades to `pct: null`, so pressure cannot be
  computed and the auto-trigger stays silent. Code still runs on Claude normally;
  the feature keeps working, it just does not auto-propose Codex.
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
