/**
 * llm-router.js — Routes to the appropriate LLM model based on ELO profile
 *
 * Logic (experimental V1): decision made at session start, not mid-session.
 * Uses the maximum rating across active domains (≥1 session).
 *
 * Expert (ELO 601+)   → haiku   (short answers, no explanation needed)
 * Praticien (201-600) → sonnet  (balanced challenge/efficiency)
 * Apprenti (0-200)    → opus    (best reasoning, user needs more support)
 */

const { LLM_ROUTING } = require('./domain-config');

class LlmRouter {
  /**
   * Determine the recommended model for this session.
   * @param {object} store - EloStore instance
   * @returns {{ model, label, reason, maxRating }}
   */
  route(store) {
    const summary = store.getSummary().filter(d => d.session_count >= 1);
    const maxRating = summary.length > 0
      ? Math.max(...summary.map(d => d.rating))
      : 0;

    const routing = LLM_ROUTING.find(r => maxRating <= r.maxRating) ?? LLM_ROUTING[LLM_ROUTING.length - 1];

    return {
      model:     routing.model,
      label:     routing.label,
      maxRating,
      reason:    `Max ELO across active domains: ${maxRating} → ${routing.label} (${routing.model})`
    };
  }

  /**
   * Route for a specific domain only.
   * @param {number} domainRating
   * @returns {{ model, label }}
   */
  routeForDomain(domainRating) {
    const routing = LLM_ROUTING.find(r => domainRating <= r.maxRating) ?? LLM_ROUTING[LLM_ROUTING.length - 1];
    return { model: routing.model, label: routing.label };
  }
}

module.exports = LlmRouter;
