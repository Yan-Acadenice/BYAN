/**
 * EloEngine — Main entry point for the BYAN ELO Trust System
 *
 * Orchestrates: Glicko-2 scoring, domain config, persistent store,
 * challenge evaluation, pedagogy layer, and LLM routing.
 *
 * Usage:
 *   const engine = new EloEngine();
 *   const ctx    = engine.evaluateContext('security');        // before LLM challenge
 *   const result = engine.recordResult('security', 'BLOCKED', { blockedReason: 'terminology_gap', claimExcerpt: '...' });
 *   const dash   = engine.getDashboard('security');
 *   const model  = engine.routeLLM();
 */

const { update: glickoUpdate, decayRd } = require('./glicko2');
const { getKFactor, TILT_THRESHOLD, INTERVENTION_RATING, DECLARED_EXPERTISE_RATINGS } = require('./domain-config');
const EloStore          = require('./elo-store');
const ChallengeEvaluator = require('./challenge-evaluator');
const PedagogyLayer      = require('./pedagogy-layer');
const LlmRouter          = require('./llm-router');

class EloEngine {
  constructor(options = {}) {
    this.store     = options.store     ?? new EloStore(options.storagePath);
    this.evaluator = new ChallengeEvaluator();
    this.pedagogy  = new PedagogyLayer();
    this.router    = new LlmRouter();
  }

  /**
   * Get the challenge configuration for the LLM before it evaluates a claim.
   * Call this before presenting a claim to the BYAN agent.
   *
   * @param {string} domain
   * @returns {ChallengeContext}
   */
  evaluateContext(domain) {
    const profile = this.store.getDomain(domain);
    return this.evaluator.evaluateContext(domain, profile);
  }

  /**
   * Record the result of a claim evaluation and update the ELO profile.
   * Call this after the LLM has evaluated the claim.
   *
   * @param {string} domain
   * @param {'VALIDATED'|'BLOCKED'|'PARTIALLY_VALID'} result
   * @param {object} opts - { blockedReason, claimExcerpt }
   * @returns {{ newRating, delta, tiltDetected, interventionMode, message }}
   */
  recordResult(domain, result, opts = {}) {
    const { blockedReason = null, claimExcerpt = '' } = opts;
    const profile  = this.store.getDomain(domain);
    const kFactor  = getKFactor(domain);
    const score    = this.evaluator.resultToScore(result);

    const { newRating, newRd, delta } = glickoUpdate(
      profile.rating,
      profile.rd,
      score,
      kFactor
    );

    this.store.recordResult(domain, result, {
      delta, newRating, newRd, blockedReason, claimExcerpt
    });
    this.store.save();

    // Refresh profile after save
    const updated = this.store.getDomain(domain);
    const tiltDetected  = updated.blocked_streak >= TILT_THRESHOLD;
    const interventionMode = newRating <= INTERVENTION_RATING && updated.session_count > 1;

    let message;
    if (result === 'BLOCKED') {
      const formatted = this.pedagogy.formatBlocked(blockedReason, newRating, domain);
      message = `[${formatted.label}] ${formatted.opening}`;
    } else {
      const formatted = this.pedagogy.formatValidated(newRating, delta, domain, updated.history);
      message = formatted.message;
    }

    if (tiltDetected) {
      message += '\n\n' + this.pedagogy.formatTiltIntervention(domain, updated.blocked_streak);
    }

    if (interventionMode) {
      message += '\n\n' + this.pedagogy.formatZeroIntervention(domain);
    }

    return { newRating, delta, tiltDetected, interventionMode, message };
  }

  /**
   * Declare user expertise for a domain (sets provisional ELO).
   * @param {string} domain
   * @param {string} level - 'beginner'|'intermediate'|'advanced'|'expert'|'principal'
   */
  declareExpertise(domain, level) {
    const rating = DECLARED_EXPERTISE_RATINGS[level] ?? DECLARED_EXPERTISE_RATINGS.intermediate;
    this.store.setProvisional(domain, rating);
    this.store.getDomain(domain).rating = rating;
    this.store.save();
    return { domain, provisionalRating: rating, level };
  }

  /**
   * Get the [ELO] dashboard for a domain: why + how.
   * @param {string} domain
   * @returns {string}
   */
  getDashboard(domain) {
    const profile = this.store.getDomain(domain);
    return this.pedagogy.formatDashboard(domain, profile);
  }

  /**
   * Get match history for a domain.
   * @param {string} domain
   * @returns {Array}
   */
  getMatchHistory(domain) {
    return this.store.getDomain(domain).history;
  }

  /**
   * Get summary across all domains (for the full [ELO] menu).
   * @returns {Array<{ domain, rating, rd, trend, trend_delta, last_active }>}
   */
  getSummary() {
    return this.store.getSummary();
  }

  /**
   * Get the recommended LLM model for this session.
   * @returns {{ model, label, reason, maxRating }}
   */
  routeLLM() {
    return this.router.route(this.store);
  }

  /**
   * Apply RD decay for domains idle more than N days.
   * Call once per session start.
   */
  applyIdleDecay() {
    const today = new Date();
    const data  = this.store.load();

    for (const [domain, profile] of Object.entries(data.domains)) {
      if (!profile.last_active) continue;
      const lastActive = new Date(profile.last_active);
      const daysSince  = Math.floor((today - lastActive) / (1000 * 60 * 60 * 24));
      if (daysSince > 30) {
        profile.rd = decayRd(profile.rd, daysSince);
      }
    }

    this.store.save();
  }
}

module.exports = EloEngine;
