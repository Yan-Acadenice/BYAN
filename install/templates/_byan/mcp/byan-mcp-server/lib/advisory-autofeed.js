// Advisory auto-feed — the pure planning half of the closed learning loop.
//
// BYAN's advisory ledgers (ELO trust, the suitability ledger) only INFORM future
// decisions; they never override behavior. The open gap was that nothing fed them
// automatically: the agent had to remember to call a record tool. This loop closes
// that — outcomes are LOGGED to a buffer during a turn (cheaply, via byan_outcome_log),
// and a Stop hook DRAINS the buffer into the ledgers at end of turn, with no agent
// action. Behavior surfaces (routing / personas / mantras) are out of scope: this
// only writes advisory data.
//
// This module is the PURE half (no I/O), so it is exhaustively unit-testable; the
// Stop hook supplies the buffer text + a cursor and applies the records.
//
// Buffer line shapes (jsonl, one outcome per line):
//   { kind: 'elo',         domain, result }                  result: VALIDATED|PARTIAL|BLOCKED
//   { kind: 'suitability', model, leafId, success }          success: boolean
// A line missing required fields or with a bad type is dropped (classifyOutcome -> null),
// never throwing — a malformed log line must not break the drain.

// Parse a jsonl buffer into outcome objects, skipping malformed lines.
export function parseOutcomes(text) {
  if (!text) return [];
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// Idempotent drain plan keyed on a LINE cursor: everything from `cursor` onward is
// pending; the new cursor is the full length. A re-fired Stop with no new lines
// yields an empty `pending`, so an outcome is recorded at most once.
export function planDrain(outcomes, cursor = 0) {
  const safeCursor = Number.isInteger(cursor) && cursor >= 0 ? cursor : 0;
  const start = Math.min(safeCursor, outcomes.length);
  return { pending: outcomes.slice(start), newCursor: outcomes.length };
}

// The ELO engine's result vocabulary. The MCP/skill vocabulary uses PARTIAL; the
// engine uses PARTIALLY_VALID. classifyOutcome normalizes to the engine form.
const ELO_RESULTS = new Set(['VALIDATED', 'PARTIALLY_VALID', 'BLOCKED']);
function normalizeEloResult(r) {
  if (r === 'PARTIAL') return 'PARTIALLY_VALID';
  return r;
}

// Validate + normalize one buffer outcome into a record intent, or null if invalid.
//   elo         -> { kind: 'elo', domain, result }   (result in ELO_RESULTS)
//   suitability -> { kind: 'suitability', model, leafId, success }  (success boolean)
export function classifyOutcome(o) {
  if (!o || typeof o !== 'object') return null;
  if (o.kind === 'elo') {
    const domain = typeof o.domain === 'string' ? o.domain.trim() : '';
    const result = normalizeEloResult(o.result);
    if (!domain || !ELO_RESULTS.has(result)) return null;
    return { kind: 'elo', domain, result };
  }
  if (o.kind === 'suitability') {
    const model = typeof o.model === 'string' ? o.model.trim() : '';
    const leafId = typeof o.leafId === 'string' ? o.leafId.trim() : '';
    if (!model || !leafId || typeof o.success !== 'boolean') return null;
    return { kind: 'suitability', model, leafId, success: o.success };
  }
  return null;
}

// Validate an outcome BEFORE it is appended to the buffer (used by byan_outcome_log).
// Returns the canonical line object to write, or null if the input is not a valid
// outcome. Keyed on the same rules as classifyOutcome so the buffer only ever holds
// drainable lines.
export function validateForLog(input) {
  const rec = classifyOutcome(input);
  if (!rec) return null;
  return rec.kind === 'elo'
    ? { kind: 'elo', domain: rec.domain, result: rec.result }
    : { kind: 'suitability', model: rec.model, leafId: rec.leafId, success: rec.success };
}

// C3 — the ELO outcome line for a completed strict session. PURE (no I/O): a
// completed session that carried an EXPLICIT domain is a VALIDATED outcome.
// Returns the validated buffer line, or null when there is no domain (so abort
// and no-domain feed nothing). The caller (the byan_strict_complete handler)
// appends the returned line. The domain is the user's explicit lock_scope input,
// never inferred from text. Shared by the handler AND its test so the two cannot
// drift (no hand-copied replica).
export function eloOutcomeForStrictComplete(completeResult) {
  const domain = completeResult && completeResult.domain;
  if (!domain) return null;
  return validateForLog({ kind: 'elo', domain, result: 'VALIDATED' });
}
