// WI-7 core — the armament observation report (ESM, matches this package's type).
//
// Two BYAN teeth are BUILT but DISARMED by config : the auto-benchmark Stop guard
// and the punt / completeness guards. They only observe + ledger today. Arming
// one turns it into a refuse-once, which costs a regeneration on every FALSE
// positive — the risk the user rejected for a hard wall. So arming must be a
// measured decision, not a blind flip.
//
// This pure core reads the observation ledgers and, per guard, reports : how many
// entries the guard WOULD have acted on if armed (the false-positive risk proxy),
// over how large a sample, and a recommendation. It NEVER arms anything — the
// human flips the config after reading this. Honest limit : the ledger has no
// ground truth, so "wouldFire" is a risk proxy to eyeball, not a proven
// false-positive count.

// Per-ledger classifiers : does this entry represent the guard ACTING (a block /
// refuse-once) if it were armed ?
export function classifyBenchmark(e) {
  if (!e || typeof e !== 'object') return 'skip';
  if (typeof e.event === 'string' && /block|regen|unmarked/i.test(e.event)) return 'wouldFire';
  // a real choice presented (choice-language + an artifact) without a marker and
  // not on the never-list is exactly what the armed guard blocks.
  if (e.choiceLang && e.artifact && !e.marker && !e.neverHit) return 'wouldFire';
  return 'satisfied';
}

export function classifyPunt(e) {
  if (!e || typeof e !== 'object') return 'skip';
  if (e.punt === true) return 'wouldFire';
  if (typeof e.event === 'string' && /punt/i.test(e.event)) return 'wouldFire';
  return 'satisfied';
}

export function classifyCompleteness(e) {
  if (!e || typeof e !== 'object') return 'skip';
  if (Array.isArray(e.missing) && e.missing.length > 0) return 'wouldFire';
  if (typeof e.event === 'string' && /block|gap|fire/i.test(e.event)) return 'wouldFire';
  return 'satisfied';
}

export function summarize(entries, classify) {
  const s = { total: 0, wouldFire: 0, satisfied: 0, armedSeen: false };
  for (const e of Array.isArray(entries) ? entries : []) {
    const c = classify(e);
    if (c === 'skip') continue;
    s.total += 1;
    if (e && e.armed === true) s.armedSeen = true;
    if (c === 'wouldFire') s.wouldFire += 1;
    else s.satisfied += 1;
  }
  s.fireRate = s.total ? s.wouldFire / s.total : 0;
  return s;
}

// recommend — the calibrated arming call. Never arm on a small sample ; arm only
// on a clean record ; otherwise send the human to review the contexts first.
export function recommend(summary, { minSample = 20 } = {}) {
  if (!summary || summary.total < minSample) {
    return { arm: false, reason: `echantillon trop petit (${summary ? summary.total : 0} < ${minSample}) — continuer d'observer avant de decider` };
  }
  if (summary.wouldFire === 0) {
    return { arm: true, reason: `0 declenchement sur ${summary.total} observations — armement sur (aucun faux positif observe)` };
  }
  const pct = Math.round(summary.fireRate * 100);
  return { arm: false, reason: `${summary.wouldFire}/${summary.total} declenchements (${pct}%) — relire ces contextes avant d'armer (chaque faux positif coute une regeneration)` };
}

// buildReport — the whole picture. `armedFlags` carries the CURRENT config state
// (read by the bin) so the report shows observed-vs-armed side by side.
export function buildReport({ benchmark = [], punt = [], completeness = [] } = {}, armedFlags = {}) {
  const guards = {
    autobench: { summary: summarize(benchmark, classifyBenchmark), armed: Boolean(armedFlags.autobench) },
    punt: { summary: summarize(punt, classifyPunt), armed: Boolean(armedFlags.punt) },
    completeness: { summary: summarize(completeness, classifyCompleteness), armed: Boolean(armedFlags.completeness) },
  };
  for (const k of Object.keys(guards)) {
    guards[k].recommend = recommend(guards[k].summary);
  }
  return guards;
}
