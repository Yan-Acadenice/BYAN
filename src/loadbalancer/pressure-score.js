/**
 * PressureScore — Composite Rate Limit Pressure (0-100)
 *
 * Single number per provider answering: "How close am I to hitting the wall?"
 *
 * Components (weights configurable):
 *   - 429 ratio    (40%) — total429s / totalRequests in circuit breaker
 *   - Proximity    (30%) — count429InWindow / blockThreshold
 *   - Velocity     (20%) — current req/min / warningThreshold
 *   - State bonus  (10%) — HEALTHY=0, THROTTLED=50, RECOVERING=70, BLOCKED=100
 *
 * Pure computation — takes tracker + velocity snapshots, returns score.
 */

const STATE_SCORES = {
  HEALTHY: 0,
  THROTTLED: 50,
  RECOVERING: 70,
  BLOCKED: 100,
};

const DEFAULT_WEIGHTS = {
  ratio429: 0.40,
  proximity: 0.30,
  velocity: 0.20,
  statePenalty: 0.10,
};

/**
 * Calculate pressure score for a single provider.
 *
 * @param {object} trackerState — from RateLimitTracker.getState()
 * @param {object} velocitySnap — from VelocityEstimator.getSnapshot()
 * @param {object} [opts] — override weights and thresholds
 * @returns {object} { score, components, recommendation }
 */
function calculatePressure(trackerState, velocitySnap, opts = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...opts.weights };
  const blockThreshold = opts.blockThreshold || trackerState.windowMs ? 3 : 3;

  const ratio429 = trackerState.totalRequests > 0
    ? Math.min(1, trackerState.total429s / trackerState.totalRequests)
    : 0;

  const proximity = Math.min(1, trackerState.count429InWindow / (blockThreshold || 3));

  const velocityRatio = velocitySnap.warningThreshold > 0
    ? Math.min(1, velocitySnap.velocity / velocitySnap.warningThreshold)
    : 0;

  const stateScore = (STATE_SCORES[trackerState.state] || 0) / 100;

  const raw = (
    ratio429 * weights.ratio429 +
    proximity * weights.proximity +
    velocityRatio * weights.velocity +
    stateScore * weights.statePenalty
  );

  const score = Math.round(Math.min(100, raw * 100));

  let recommendation;
  if (score >= 80) recommendation = 'switch_now';
  else if (score >= 50) recommendation = 'caution';
  else recommendation = 'ok';

  return {
    score,
    components: {
      ratio429: Math.round(ratio429 * 100),
      proximity: Math.round(proximity * 100),
      velocity: Math.round(velocityRatio * 100),
      statePenalty: Math.round(stateScore * 100),
    },
    recommendation,
  };
}

/**
 * Human-readable summary for lb_quota tool output.
 */
function formatPressureSummary(provider, pressure, velocitySnap) {
  const etaStr = velocitySnap.etaMinutes === Infinity
    ? 'no limit in sight'
    : `~${velocitySnap.etaMinutes} min before limit`;

  const lines = [
    `${provider}: ${pressure.score}/100 [${pressure.recommendation.toUpperCase()}]`,
    `  velocity: ${velocitySnap.velocity} req/min (${velocitySnap.trend})`,
    `  eta: ${etaStr}`,
    `  breakdown: 429_ratio=${pressure.components.ratio429}% proximity=${pressure.components.proximity}% velocity=${pressure.components.velocity}% state=${pressure.components.statePenalty}%`,
  ];

  return lines.join('\n');
}

module.exports = {
  calculatePressure,
  formatPressureSummary,
  STATE_SCORES,
  DEFAULT_WEIGHTS,
};
