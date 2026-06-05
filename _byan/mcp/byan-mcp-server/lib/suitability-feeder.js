// Feeder B — adversarial-pass verdict -> ledger outcome (F3).
//
// The adversarial VALIDATE pass runs N skeptics against ONE downgraded leaf,
// each trying to REFUTE that the cheap model is adequate there. The leaf is
// "flagged" (cheap inadequate) when at least half the skeptics refute it. This
// module maps that vote into the ledger's binary outcome:
//
//   success = the cheap model SURVIVED the panel (refuters fell short of half).
//
// It is PURE and DETERMINISTIC and does no I/O. The actual byan_suitability_record
// call happens in the orchestrating skill on a main-thread turn — a workflow
// script cannot call MCP tools or write state (sandbox/state-coupling rule), so
// the script returns the verdicts as DATA and the skill records them. This
// module is the shared shaping step both sides agree on.

// At least half the panel refuting flags the leaf. Ties resolve AGAINST the
// cheap model — the conservative bias for an anti-downgrade rail. The adversarial
// pass uses an odd panel (3) so ties do not arise in practice; the rule is
// defined for any n so an even panel still degrades safely.
function isFlagged(refutedVotes, totalVotes) {
  return refutedVotes * 2 >= totalVotes;
}

// verdictToOutcome({ model, leafId, refutedVotes, totalVotes }) ->
//   { model, leafId, success }. Throws on malformed input (programmer error);
// the no-op-on-failure contract lives one layer up, at the MCP store boundary.
export function verdictToOutcome({ model, leafId, refutedVotes, totalVotes } = {}) {
  if (!model || !leafId) throw new Error('verdictToOutcome requires model and leafId');
  const total = Number(totalVotes);
  const refuted = Number(refutedVotes);
  if (!Number.isInteger(total) || total <= 0) {
    throw new Error('totalVotes must be a positive integer');
  }
  if (!Number.isInteger(refuted) || refuted < 0 || refuted > total) {
    throw new Error('refutedVotes must be an integer in 0..totalVotes');
  }
  return { model, leafId, success: !isFlagged(refuted, total) };
}

// verdictsToOutcomes([verdict, ...]) -> [outcome, ...]. The skill iterates this
// and calls byan_suitability_record once per outcome.
export function verdictsToOutcomes(verdicts = []) {
  if (!Array.isArray(verdicts)) throw new Error('verdictsToOutcomes expects an array');
  return verdicts.map(verdictToOutcome);
}
