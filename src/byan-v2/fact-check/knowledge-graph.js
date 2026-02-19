/**
 * KnowledgeGraph - Persistent fact store across BYAN sessions
 *
 * Storage: _byan/_memory/fact-graph.json
 * Each entry: { id, claim, domain, status, confidence, created_at, expires_at, source, session_id }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class KnowledgeGraph {
  constructor(storagePath = '_byan/_memory/fact-graph.json') {
    this.storagePath = storagePath;
    this._data = null;
  }

  load() {
    if (this._data) return this._data;
    try {
      const raw = fs.readFileSync(path.resolve(this.storagePath), 'utf8');
      this._data = JSON.parse(raw);
    } catch {
      this._data = { version: 1, facts: [], updated_at: null };
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
   * Add a fact to the graph. Deduplicates by claim text (updates existing).
   * @param {object} fact - { claim, domain, status, confidence, source, session_id, expires_at }
   * @returns {string} fact id
   */
  add(fact) {
    if (!fact || !fact.claim) throw new Error('fact.claim is required');
    const data = this.load();
    const existing = data.facts.find(f => f.claim === fact.claim && f.domain === fact.domain);

    if (existing) {
      Object.assign(existing, fact, { updated_at: new Date().toISOString() });
      this.save();
      return existing.id;
    }

    const id = crypto.createHash('md5').update(fact.claim + (fact.domain || '')).digest('hex').slice(0, 8);
    const entry = {
      id,
      claim: fact.claim,
      domain: fact.domain || 'general',
      status: fact.status || 'CLAIM',
      confidence: fact.confidence || 50,
      source: fact.source || null,
      session_id: fact.session_id || null,
      expires_at: fact.expires_at || null,
      created_at: fact.created_at || new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString()
    };

    data.facts.push(entry);
    this.save();
    return id;
  }

  /**
   * Query facts with optional filters
   * @param {object} filters - { domain, status, expiredOnly, sessionId }
   * @returns {Array}
   */
  query({ domain, status, expiredOnly, sessionId } = {}) {
    const { facts } = this.load();
    return facts.filter(f => {
      if (domain && f.domain !== domain) return false;
      if (status && f.status !== status) return false;
      if (sessionId && f.session_id !== sessionId) return false;
      if (expiredOnly) {
        if (!f.expires_at) return false;
        return new Date(f.expires_at) < new Date();
      }
      return true;
    });
  }

  /**
   * Run expiration check on all facts using FactChecker.checkExpiration
   * @param {object} checker - FactChecker instance
   * @returns {{ expired: Array, expiringSoon: Array, healthy: Array }}
   */
  audit(checker) {
    const { facts } = this.load();
    const result = { expired: [], expiringSoon: [], healthy: [] };

    for (const fact of facts) {
      const check = checker.checkExpiration({
        claim: fact.claim,
        domain: fact.domain,
        created_at: fact.created_at
      });

      if (check.expired) {
        result.expired.push({ ...fact, _check: check });
      } else if (check.warning) {
        result.expiringSoon.push({ ...fact, _check: check });
      } else {
        result.healthy.push(fact);
      }
    }

    return result;
  }

  /**
   * Remove all expired facts from the graph
   * @param {object} checker - FactChecker instance
   * @returns {number} count of pruned facts
   */
  prune(checker) {
    const { expired } = this.audit(checker);
    const data = this.load();
    const expiredIds = new Set(expired.map(f => f.id));
    const before = data.facts.length;
    data.facts = data.facts.filter(f => !expiredIds.has(f.id));
    this.save();
    return before - data.facts.length;
  }

  /**
   * Statistics by domain and status
   * @returns {object}
   */
  stats() {
    const { facts } = this.load();
    const byDomain = {};
    const byStatus = {};

    for (const f of facts) {
      byDomain[f.domain] = (byDomain[f.domain] || 0) + 1;
      byStatus[f.status] = (byStatus[f.status] || 0) + 1;
    }

    return { total: facts.length, byDomain, byStatus };
  }
}

module.exports = KnowledgeGraph;
