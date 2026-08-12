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
//
// LOT L2 (2026-08-07): effortsFor(engine, model) and MODEL_PRESETS.codex both
// delegate to dispatch/model-effort.ts for the codex model x effort matrix —
// see that module's header for the four contradicting sources and how each
// was resolved. This is a one-way import (this file -> model-effort.ts):
// model-effort.ts never imports a VALUE from here, only types, so there is no
// runtime cycle.

import { effortsForModel, listedCodexModels } from './dispatch/model-effort';

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
//     The help text says "Valid values: low, medium, high, xhigh, max" and it is
//     INCOMPLETE: 'ultracode' is accepted too, silently. Established by probing —
//     'pouet' and 'ultraplan' both draw "Unknown --effort value", 'ultracode' and
//     'max' draw nothing. The two rejected controls are what make that a
//     measurement rather than a hopeful reading.
//     So SIX values on claude, and the CLI's own error message is not the whole
//     authority. Reading it and stopping there is how the first version of this
//     file ended up short.
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

// The UNION of both engines — the type's domain, not any single engine's menu.
// Never offer this list to a user: pick effortsFor(engine).
export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultracode'] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

// claude rejects 'none' and 'minimal'; codex rejects 'ultracode' with an
// invalid_enum_value from the API. Neither list is a subset of the other, which
// is exactly why they are two lists and not one with a flag.
// Two EXPLICIT lists, because neither is a subset of the other. Deriving codex's
// from "everything" handed it 'ultracode', which its API rejects — a defect my own
// test caught, and the reason this is spelled out per engine instead of computed.
const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultracode'] as const;
// MESURE CONTRE L'API, valeur par valeur, le 2026-08-05 (codex-cli 0.146.0,
// modele gpt-5.6-sol) : none, low, medium, high, xhigh, max sont acceptees ;
// `minimal` est REFUSEE (« Unsupported value: 'minimal' is not supported with
// the ... model »), `ultracode` aussi.
//
// POURQUOI ELLE Y ETAIT. La mesure precedente portait sur ce que la LIGNE DE
// COMMANDE accepte, pas sur ce que le MODELE supporte. Verifie le meme jour :
// `codex exec -c model_reasoning_effort=pouet` demarre sans broncher — le CLI ne
// valide rien du tout, il transmet et c'est l'API qui tranche. Une valeur lue
// dans l'aide du CLI n'est donc PAS une valeur utilisable.
//
// La liste ci-dessous vient de l'API. C'est la seule autorite.
const CODEX_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

export function isValidEffort(v: unknown): v is ReasoningEffort {
  return typeof v === 'string' && (REASONING_EFFORTS as readonly string[]).includes(v);
}

// LOT L2 (2026-08-07) — la validite par MOTEUR ci-dessus n'est plus le fond
// de l'histoire cote codex : la mesure du jour (`codex debug models`,
// codex-cli 0.146.0, cf. shared/dispatch/model-effort.ts) montre que la
// validite d'un effort depend du MODELE, pas seulement du moteur (gpt-5.4
// refuse 'max', gpt-5.6-sol l'accepte). Un dispatch qui choisit modele et
// effort separement peut donc emettre une paire qui passe cette fonction sans
// modele et se fait quand meme refuser par l'API, apres le lancement.
//
// effortsFor(engine, model) delegue au module dedie QUAND un modele est
// fourni. SANS modele, le comportement reste l'ancien exactement (le ternaire
// ci-dessus) : de nombreux appelants existants appellent effortsFor(engine)
// seul (main/ipc-handlers/local-chat.ts notamment) et ne doivent rien voir
// changer.
export function effortsFor(engine: EngineId, model?: string | null): readonly ReasoningEffort[] {
  if (model) {
    return effortsForModel(engine, model).efforts;
  }
  return engine === 'claude' ? CLAUDE_EFFORTS : CODEX_EFFORTS;
}

// `model` optionnel, retro-compatible : sans lui, la validation reste au
// niveau du moteur, comme avant ce lot.
export function isValidEffortFor(engine: EngineId, v: unknown, model?: string | null): v is ReasoningEffort {
  return typeof v === 'string' && (effortsFor(engine, model) as readonly string[]).includes(v);
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
  // Le catalogue reel a NEUF modeles (`codex debug models`, mesure le
  // 2026-08-07, codex-cli 0.146.0 — voir dispatch/model-effort.ts). Une
  // premiere version de cette liste n'en portait qu'un (gpt-5.6-sol) —
  // l'ecart entre "ce que le picker propose" et "ce que le catalogue offre"
  // est exactement le genre de drift que ce module existe pour prevenir.
  // listedCodexModels() exclut les deux marques visibility='hide' du
  // catalogue (gpt-5.6-sol-wm, codex-auto-review) : un modele que le
  // catalogue lui-meme cache ne doit pas apparaitre dans le picker. Le champ
  // texte libre couvre toujours tout ce qui est absent d'ici.
  codex: listedCodexModels().map((value) => ({ value, label: value })),
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

// ---------------------------------------------------------------------------
// Comment chaque moteur honore le choix d'un agent
// ---------------------------------------------------------------------------
//
// MESURE (codex-cli 0.146.0) : `codex exec --help` n'expose AUCUN `--agent`.
// Son `--profile` superpose un fichier de configuration, ce n'est pas une
// definition d'agent. L'application en concluait « codex ne permet pas de
// choisir un agent » et refusait la commande.
//
// Le constat est juste, la conclusion non. Un agent BYAN est un fichier
// d'instructions ; codex lit ses instructions sur l'entree standard, et c'est
// deja par la que l'application envoie le message. On met donc la definition en
// tete du tour (voir shared/agent-definition.ts).
//
// Un booleen ne peut pas porter cette nuance : les deux voies ne donnent pas la
// meme chose. Le type dit COMMENT, et la note dit ce qui differe.

export type AgentSupport = 'native' | 'injected' | 'none';

export function agentSupport(engine: EngineId): AgentSupport {
  // claude : le CLI charge la definition, avec ses outils et son modele.
  // codex : les instructions partent en tete du message, la persona seulement.
  return engine === 'claude' ? 'native' : 'injected';
}

// Ce qu'il faut dire a l'utilisateur, et rien de plus. Le mode natif n'a rien a
// expliquer ; le mode injecte doit annoncer ce qu'il ne fait PAS, sinon on laisse
// croire a une equivalence.
export const AGENT_SUPPORT_NOTE: Readonly<Record<AgentSupport, string | null>> = {
  native: null,
  injected:
    "codex n'a pas de selection d'agent : ses instructions sont injectees en tete du tour. "
    + 'Tu obtiens la persona, pas le modele ni les outils declares dans sa definition.',
  none: "ce moteur n'accepte pas de choix d'agent.",
};
