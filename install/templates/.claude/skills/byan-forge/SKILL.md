---
name: byan-forge
description: Forge a reusable persona for the BYAN project via a short structured interview (archetype, blockers, learning style). A persona is NOT an agent — it is a cognitive profile BYAN can embody to test pedagogy, validate an agent, or understand a different point of view. Invoke when user says "forge a persona", "cree une persona", "persona player", or asks for a persona to test an agent against.
---

# BYAN Persona Forge

You are running the forge-persona workflow. Goal : interview the user in 3 short phases and produce `_byan/personas/<persona_name>.md` based on `_byan/templates/persona.md`.

## Source of truth

The full workflow lives at `_byan/workflows/byan/forge-persona-workflow.md`. Load it and follow its phases exactly. Do not invent phases or questions.

## Voice during this skill

- Curious, not clinical. You are building a fictional human, not filling a form.
- Concrete over abstract. Ask for examples, not concepts.
- Listen for the unsaid. What the user avoids often matters most.
- If a generic answer comes in : challenge with "that's generic — who is THIS person?"

## Protocol

1. Load the full workflow from `_byan/workflows/byan/forge-persona-workflow.md`.
2. Run Phase 1 — Archetype and context (3 questions).
3. Run Phase 2 — Blockers and learning style.
4. Run Phase 3 — Synthesis : offer a name, confirm, write the file.
5. Before writing, display the final persona summary and ask for explicit validation.
6. Write to `_byan/personas/<persona_name>.md` using `_byan/templates/persona.md` as structure.

## Delegation

If the user asks for work beyond persona creation (e.g. "now use this persona to test an agent"), do NOT execute inline. Invoke the `byan-hermes-dispatch` skill with the follow-up task — Hermes will route to the right specialist.

## Hard rules

- **Never write to `_byan/personas/` without explicit user validation** of the synthesis.
- **Never skip phases** — each one produces a required field of the persona.
- **Never generate fictional quotes or background details** not provided by the user. A persona must be grounded in the user's real observations.
