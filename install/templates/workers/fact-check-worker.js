/**
 * Fact-Check Worker
 *
 * Wraps the BYAN FactChecker for easy integration as a reusable worker.
 * Provides claim verification, auto-detection of implicit claims, and
 * fact sheet generation — all following the "demonstrable, quantifiable,
 * reproducible" principle.
 *
 * Install path: _byan/workers/fact-check-worker.js
 * Source:       src/byan-v2/fact-check/index.js
 *
 * @module workers/fact-check-worker
 */

const path = require('path');

class FactCheckWorker {
  constructor(config = {}) {
    const FactChecker = require(path.join(__dirname, '../../../src/byan-v2/fact-check/index'));
    this.checker = new FactChecker({
      enabled:       config.enabled !== false,
      mode:          config.mode || 'offline',
      min_level:     config.min_level ?? 3,
      strict_domains: config.strict_domains || ['security', 'performance', 'compliance'],
      output_fact_sheet: config.output_fact_sheet !== false,
      fact_sheet_path:   config.fact_sheet_path || '_byan-output/fact-sheets',
      graph_path:        config.graph_path || '_byan/_memory/fact-graph.json'
    });
    this.verbose = config.verbose || false;
  }

  /**
   * Check a single claim.
   * Returns { assertionType, level, score, status, message }
   *
   * @param {string} claim - The assertion to evaluate
   * @param {object} opts  - { domain, level, source, proof }
   * @returns {object}
   */
  check(claim, opts = {}) {
    if (this.verbose) console.log(`[FC] Checking claim: "${claim}"`);
    const result = this.checker.check(claim, opts);
    if (this.verbose) console.log(`[FC] → ${result.assertionType} L${result.level} (${result.score}%)`);
    return result;
  }

  /**
   * Scan text and auto-detect implicit claims using danger patterns.
   * Returns array of { pattern, matched, position, excerpt }
   *
   * @param {string} text
   * @returns {Array}
   */
  parse(text) {
    const found = this.checker.parse(text);
    if (this.verbose) console.log(`[FC] Detected ${found.length} implicit claim(s)`);
    return found;
  }

  /**
   * Mark a claim as user-verified with a proof artifact.
   * Persists to the knowledge graph for future sessions.
   *
   * @param {string} claim - The assertion
   * @param {string} proof - Proof artifact (command output, URL, benchmark result)
   * @returns {{ id, status, claim }}
   */
  verify(claim, proof) {
    const result = this.checker.verify(claim, proof);
    if (this.verbose) console.log(`[FC] Verified: ${result.id}`);
    return result;
  }

  /**
   * Generate a Markdown fact sheet for a session.
   * Auto-buckets facts from the knowledge graph.
   *
   * @param {string} sessionId
   * @returns {{ content, path }}
   */
  sheet(sessionId = new Date().toISOString().slice(0, 10)) {
    const graph = this.checker.graph.load();
    const facts = graph.facts.reduce((acc, f) => {
      const bucket = f.status === 'VERIFIED' ? 'verified' :
                     f.status === 'DISPUTED' ? 'disputed' :
                     f.status === 'OPINION'  ? 'opinions' : 'claims';
      (acc[bucket] = acc[bucket] || []).push(f);
      return acc;
    }, {});
    return this.checker.generateFactSheet(sessionId, facts, true);
  }

  /**
   * Get all persisted facts from the knowledge graph.
   * @returns {Array}
   */
  getGraph() {
    return this.checker.graph.load().facts;
  }
}

module.exports = FactCheckWorker;
