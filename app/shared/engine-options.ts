// Engine options — the ONE place the CLI truths live.
//
// WHY a shared module rather than constants next to each consumer: the picker
// option lists (renderer) and the argv validation (main) must not drift apart.
// A value the UI can offer but main rejects, or the reverse, is a bug the type
// system cannot catch on its own. Both sides import from here.
//
// SOURCING — every fact below is live-verified, not remembered:
//   - REASONING_EFFORTS: the authoritative enum, echoed by the API itself when
//     given an invalid value (2026-07-27, codex-cli 0.145.0):
//     "[reasoning.effort] [invalid_enum_value] ... Supported values are:
//      'none', 'minimal', 'low', 'medium', 'high', 'xhigh', and 'max'."
//     A first draft of this module listed only 5 of the 7 — hence the probe.
//   - claude aliases: `claude --help` on --model documents "an alias for the
//     latest model (e.g. 'fable', 'opus', or 'sonnet') or a model's full name
//     (e.g. 'claude-fable-5')". "e.g." means NON-EXHAUSTIVE, so the guards
//     below must not treat the list as closed.
//   - codex `-m gpt-5.6-sol` accepted on a real fresh turn (F1 spike).
//
// No CLI exposes a "list models" command, so an exhaustive model enum cannot be
// obtained — only invented. The guards therefore separate two concerns:
//   SAFETY  (absolute)  : the token must be safe to place in argv / a TOML value.
//   FAMILY  (advisory)  : catch an obvious cross-engine mistake (a GPT id typed
//                         into claude). An unknown-but-safe token PASSES, and the
//                         CLI itself answers whether the model exists.

// ---------- Engine id ----------
// Lives here (not in main/engines/types.ts) so shared + renderer + main all read
// the same union; main/engines/types.ts re-exports it for its existing callers.

export type EngineId = 'claude' | 'codex';

export function isEngineId(v: unknown): v is EngineId {
  return v === 'claude' || v === 'codex';
}

// ---------- Reasoning effort ----------
// BOTH engines expose one, and the domains DIFFER. Measured against the binaries
// themselves by feeding each an invalid value and reading the rejection:
//
//   claude 2.1.220   --effort <level>
//     "Valid values: low, medium, high, xhigh, max"  (5)
//     An unknown value is WARNED about and then IGNORED — the run continues on the
//     default. So an unvalidated value is a silently dropped setting, the same
//     failure shape as an unknown --agent slug.
//   codex-cli 0.145  -c model_reasoning_effort=<level>
//     none, minimal, low, medium, high, xhigh, max  (7)
//
// An earlier version of this file claimed claude had no effort flag at all and
// the claude engine was written so one could not be passed. That was wrong: the
// flag was there and the measurement missed it.
//
// The two also differ in WHEN they apply, which the interface has to say:
//   claude — per SESSION ("Effort level for the current session"): a change lands
//            on the next session start.
//   codex  — per TURN: a change lands on the next message.

export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

// claude rejects 'none' and 'minimal'. Offering them there would produce a
// setting the user chose and the CLI silently ignored.
const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export function isValidEffort(v: unknown): v is ReasoningEffort {
  return typeof v === 'string' && (REASONING_EFFORTS as readonly string[]).includes(v);
}

// The values THIS engine actually accepts.
export function effortsFor(engine: EngineId): readonly ReasoningEffort[] {
  return engine === 'claude' ? CLAUDE_EFFORTS : REASONING_EFFORTS;
}

export function isValidEffortFor(engine: EngineId, v: unknown): v is ReasoningEffort {
  return typeof v === 'string' && (effortsFor(engine) as readonly string[]).includes(v);
}

// Both engines support one now. Kept as a function because the answer is per
// engine by nature and the call sites read better than a literal true.
export function engineSupportsEffort(_engine: EngineId): boolean {
  return true;
}

// When a change to the effort takes hold. The interface must say which, because
// "from the next message" and "at the next session" are not the same promise.
export function effortAppliesAt(engine: EngineId): 'next-turn' | 'next-session' {
  return engine === 'claude' ? 'next-session' : 'next-turn';
}

// ---------- Model presets (display sugar) ----------
// A curated shortlist for the picker. NOT an allowlist: free text always
// escapes it, because model ids ship faster than this file does.

export interface ModelPreset {
  value: string;
  label: string;
}

export const MODEL_PRESETS: Record<EngineId, ModelPreset[]> = {
  // Aliases documented by `claude --help` (non-exhaustive by its own wording).
  claude: [
    { value: 'opus', label: 'Opus (alias)' },
    { value: 'sonnet', label: 'Sonnet (alias)' },
    { value: 'fable', label: 'Fable (alias)' },
    { value: 'haiku', label: 'Haiku (alias)' },
  ],
  // Seeded with the id live-verified on a real codex turn (F1). Extend as
  // needed; the free-text field covers anything absent here.
  codex: [
    { value: 'gpt-5.6-sol', label: 'gpt-5.6-sol' },
  ],
};

// ---------- Guards ----------

// Longest model id we accept. Generous, but bounded so a pathological string
// cannot be pushed into argv.
const MODEL_MAX_LEN = 64;

// argv/TOML-safe charset. Excludes whitespace, '=', quotes, and every shell
// metacharacter — a crafted value must not be able to break out of the
// `-c key=value` form or the argument vector.
const SAFE_MODEL_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

// SAFETY guard — absolute. Anything false here never reaches a spawn.
export function isSafeModelToken(v: unknown): v is string {
  return typeof v === 'string'
    && v.length > 0
    && v.length <= MODEL_MAX_LEN
    && SAFE_MODEL_TOKEN.test(v);
}

// Known claude aliases (from --help; treated as hints, not as a closed set).
const CLAUDE_ALIASES = ['opus', 'sonnet', 'fable', 'haiku'];

// Prefixes that unambiguously belong to ANOTHER vendor. Used only to catch an
// obvious cross-engine mistake early, with a clear message, instead of paying a
// failed API round-trip to learn it.
const FOREIGN_PREFIXES = ['gpt-', 'gpt5', 'o1-', 'o3-', 'o4-', 'gemini-', 'llama-', 'mistral-', 'grok-', 'deepseek-'];

function startsWithAny(v: string, prefixes: string[]): boolean {
  const low = v.toLowerCase();
  return prefixes.some((p) => low.startsWith(p));
}

// A claude model: an alias, a `claude-*` full name, or an unknown-but-safe
// token (a future alias must not be rejected by a stale list). A foreign
// vendor's id is refused.
export function isValidClaudeModel(v: unknown): v is string {
  if (!isSafeModelToken(v)) return false;
  if (startsWithAny(v, FOREIGN_PREFIXES)) return false;
  return true;
}

// A codex model: any safe token that is not obviously a claude model. codex ids
// have no common prefix to anchor on (gpt-5.6-sol, o3, ...), so this stays a
// loose plausibility check by design — NOT a closed enum.
export function isPlausibleCodexModel(v: unknown): v is string {
  if (!isSafeModelToken(v)) return false;
  const low = v.toLowerCase();
  if (low.startsWith('claude-')) return false;
  if (CLAUDE_ALIASES.includes(low)) return false;
  return true;
}

// The one entry point callers should use: is this model usable with this engine?
export function isValidModelFor(engine: EngineId, v: unknown): v is string {
  return engine === 'claude' ? isValidClaudeModel(v) : isPlausibleCodexModel(v);
}
