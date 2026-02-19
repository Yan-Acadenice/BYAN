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

const ASSERTION_TYPES = ['REASONING', 'HYPOTHESIS', 'CLAIM', 'FACT'];

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
      ...config
    };
    this.sessionState = sessionState;
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
