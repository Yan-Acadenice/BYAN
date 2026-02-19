/**
 * elo-store.js — Persistent ELO profile per user/project
 *
 * Storage: _byan/_memory/elo-profile.json
 * Structure: { version, updated_at, domains: { [name]: DomainProfile } }
 *
 * DomainProfile: {
 *   rating, rd, history[], blocked_streak,
 *   consecutive_correct, first_claim_made, session_count
 * }
 */

const fs   = require('fs');
const path = require('path');
const { INITIAL_RATING, INITIAL_RD } = require('./domain-config');

const DEFAULT_PATH = '_byan/_memory/elo-profile.json';

class EloStore {
  constructor(storagePath = DEFAULT_PATH) {
    this.storagePath = storagePath;
    this._data = null;
  }

  load() {
    if (this._data) return this._data;
    try {
      const raw = fs.readFileSync(path.resolve(this.storagePath), 'utf8');
      this._data = JSON.parse(raw);
    } catch {
      this._data = { version: 1, updated_at: null, domains: {} };
    }
    return this._data;
  }

  save() {
    const data = this.load();
    data.updated_at = new Date().toISOString();
    const dir = path.dirname(path.resolve(this.storagePath));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.resolve(this.storagePath), JSON.stringify(data, null, 2), 'utf8');
  }

  /**
   * Get a domain profile, creating it with defaults if absent.
   * @param {string} domain
   * @returns {object} DomainProfile
   */
  getDomain(domain) {
    const data = this.load();
    if (!data.domains[domain]) {
      data.domains[domain] = {
        rating:             INITIAL_RATING,
        rd:                 INITIAL_RD,
        history:            [],
        blocked_streak:     0,
        consecutive_correct:0,
        first_claim_made:   false,
        session_count:      0,
        last_active:        null,
        provisional_rating: null  // set when user declares expertise
      };
    }
    return data.domains[domain];
  }

  /**
   * Record the result of a claim evaluation and update the domain profile.
   * @param {string} domain
   * @param {'VALIDATED'|'BLOCKED'|'PARTIALLY_VALID'} result
   * @param {object} opts - { delta, newRating, newRd, blockedReason, claimExcerpt }
   */
  recordResult(domain, result, opts = {}) {
    const data   = this.load();
    const profile = this.getDomain(domain);

    const { delta = 0, newRating, newRd, blockedReason = null, claimExcerpt = '' } = opts;

    // Update rating
    if (newRating !== undefined) profile.rating = newRating;
    if (newRd     !== undefined) profile.rd      = newRd;

    // Streak tracking
    if (result === 'BLOCKED') {
      profile.blocked_streak      = (profile.blocked_streak || 0) + 1;
      profile.consecutive_correct = 0;
    } else {
      profile.blocked_streak      = 0;
      profile.consecutive_correct = (profile.consecutive_correct || 0) + 1;
    }

    // First claim flag
    if (!profile.first_claim_made) profile.first_claim_made = true;

    profile.last_active = new Date().toISOString().slice(0, 10);

    // History entry (keep last 50)
    profile.history.push({
      date:          profile.last_active,
      result,
      delta,
      blocked_reason: blockedReason,
      excerpt:        claimExcerpt.slice(0, 80)
    });
    if (profile.history.length > 50) profile.history.shift();

    data.domains[domain] = profile;
    this._data = data;
  }

  /**
   * Set a provisional rating from user self-declaration.
   * @param {string} domain
   * @param {number} provisionalRating
   */
  setProvisional(domain, provisionalRating) {
    const profile = this.getDomain(domain);
    profile.provisional_rating = provisionalRating;
    profile.rd = INITIAL_RD;  // keep uncertainty high until confirmed
    this._data.domains[domain] = profile;
  }

  /**
   * Increment session count for all active domains.
   */
  incrementSession() {
    const data = this.load();
    for (const domain of Object.keys(data.domains)) {
      data.domains[domain].session_count = (data.domains[domain].session_count || 0) + 1;
    }
  }

  /**
   * Return all domains with their current ratings, sorted by last activity.
   * @returns {Array<{ domain, rating, rd, trend, last_active }>}
   */
  getSummary() {
    const data = this.load();
    return Object.entries(data.domains).map(([domain, p]) => {
      const recent = p.history.slice(-5);
      const totalDelta = recent.reduce((s, h) => s + (h.delta || 0), 0);
      return {
        domain,
        rating:       p.rating,
        rd:           p.rd,
        trend:        totalDelta > 5 ? 'up' : totalDelta < -5 ? 'down' : 'stable',
        trend_delta:  totalDelta,
        last_active:  p.last_active,
        session_count: p.session_count
      };
    }).sort((a, b) => {
      if (!a.last_active) return 1;
      if (!b.last_active) return -1;
      return b.last_active.localeCompare(a.last_active);
    });
  }
}

module.exports = EloStore;
