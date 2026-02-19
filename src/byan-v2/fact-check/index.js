/**
 * FactChecker - Scientific fact-checking for BYAN
 *
 * Principles : demonstrable, quantifiable, reproducible
 * Method     : 4 assertion types x 5 proof levels
 * Rule       : Never generate a URL — only cite verified knowledge base
 *
 * @class FactChecker
 */

const fs = require('fs');
const path = require('path');
const LevelScorer = require('./level-scorer');
const ClaimParser = require('./claim-parser');
const FactSheet = require('./fact-sheet');
const KnowledgeGraph = require('./knowledge-graph');

const ASSERTION_TYPES = ['REASONING', 'HYPOTHESIS', 'CLAIM', 'FACT'];

// Fact half-lives in days by domain (null = never expires)
const DEFAULT_HALF_LIVES = {
  security:    180,   // 6 months — CVEs and vulns change fast
  performance: 365,   // 1 year — benchmarks depend on versions
  compliance:  180,   // 6 months — regulations evolve
  javascript:  365,   // 1 year — ecosystem moves fast
  general:     730,   // 2 years — general tech claims
  algorithms:  null   // never — Big O does not change
};

class FactChecker {
  constructor(config = {}, sessionState = null) {
    this.config = {
      enabled: true,
      mode: 'offline',
      min_level: 3,
      strict_domains: ['security', 'performance', 'compliance'],
      output_fact_sheet: true,
      fact_sheet_path: '_byan-output/fact-sheets',
      knowledge_base: '_byan/knowledge/sources.md',
      axioms: '_byan/knowledge/axioms.md',
      half_lives: DEFAULT_HALF_LIVES,
      ...config
    };
    this.sessionState = sessionState;
    this.graph = new KnowledgeGraph(this.config.graph_path || '_byan/_memory/fact-graph.json');
    this.scorer = new LevelScorer();
    this.parser = new ClaimParser(config.auto_trigger_patterns || []);
    this.sheet = new FactSheet(this.config.fact_sheet_path);
    this._knowledgeBase = null;
    this._axioms = null;
  }

  /**
   * Check a claim against the knowledge base
   * @param {string} claim
   * @param {object} options - { level, source, proof, domain }
   * @returns {{ status, level, score, assertionType, message }}
   */
  check(claim, options = {}) {
    if (typeof claim !== 'string' || !claim) {
      throw new Error('claim must be a non-empty string');
    }

    const { level = 5, source = null, proof = null, domain = null } = options;

    if (level < 1 || level > 5) throw new Error('level must be between 1 and 5');

    if (domain && this.scorer.isBlockedInDomain(level, domain)) {
      return {
        status: 'BLOCKED',
        level,
        score: this.scorer.score(level),
        assertionType: 'OPINION',
        message: `Domain "${domain}" requires LEVEL-${this.config.strict_domains.includes(domain) ? 2 : 1} minimum. Got LEVEL-${level}.`
      };
    }

    if (level > this.config.min_level) {
      return {
        status: 'OPINION',
        level,
        score: this.scorer.score(level),
        assertionType: 'HYPOTHESIS',
        message: `LEVEL-${level} is below min_level (${this.config.min_level}). Marked as HYPOTHESIS.`
      };
    }

    const fact = {
      claim,
      level,
      source,
      proof,
      status: 'CLAIM',
      confidence: this.scorer.score(level),
      assertionType: 'CLAIM'
    };

    if (this.sessionState) this.sessionState.addFact(fact);
    this.graph.add({ ...fact, domain: domain || 'general', expires_at: this.expiresAt(domain || 'general') });

    return {
      status: 'CLAIM',
      level,
      score: fact.confidence,
      assertionType: 'CLAIM',
      message: `[CLAIM L${level}] ${claim}${source ? ' — ' + (source.url || source) : ''}${proof ? ' — proof: ' + (proof.content || proof) : ''}`
    };
  }

  /**
   * Register a user-verified fact with proof artifact
   * @param {string} claim
   * @param {string|object} proof - command output, screenshot path, log excerpt
   * @returns {{ status, message }}
   */
  verify(claim, proof) {
    if (typeof claim !== 'string' || !claim) throw new Error('claim must be a non-empty string');
    if (!proof) throw new Error('proof artifact is required for USER-VERIFIED facts');

    const date = new Date().toISOString().slice(0, 10);
    const fact = {
      claim,
      level: 1,
      proof: typeof proof === 'string' ? { type: 'user-provided', content: proof } : proof,
      status: 'VERIFIED',
      confidence: 100,
      assertionType: 'FACT',
      verified_at: date
    };

    if (this.sessionState) this.sessionState.addFact(fact);
    this.graph.add({ ...fact, domain: 'verified', expires_at: null });

    return {
      status: 'VERIFIED',
      message: `[FACT USER-VERIFIED ${date}] ${claim}`
    };
  }

  /**
   * Detect implicit claims in a text using trigger patterns
   * @param {string} text
   * @returns {Array<{ matched, excerpt, position }>}
   */
  parse(text) {
    return this.parser.parse(text);
  }

  /**
   * Generate and optionally save the session Fact Sheet
   * @param {string} sessionId
   * @param {object} facts - { verified, claims, disputed, opinions }
   * @param {boolean} save - write to disk
   * @returns {{ content, filePath }}
   */
  generateFactSheet(sessionId, facts, save = true) {
    const content = this.sheet.generate(sessionId, facts);
    let filePath = null;
    if (save && this.config.output_fact_sheet) {
      filePath = this.sheet.save(sessionId, facts);
    }
    return { content, filePath };
  }

  /**
   * Calculate expiry date for a fact based on its domain
   * @param {string} domain
   * @param {string} createdAt - ISO date string
   * @returns {string|null} ISO expiry date or null if never expires
   */
  expiresAt(domain, createdAt = new Date().toISOString()) {
    const halfLife = (this.config.half_lives || DEFAULT_HALF_LIVES)[domain];
    if (halfLife === null || halfLife === undefined) return null;
    const created = new Date(createdAt);
    const expiry = new Date(Date.UTC(
      created.getUTCFullYear(),
      created.getUTCMonth(),
      created.getUTCDate() + halfLife
    ));
    return expiry.toISOString().slice(0, 10);
  }

  /**
   * Check if a stored fact has expired
   * @param {object} fact - must have created_at and domain
   * @returns {{ expired: boolean, daysLeft: number|null, warning: string|null }}
   */
  checkExpiration(fact) {
    if (!fact || !fact.created_at) throw new Error('fact.created_at is required');
    const domain = fact.domain || 'general';
    const expiry = this.expiresAt(domain, fact.created_at);

    if (!expiry) return { expired: false, daysLeft: null, warning: null };

    const now = new Date();
    const expiryDate = new Date(expiry);
    const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

    if (daysLeft <= 0) {
      return { expired: true, daysLeft: 0, warning: `[EXPIRED] This fact (domain: ${domain}) is ${Math.abs(daysLeft)} days past its expiry date. Re-verify before using.` };
    }
    if (daysLeft <= 30) {
      return { expired: false, daysLeft, warning: `[EXPIRING SOON] This fact expires in ${daysLeft} days. Consider re-verifying.` };
    }
    return { expired: false, daysLeft, warning: null };
  }

  /**
   * Calculate confidence propagation through a reasoning chain
   * Confidence degrades multiplicatively: 80% x 80% x 80% = 51%
   * @param {Array<number>} scores - confidence scores for each chain step (0-100)
   * @returns {{ finalScore: number, warning: string|null, steps: number }}
   */
  chain(scores) {
    if (!Array.isArray(scores) || scores.length === 0) {
      throw new Error('scores must be a non-empty array of numbers');
    }
    for (const s of scores) {
      if (typeof s !== 'number' || s < 0 || s > 100) {
        throw new Error('Each score must be a number between 0 and 100');
      }
    }

    const finalScore = Math.round(
      scores.reduce((acc, s) => acc * (s / 100), 1) * 100
    );

    let warning = null;
    if (scores.length > 3) {
      warning = `Chain of ${scores.length} steps detected. Confidence degraded to ${finalScore}% (${scores.join('% x ')}%). Consider finding a direct source instead of a long deduction chain.`;
    } else if (finalScore < 60) {
      warning = `Chain confidence is ${finalScore}% — below 60% threshold. This conclusion should not be presented as a firm recommendation.`;
    }

    return { finalScore, steps: scores.length, warning };
  }

  _loadKnowledgeBase() {
    if (this._knowledgeBase) return this._knowledgeBase;
    try {
      this._knowledgeBase = fs.readFileSync(
        path.resolve(this.config.knowledge_base), 'utf8'
      );
    } catch {
      this._knowledgeBase = '';
    }
    return this._knowledgeBase;
  }

  _loadAxioms() {
    if (this._axioms) return this._axioms;
    try {
      this._axioms = fs.readFileSync(
        path.resolve(this.config.axioms), 'utf8'
      );
    } catch {
      this._axioms = '';
    }
    return this._axioms;
  }
}

module.exports = FactChecker;
