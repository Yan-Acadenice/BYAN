// Model-suitability ledger — the math core (design D1, advisory only).
//
// It answers ONE question per (model x leaf) pair: from the binary adequacy
// outcomes we have seen, is this CHEAP model safe to keep on this leaf? The
// answer is conservative by construction — it commits to "keep-cheap" only when
// the evidence is both good AND plentiful, and to "demote" only when the
// evidence is clearly bad. Everything in between is "watch": not enough proof to
// move, so the safe default (deep / no downgrade) stands.
//
// This module is PURE and DETERMINISTIC. No Date, no Math.random, no I/O. The
// ledger is a plain object the caller owns; every update returns a NEW ledger.
// Persistence lives behind the MCP tools (F2) so the sandbox/state-coupling rule
// holds: a workflow script never writes ledger state, the MCP tool does. The
// statistics here are the part a downgraded model would get subtly wrong, which
// is exactly why this leaf was kept on the strong model.

// Defaults. The math does not hard-depend on these — they are the policy knobs,
// passed through opts and overridable per call.
//
// Prior Beta(1,1) is uniform/neutral: the conservatism comes from the credible
// INTERVAL (a thin sample yields a wide interval and therefore a low floor),
// not from a stacked prior. keepThreshold > demoteThreshold leaves a deliberate
// "watch" band between them that a straddling interval falls into.
export const DEFAULTS = Object.freeze({
  priorAlpha: 1,
  priorBeta: 1,
  credibleLevel: 0.95, // equal-tailed credible interval width
  keepThreshold: 0.85, // lower credible bound >= this  -> keep-cheap (proven safe)
  demoteThreshold: 0.70, // upper credible bound <= this -> demote (proven unsafe)
});

// --- Statistics: regularized incomplete beta and its inverse ---------------
//
// We need P(p <= x) for a Beta(a,b) posterior (the regularized incomplete beta
// I_x(a,b)) and its inverse (the quantile) to read off a credible interval.
// Implemented from first principles (Lanczos log-gamma + Numerical-Recipes
// continued fraction + bisection) so there is no dependency and the result is
// reproducible to ~1e-10.

const LANCZOS_G = 7;
const LANCZOS_C = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

// Natural log of the Gamma function (Lanczos approximation, reflection for z<0.5).
export function lgamma(z) {
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  }
  z -= 1;
  let x = LANCZOS_C[0];
  for (let i = 1; i < LANCZOS_G + 2; i++) x += LANCZOS_C[i] / (z + i);
  const t = z + LANCZOS_G + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// Continued fraction for the incomplete beta (Lentz's method). The 300-iteration
// cap is a backstop, not a working limit: betai only ever calls this on the
// fast-converging side (x < (a+1)/(a+b+2), enforced by its reflection), where
// Lentz reaches the 1e-12 tolerance in tens of steps for any realistic posterior.
function betacf(x, a, b) {
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return h;
}

// Regularized incomplete beta I_x(a,b) = P(X <= x) for X ~ Beta(a,b).
export function betai(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const logBeta = lgamma(a + b) - lgamma(a) - lgamma(b);
  const front = Math.exp(logBeta + a * Math.log(x) + b * Math.log(1 - x));
  // Use the fraction on the side where it converges fastest, then reflect.
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betacf(x, a, b)) / a;
  }
  return 1 - (front * betacf(1 - x, b, a)) / b;
}

// Inverse CDF: smallest x with I_x(a,b) = p. Bisection — monotone, dependency
// free, deterministic. 100 halvings drive the bracket below 1e-30, far tighter
// than the betai accuracy, so the quantile is exact for our purposes.
export function betaQuantile(p, a, b) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (betai(mid, a, b) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// --- Ledger ----------------------------------------------------------------

// Key for a (model x leaf) pair. '::' is reserved as the separator; model and
// leafId are also stored on the entry so the report never has to parse keys.
export function leafKey(model, leafId) {
  return `${model}::${leafId}`;
}

function emptyEntry(model, leafId) {
  return { model, leafId, successes: 0, failures: 0 };
}

// recordOutcome(ledger, { model, leafId, success }) -> a NEW ledger.
//
// success === true  : the cheap model was adequate on this leaf this time.
// success === false : it was not (the adversarial pass refuted it).
// Stores RAW counts (prior-independent) so the prior stays a read-time policy.
// Throws on malformed input — that is a programmer error, surfaced loudly, not
// silently swallowed. (The MCP tool's no-op-on-failure contract is about
// transport/persistence, not input validation.)
export function recordOutcome(ledger, { model, leafId, success } = {}) {
  if (!model || !leafId) throw new Error('recordOutcome requires model and leafId');
  if (typeof success !== 'boolean') throw new Error('recordOutcome requires success:boolean');
  const key = leafKey(model, leafId);
  const cur = ledger[key] || emptyEntry(model, leafId);
  const next = {
    model,
    leafId,
    successes: cur.successes + (success ? 1 : 0),
    failures: cur.failures + (success ? 0 : 1),
  };
  return { ...ledger, [key]: next };
}

// posterior(entry, opts) -> { alpha, beta }. Applies the prior to raw counts.
export function posterior(entry, opts) {
  const o = { ...DEFAULTS, ...opts };
  return {
    alpha: o.priorAlpha + (entry ? entry.successes : 0),
    beta: o.priorBeta + (entry ? entry.failures : 0),
  };
}

// verdictFromBounds(lower, upper, opts) -> 'keep-cheap' | 'demote' | 'watch'.
// keep-cheap and demote are mutually exclusive (lower <= upper), so the order
// of the two tests does not matter; "watch" is everything the evidence has not
// settled. This is the whole safety policy in three lines.
export function verdictFromBounds(lower, upper, opts) {
  const o = { ...DEFAULTS, ...opts };
  if (lower >= o.keepThreshold) return 'keep-cheap';
  if (upper <= o.demoteThreshold) return 'demote';
  return 'watch';
}

// rating(ledger, { model, leafId }, opts) -> the full advisory record. ALWAYS
// carries the credible lower bound and n; a consumer that shows only `mean`
// would be discarding the very signal that makes a thin sample untrustworthy.
export function rating(ledger, { model, leafId }, opts) {
  const o = { ...DEFAULTS, ...opts };
  const entry = ledger[leafKey(model, leafId)] || emptyEntry(model, leafId);
  const { alpha, beta } = posterior(entry, o);
  const n = entry.successes + entry.failures;
  const tail = (1 - o.credibleLevel) / 2;
  const lower = betaQuantile(tail, alpha, beta);
  const upper = betaQuantile(1 - tail, alpha, beta);
  const mean = alpha / (alpha + beta);
  return {
    model,
    leafId,
    n,
    successes: entry.successes,
    failures: entry.failures,
    mean,
    lower,
    upper,
    credibleLevel: o.credibleLevel,
    verdict: verdictFromBounds(lower, upper, o),
  };
}

// Most-actionable first: demote, then watch, then keep-cheap; ties by leaf then
// model for stable output.
const SEVERITY = { demote: 0, watch: 1, 'keep-cheap': 2 };

// report(ledger, opts) -> ratings for every pair, severity-sorted.
export function report(ledger, opts) {
  return Object.values(ledger || {})
    .map((e) => rating(ledger, { model: e.model, leafId: e.leafId }, opts))
    .sort(
      (a, b) =>
        SEVERITY[a.verdict] - SEVERITY[b.verdict] ||
        a.leafId.localeCompare(b.leafId) ||
        a.model.localeCompare(b.model),
    );
}

// formatRating(rating) -> one advisory line. It REFUSES to print a bare point
// estimate: the credible lower bound and n are always present, because "92%"
// over 3 samples and "92%" over 300 are not the same claim, and only the second
// should ever move a human to drop a downgrade.
export function formatRating(r) {
  const pct = (x) => (x * 100).toFixed(1);
  const lvl = Math.round(r.credibleLevel * 100);
  return `${r.model} x ${r.leafId}: lower${lvl}=${pct(r.lower)}% (mean ${pct(r.mean)}%, n=${r.n}) -> ${r.verdict}`;
}
