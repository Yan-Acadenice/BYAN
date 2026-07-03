/**
 * SubscriptionWindow — per-pool burn against the rolling 5h + weekly caps.
 *
 * pressure-score.js answers "am I getting 429'd right now" (an API burst signal
 * from the circuit breaker). This module answers the ORTHOGONAL question the 5h
 * subscription pain is actually about: "how much of my rolling 5-hour and weekly
 * budget have I already burned on this pool" (Claude Pro/Max = chat+code shared;
 * Codex = local+cloud shared). The degradation ladder (F5) reads THIS to switch
 * delegable work to the other pool BEFORE the wall, not after the first 429.
 *
 * Honest by construction: neither Claude nor Codex exposes a machine-readable 5h
 * quota (OpenAI issue #10233). So this is an ESTIMATE from observed token usage.
 * Without a configured budget it reports raw burn + velocity and a NULL proximity
 * (never a fabricated percentage); with a budget it reports proximity + an ETA to
 * exhaustion at recent velocity. The surface (F6) reconciles against /usage.
 *
 * The core (computeWindowState) is pure — `now` is injected, no Date.now — so the
 * rolling windows are deterministic under test.
 */

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_VELOCITY_WINDOW_MS = 15 * 60 * 1000; // recent-rate window for ETA

function sumTokensSince(events, cutoff) {
  let total = 0;
  for (const e of events) {
    if (e && e.timestamp > cutoff && Number.isFinite(e.tokens)) total += e.tokens;
  }
  return total;
}

function clampProximity(tokens, budget) {
  if (!budget || budget <= 0) return null; // no budget => estimate only, never fabricate a %
  return Math.min(1, tokens / budget);
}

// Pure. events: [{ timestamp, tokens }]. Returns the window/week burn, proximity
// (null when the matching budget is absent), and an ETA to window-budget
// exhaustion at the recent velocity.
function computeWindowState(events, opts = {}) {
  const {
    now,
    windowMs = FIVE_HOURS_MS,
    weekMs = WEEK_MS,
    windowTokenBudget = null,
    weeklyTokenBudget = null,
    velocityWindowMs = DEFAULT_VELOCITY_WINDOW_MS,
  } = opts;

  const windowTokens = sumTokensSince(events, now - windowMs);
  const weekTokens = sumTokensSince(events, now - weekMs);

  const windowProximity = clampProximity(windowTokens, windowTokenBudget);
  const weekProximity = clampProximity(weekTokens, weeklyTokenBudget);

  // ETA: recent velocity (tokens/min over velocityWindowMs) projected onto the
  // remaining window budget. Infinite when idle or when no budget is known.
  let etaMinutes = Infinity;
  if (windowTokenBudget && windowTokenBudget > 0) {
    const recentTokens = sumTokensSince(events, now - velocityWindowMs);
    const perMin = recentTokens / (velocityWindowMs / 60000);
    const remaining = Math.max(0, windowTokenBudget - windowTokens);
    if (perMin > 0) etaMinutes = Math.round(remaining / perMin);
  }

  return {
    windowTokens,
    weekTokens,
    windowProximity,
    weekProximity,
    windowBudget: windowTokenBudget,
    weeklyBudget: weeklyTokenBudget,
    etaMinutes,
  };
}

// Recommendation from a proximity in [0,1]. Mirrors pressure-score's bands so the
// two signals speak the same language to the ladder. Null proximity => unknown.
function windowRecommendation(proximity) {
  if (proximity === null || proximity === undefined) return 'unknown';
  if (proximity >= 0.8) return 'switch_now';
  if (proximity >= 0.5) return 'caution';
  return 'ok';
}

class SubscriptionWindow {
  /**
   * @param {string} pool - 'claude' | 'codex' | ...
   * @param {object} opts - { windowTokenBudget, weeklyTokenBudget, windowMs, weekMs, velocityWindowMs }
   */
  constructor(pool, opts = {}) {
    this.pool = pool;
    this.opts = opts;
    this.weekMs = opts.weekMs || WEEK_MS;
    this.events = [];
  }

  record({ tokens, timestamp }) {
    if (!Number.isFinite(tokens) || tokens <= 0) return;
    this.events.push({ tokens, timestamp });
  }

  // Extract usage from a ProviderResponse ({ usage: { totalTokens } }). No-op when
  // the response carries no usage (e.g. a rate-limited response).
  recordFromResponse(response, timestamp) {
    const total = response && response.usage && Number(response.usage.totalTokens);
    if (Number.isFinite(total) && total > 0) this.record({ tokens: total, timestamp });
  }

  _prune(now) {
    const cutoff = now - this.weekMs;
    this.events = this.events.filter((e) => e.timestamp > cutoff);
  }

  getState(now) {
    this._prune(now);
    const state = computeWindowState(this.events, { now, ...this.opts });
    return {
      pool: this.pool,
      ...state,
      recommendation: windowRecommendation(state.windowProximity),
    };
  }

  eventCount() {
    return this.events.length;
  }

  reset() {
    this.events = [];
  }
}

module.exports = {
  SubscriptionWindow,
  computeWindowState,
  windowRecommendation,
  sumTokensSince,
  FIVE_HOURS_MS,
  WEEK_MS,
};
