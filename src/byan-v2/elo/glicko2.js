/**
 * glicko2.js — Simplified Glicko-2 inspired rating algorithm
 *
 * Scale: 0–1000 (vs canonical 1500 ± 400)
 * Captures: rating, RD (uncertainty), single-result update
 *
 * Pure functions — no side effects, no I/O.
 */

const { INITIAL_RATING, INITIAL_RD } = require('./domain-config');

// Glicko-2 uses a scaled mu/phi internally
const SCALE = 173.7178;
const TAU   = 0.5;  // system volatility constant (controls how fast rating changes)

function toGlicko(rating, rd) {
  return {
    mu:  (rating - 500) / SCALE,  // centered on 500 instead of 1500
    phi: rd / SCALE
  };
}

function fromGlicko(mu, phi) {
  return {
    rating: Math.max(0, Math.min(1000, Math.round(mu * SCALE + 500))),
    rd:     Math.max(10, Math.round(phi * SCALE))
  };
}

function g(phi) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function E(mu, muJ, phiJ) {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/**
 * Update a player's rating after a single result against a virtual opponent.
 *
 * For BYAN's use: the "opponent" is the domain benchmark (rating 500, RD 100).
 * result: 1 = VALIDATED, 0 = BLOCKED, 0.5 = PARTIALLY_VALID
 *
 * @param {number} rating     - current rating (0-1000)
 * @param {number} rd         - current rating deviation
 * @param {number} result     - 0 | 0.5 | 1
 * @param {number} kFactor    - domain-adjusted K factor
 * @returns {{ newRating, newRd, delta, probability }}
 */
function update(rating = INITIAL_RATING, rd = INITIAL_RD, result, kFactor = 32) {
  if (result < 0 || result > 1) throw new Error('result must be 0, 0.5, or 1');

  const { mu, phi } = toGlicko(rating, rd);

  // Virtual opponent = domain baseline (500 = mu 0, RD 100)
  const muJ  = 0;
  const phiJ = 100 / SCALE;

  const gPhi = g(phiJ);
  const expected = E(mu, muJ, phiJ);

  // Glicko-2 variance
  const v = 1 / (gPhi * gPhi * expected * (1 - expected));

  // Delta
  const delta = v * gPhi * (result - expected);

  // K-factor scales the update magnitude (we deviate from pure Glicko-2 here
  // to keep the system responsive per domain)
  const kScale = kFactor / BASE_K;

  // New phi (RD decreases as more games are played)
  const phiStar = Math.sqrt(phi * phi + TAU * TAU);
  const phiNew  = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);

  // New mu
  const muNew = mu + phiNew * phiNew * gPhi * (result - expected) * kScale;

  const current = fromGlicko(mu, phi);
  const next    = fromGlicko(muNew, phiNew);

  return {
    newRating:   next.rating,
    newRd:       next.rd,
    delta:       next.rating - current.rating,
    probability: Math.round(expected * 100)  // expected win % before the game
  };
}

/**
 * Increase RD when a domain has been idle (uncertainty grows over time).
 * @param {number} rd        - current RD
 * @param {number} daysSince - days since last activity
 * @returns {number} new RD (capped at INITIAL_RD)
 */
function decayRd(rd, daysSince) {
  if (daysSince <= 0) return rd;
  const phiNew = Math.sqrt((rd / SCALE) ** 2 + (TAU ** 2) * daysSince / 365) * SCALE;
  return Math.min(INITIAL_RD, Math.round(phiNew));
}

// Expose BASE_K constant for kFactor comparison
const BASE_K = 32;

module.exports = { update, decayRd };
