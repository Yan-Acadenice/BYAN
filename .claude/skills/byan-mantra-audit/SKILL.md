---
name: byan-mantra-audit
description: Semantic embodiment audit of a BYAN persona against its applicable mantras. Out-of-band, LLM-judged, kept out of the commit gate.
---

# BYAN Mantra Embodiment Audit (N2)

This skill runs the deep, semantic half of mantra validation, the layer above the
deterministic anti-stub floor enforced at commit time. The pre-commit gate asks
"does this persona contain its domain vocabulary"; this skill asks "does this
persona genuinely EMBODY each applicable mantra", judged by you (the LLM), not by
keyword presence. It runs on demand, outside the commit path.

## When to run

- Auditing a persona's quality beyond the deterministic anti-stub floor.
- After authoring or editing an agent, to check real embodiment of its mantras.
- As a CI / review step, out-of-band. Not as a commit gate (the judgment is
  semantic and non-deterministic, so it must stay out of the commit path).

## Precondition (runtime check, do this FIRST)

This audit needs the BYAN v2 runtime (`src/byan-v2/generation/mantra-audit.js`). It
runs from the BYAN repository; a generated/npm-installed BYAN project does not ship
that runtime yet. Check before running anything:

```
test -f src/byan-v2/generation/mantra-audit.js && echo OK || echo "N2 runtime absent"
```

If it prints `N2 runtime absent`, STOP and tell the user plainly: the embodiment
audit runs from the BYAN repository and is not yet delivered to generated projects.
Do NOT run the node commands below, they would fail with MODULE_NOT_FOUND.

## Protocol (hybrid: deterministic CLI, semantic judgment)

1. PREPARE (deterministic). Build the judgment packet for the target persona:
   ```
   node src/byan-v2/generation/mantra-audit.js prepare <path/to/agent.md>
   ```
   It resolves the persona's scope (scope-resolver), lists only the applicable
   mantras, and emits a rubric plus the persona text. Add `--json` for the raw packet.

2. JUDGE (you, this turn). For each mantra in the packet decide `embodied`,
   `partial`, or `absent`. Judge embodiment, not vocabulary: a mantra is embodied
   when the persona's role, instructions, and red-lines enact the principle, even
   if the exact keyword is absent. Write the verdicts to a JSON file:
   `{ "<mantraId>": "embodied" | "partial" | "absent", ... }`.

3. SCORE (deterministic):
   ```
   node src/byan-v2/generation/mantra-audit.js score <path/to/agent.md> <verdicts.json>
   ```
   It returns the embodiment score and the embodied / partial / absent / unjudged
   breakdown.

4. REPORT. Present the embodiment score, the absent mantras, and concrete
   suggestions to raise embodiment, what the persona should ENACT, not which
   keyword to insert.

## Boundaries

- Advisory quality insight, not a gate. It does not block commits.
- The deterministic floor (pre-commit gate, Stop hook) and this semantic audit are
  complementary: the floor catches stubs cheaply; this measures real quality deeply.
- Keep judgments honest: default to `partial` or `absent` when the persona only
  alludes to a mantra without enacting it.
