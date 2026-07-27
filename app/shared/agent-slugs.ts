// Mapping a user's word onto an agent slug the claude CLI will honour.
//
// PURE: no filesystem, no Electron. Lives in shared/ because BOTH sides need it
// — main validates before spawning, and the renderer validates before it even
// offers the choice. Reading which agents exist is main's job (fs), see
// main/claude-agents.ts.
//
// WHY a guard is needed at all. Measured 2026-07-27 against claude 2.1.220:
// `claude --agent <unknown>` exits 0, answers normally and simply omits the
// agent — its own init event lists the real ones and the requested slug is
// absent. An invalid slug is a SILENT no-op, so nothing downstream can catch it.
//
// And the two namespaces in a BYAN project do NOT overlap: _byan/agent/ holds
// byan, analyst, architect while .claude/agents/ holds bmad-byan,
// bmad-bmm-analyst. Measured on this repo, their intersection is EMPTY, which is
// why a slug has to be resolved rather than assumed.

// Resolve what the user MEANT to the slug the CLI accepts.
//
// Exact match wins. Otherwise the shortest slug that ends with `-<wanted>` is
// taken, which is what maps 'byan' onto 'bmad-byan' without hardcoding either
// name: the app should follow whatever the project actually declares rather than
// carry a guess that rots the day an agent is renamed.
export function resolveClaudeAgent(wanted: string, available: string[]): string | null {
  const want = wanted.trim().toLowerCase();
  if (!want) return null;
  const exact = available.find((a) => a.toLowerCase() === want);
  if (exact) return exact;
  const suffixed = available
    .filter((a) => a.toLowerCase().endsWith(`-${want}`))
    .sort((a, b) => a.length - b.length);
  return suffixed[0] ?? null;
}

// A short list of plausible alternatives for an unknown slug, so the message can
// help instead of only refusing.
export function suggestClaudeAgents(wanted: string, available: string[], limit = 4): string[] {
  const want = wanted.trim().toLowerCase();
  if (!want) return available.slice(0, limit);
  return available.filter((a) => a.toLowerCase().includes(want)).slice(0, limit);
}
