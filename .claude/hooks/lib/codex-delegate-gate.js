'use strict';

// Core of the armed Codex-delegation guard (v3 : router-obedient + pressure-gated).
//
// History : v1 blocked every code Write when the lane was armed (blunt). v2
// (option B) closed BYAN's self-dodge (no content marker, no resubmit auto-pass).
// v3 makes the block match the actual delegation policy the user chose :
//   - it OBEYS the router : it only bites when dispatch-router routes the task to
//     Codex (execution / shell / deploy). A refactor / architecture / judgment
//     task routes to Claude, so the block stays silent.
//   - it is PRESSURE-gated : delegation to Codex is worth it to spare the Claude
//     budget, not for quality (the subscription Codex trails Claude). So the block
//     only bites when the Claude usage is under budget PRESSURE (>= threshold).
//     Off-pressure, code runs on Claude with no nag.
//
// Still true from v2 : the only per-turn escape is the HUMAN's (escape file or an
// opt-out phrase in the request) — BYAN cannot self-grant a bypass. Codex genuinely
// unavailable is a legit fallback. A real delegation already done this turn passes
// (Claude applies the diff).
//
// Pure (no I/O) : the hook shell computes the signals (armed, routerSaysCodex,
// targetIsCode, underPressure, delegationSeen, escaped, humanOptOut, codexAvailable)
// and feeds them here.

const CODE_EXT = new Set([
  '.sh', '.bash', '.zsh', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.c', '.h', '.cpp', '.hpp',
  '.cc', '.php', '.pl', '.lua', '.sql', '.swift', '.scala', '.dart',
]);
const CODE_BASENAMES = new Set(['Dockerfile', 'Makefile', 'makefile', 'Rakefile']);

function extOf(filePath) {
  const s = String(filePath || '');
  const slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  const base = slash >= 0 ? s.slice(slash + 1) : s;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

function baseOf(filePath) {
  const s = String(filePath || '');
  const slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return slash >= 0 ? s.slice(slash + 1) : s;
}

// targetIsCode(filePath) — the write is delegable EXECUTABLE code (a doc/config is
// not). A CI workflow path also counts.
function targetIsCode(filePath) {
  if (!filePath) return false;
  const norm = String(filePath).split('\\').join('/');
  if (/(^|\/)\.github\/workflows\//.test(norm) && /\.(ya?ml)$/i.test(norm)) return true;
  if (CODE_BASENAMES.has(baseOf(norm))) return true;
  return CODE_EXT.has(extOf(norm));
}

// The HUMAN opt-out : the only per-turn way to keep a delegable write on Claude is
// the human saying so in the request. Matched on the user's OWN text.
const HUMAN_OPTOUT_RE = /\b(reste sur claude|sans codex|pas de codex|no codex|pas de delegation|don'?t delegate|skip codex)\b/i;

function humanOptOutFromText(text) {
  return HUMAN_OPTOUT_RE.test(String(text == null ? '' : text));
}

// delegationSeenThisTurn(messages) — did a real Codex delegation happen this turn?
// (Bash `codex exec`, a codex:* Task/Agent, or an MCP codex-bridge call.) If so,
// Claude applying the result is legitimate.
function delegationSeenThisTurn(messages) {
  if (!Array.isArray(messages)) return false;
  for (const m of messages) {
    if (!m || m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    for (const block of m.content) {
      if (!block || block.type !== 'tool_use') continue;
      const name = String(block.name || '');
      const input = block.input || {};
      if (name === 'Bash' && /\bcodex\s+exec\b/i.test(String(input.command || ''))) return true;
      if ((name === 'Task' || name === 'Agent') && /codex/i.test(String(input.subagent_type || input.subagentType || ''))) return true;
      if (/codex[_-]?bridge|codex[_-]?rescue/i.test(name)) return true;
    }
  }
  return false;
}

const DENY_REASON = [
  'BYAN souverainete : le routeur (dispatch-router) a route cette tache vers CODEX',
  '(nature execution / shell / script / deploiement), tu es SOUS PRESSION budget',
  'Claude (usage proche de la limite), Codex est disponible, mais tu ecris le code',
  'toi-meme sans avoir delegue ce tour. Delegue a Codex pour epargner le budget',
  'Claude : agent codex:codex-rescue, ou `codex exec` via codex-bridge, puis applique',
  'le diff. Les SEULES raisons valides de rester sur Claude : (1) Codex indisponible,',
  'ou (2) l\'utilisateur a demande de rester sur Claude ("reste sur claude" / "sans',
  'codex", ou le fichier .byan-codex-autodelegate/off). "Script court / latence / je',
  'verifie" n\'est PAS valide. BYAN ne peut pas s\'auto-accorder la sortie.',
].join(' ');

// decideDelegateGate — the pure decision (v3). Order : cheap allows short-circuit
// before the deny. The block bites ONLY when every condition holds : armed, the
// ROUTER routes to Codex, the target is code, we are under budget PRESSURE, Codex
// is available, and no delegation happened this turn. Any miss -> allow. The human
// always keeps the escape switch / opt-out, so it is never a trap for the user.
function decideDelegateGate({
  armed = false,
  routerSaysCodex = false,
  targetIsCode: isCode = false,
  underPressure = false,
  delegationSeen = false,
  escaped = false,
  humanOptOut = false,
  codexAvailable = true,
} = {}) {
  if (!armed) return { decision: 'allow', code: 'lane-not-armed' };
  if (escaped) return { decision: 'allow', code: 'escape-hatch' };        // human switch
  if (humanOptOut) return { decision: 'allow', code: 'human-opt-out' };   // human asked Claude
  if (!routerSaysCodex) return { decision: 'allow', code: 'router-claude' }; // brain routed to Claude (F2)
  if (!isCode) return { decision: 'allow', code: 'not-code' };            // codex-nature task but a doc/config write
  if (!underPressure) return { decision: 'allow', code: 'no-pressure' };  // budget not tight (F1) -> Claude is fine
  if (!codexAvailable) return { decision: 'allow', code: 'codex-unavailable' }; // legit fallback
  if (delegationSeen) return { decision: 'allow', code: 'delegation-seen' };    // Codex already run
  return { decision: 'deny', code: 'delegate-first', reason: DENY_REASON };
}

module.exports = {
  CODE_EXT,
  CODE_BASENAMES,
  targetIsCode,
  HUMAN_OPTOUT_RE,
  humanOptOutFromText,
  delegationSeenThisTurn,
  decideDelegateGate,
  DENY_REASON,
};
