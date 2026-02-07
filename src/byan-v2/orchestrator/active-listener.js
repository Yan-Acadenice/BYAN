/**
 * ActiveListener - Reformulates and validates user understanding
 * Mantra IA-23: Zero emojis
 * 
 * Principles: KISS, DRY, SOLID
 * Performance target: < 100ms per reformulation
 */

const Logger = require('../observability/logger');

class ActiveListener {
  constructor(sessionState, logger = null) {
    this.sessionState = sessionState;
    this.logger = logger || new Logger('active-listener');
    this.history = [];
    this.validationFrequency = 3; // Ask for validation every N responses
    this.responseCount = 0;
    this.clarityThresholdMin = 0.0;
    this.clarityThresholdMax = 1.0;
    
    // Filler words to remove
    this.fillerWords = [
      'um', 'uh', 'like', 'you know', 'i mean', 'sort of', 'kind of',
      'basically', 'actually', 'literally', 'really', 'very', 'just',
      'maybe', 'probably', 'perhaps', 'i guess', 'i think'
    ];
  }

  /**
   * Process user response through active listening workflow
   * @param {string} userResponse - Raw user input
   * @returns {Object} Listening result with reformulation and summary
   */
  listen(userResponse) {
    const startTime = Date.now();
    
    if (!userResponse || typeof userResponse !== 'string') {
      return {
        valid: false,
        error: 'Invalid input: response must be a non-empty string'
      };
    }

    this.logger.info('Processing user response', { length: userResponse.length });

    const trimmed = userResponse.trim();
    if (trimmed.length === 0) {
      return {
        valid: false,
        error: 'Invalid input: response cannot be empty'
      };
    }

    // Reformulate the response
    const reformulated = this.reformulate(trimmed);
    
    // Extract key points
    const keyPoints = this.extractKeyPoints(reformulated.text);
    
    // Generate summary
    const summary = this.generateSummary(keyPoints);
    
    // Track in history
    this.responseCount++;
    const record = {
      original: trimmed,
      reformulated: reformulated.text,
      clarityScore: reformulated.clarityScore,
      keyPoints: keyPoints,
      summary: summary,
      timestamp: Date.now(),
      needsValidation: this.needsValidation()
    };
    this.history.push(record);

    const duration = Date.now() - startTime;
    this.logger.info('Response processed', { 
      duration: duration,
      clarityScore: reformulated.clarityScore,
      keyPointsCount: keyPoints.length
    });

    return {
      valid: true,
      reformulated: reformulated.text,
      clarityScore: reformulated.clarityScore,
      keyPoints: keyPoints,
      summary: summary,
      needsValidation: record.needsValidation,
      processingTime: duration
    };
  }

  /**
   * Reformulate text in clear, simple language
   * @param {string} text - Text to reformulate
   * @returns {Object} Reformulated text with clarity score
   */
  reformulate(text) {
    if (!text || typeof text !== 'string') {
      return { text: '', clarityScore: 0.0 };
    }

    let improved = text.trim();
    let improvementScore = 0;
    const maxImprovements = 5;

    // 1. Remove filler words
    const beforeFillers = improved;
    improved = this._removeFiller(improved);
    if (improved !== beforeFillers) improvementScore++;

    // 2. Convert to active voice (basic patterns)
    const beforeVoice = improved;
    improved = this._toActiveVoice(improved);
    if (improved !== beforeVoice) improvementScore++;

    // 3. Simplify complex sentences
    const beforeSimplify = improved;
    improved = this._simplifyComplexSentences(improved);
    if (improved !== beforeSimplify) improvementScore++;

    // 4. Remove redundancy
    const beforeRedundancy = improved;
    improved = this._removeRedundancy(improved);
    if (improved !== beforeRedundancy) improvementScore++;

    // 5. Normalize whitespace
    const beforeWhitespace = improved;
    improved = this._normalizeWhitespace(improved);
    if (improved !== beforeWhitespace) improvementScore++;

    // Calculate clarity score
    const clarityScore = this._calculateClarityScore(text, improved, improvementScore, maxImprovements);

    return {
      text: improved,
      clarityScore: clarityScore
    };
  }

  /**
   * Extract 3-5 key points from text
   * @param {string} text - Text to analyze
   * @returns {Array<string>} Key points (3-5 items)
   */
  extractKeyPoints(text) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return [];
    }

    // Split into sentences
    const sentences = this._splitIntoSentences(text);
    
    if (sentences.length === 0) {
      return [];
    }

    // For short texts, return all sentences (max 5)
    if (sentences.length <= 5) {
      return sentences.slice(0, 5);
    }

    // For longer texts, score and select top sentences
    const scoredSentences = sentences.map(sentence => ({
      text: sentence,
      score: this._scoreSentenceImportance(sentence, sentences)
    }));

    // Sort by score and take top 5
    scoredSentences.sort((a, b) => b.score - a.score);
    
    // Return 3-5 points based on content density
    const pointCount = Math.min(5, Math.max(3, Math.ceil(sentences.length / 3)));
    return scoredSentences.slice(0, pointCount).map(s => s.text);
  }

  /**
   * Generate "So if I understand correctly..." summary
   * @param {Array<string>} keyPoints - Key points to summarize
   * @returns {string} Summary with validation question
   */
  generateSummary(keyPoints) {
    if (!Array.isArray(keyPoints) || keyPoints.length === 0) {
      return 'So if I understand correctly, you have not provided enough information yet. Could you elaborate?';
    }

    // Combine key points into cohesive narrative
    let narrative = '';
    
    if (keyPoints.length === 1) {
      narrative = keyPoints[0];
    } else if (keyPoints.length === 2) {
      narrative = `${keyPoints[0]} Additionally, ${this._lowercaseFirst(keyPoints[1])}`;
    } else {
      // First point
      narrative = keyPoints[0];
      
      // Middle points
      for (let i = 1; i < keyPoints.length - 1; i++) {
        narrative += ` ${this._lowercaseFirst(keyPoints[i])}`;
      }
      
      // Last point
      narrative += ` Finally, ${this._lowercaseFirst(keyPoints[keyPoints.length - 1])}`;
    }

    return `So if I understand correctly, ${this._lowercaseFirst(narrative)} Is that accurate?`;
  }

  /**
   * Check if validation is needed based on frequency
   * @returns {boolean} True if validation should be requested
   */
  needsValidation() {
    return this.responseCount % this.validationFrequency === 0;
  }

  /**
   * Process user's validation response
   * @param {boolean|string} userConfirmation - User's yes/no response
   * @param {string} summary - The summary being validated
   * @returns {Object} Validation result
   */
  validateUnderstanding(userConfirmation, summary) {
    const confirmed = this._parseConfirmation(userConfirmation);
    const needsCorrection = !confirmed && userConfirmation !== true && userConfirmation !== false;
    
    const result = {
      validated: confirmed,
      needsCorrection: needsCorrection && !confirmed,
      ambiguous: !confirmed && !needsCorrection,
      timestamp: Date.now(),
      summary: summary,
      clarificationPrompt: needsCorrection ? 'Please clarify what I misunderstood so I can correct my understanding.' : null
    };

    // Update last history entry with validation result
    if (this.history.length > 0) {
      this.history[this.history.length - 1].validationResult = result;
    }

    this.logger.info('Understanding validated', { validated: confirmed, needsCorrection: needsCorrection });

    return result;
  }

  /**
   * Process correction from user when understanding was wrong
   * @param {string} correction - User's correction text
   * @returns {Object} Correction result with updated summary
   */
  processCorrection(correction) {
    if (!correction || typeof correction !== 'string') {
      return { updated: false, error: 'Invalid correction' };
    }

    const reformulated = this.reformulate(correction);
    const keyPoints = this.extractKeyPoints(reformulated.text);
    const newSummary = this.generateSummary(keyPoints);

    this.history.push({
      original: correction,
      reformulated: reformulated.text,
      clarityScore: reformulated.clarityScore,
      keyPoints: keyPoints,
      summary: newSummary,
      timestamp: Date.now(),
      isCorrection: true
    });

    this.logger.info('Correction processed', { correctionLength: correction.length });

    return {
      updated: true,
      reformulated: reformulated.text,
      newSummary: newSummary,
      keyPoints: keyPoints
    };
  }

  /**
   * Get consolidated summary from all responses
   * @returns {string} Comprehensive summary
   */
  generateConsolidatedSummary() {
    if (this.history.length === 0) {
      return 'No information collected yet.';
    }

    const allKeyPoints = [];
    this.history.forEach(record => {
      if (record.keyPoints && record.keyPoints.length > 0) {
        allKeyPoints.push(...record.keyPoints);
      }
    });

    // Remove duplicates and keep most relevant
    const uniquePoints = [...new Set(allKeyPoints)].slice(0, 5);

    return this.generateSummary(uniquePoints);
  }

  /**
   * Get specific history record by index
   * @param {number} index - Index of the record
   * @returns {Object} History record
   */
  getHistoryRecord(index) {
    if (index < 0 || index >= this.history.length) {
      return null;
    }
    return this.history[index];
  }

  /**
   * Export listening session data
   * @returns {Object} Complete session export
   */
  export() {
    return {
      totalResponses: this.responseCount,
      history: this.history,
      summary: this.generateConsolidatedSummary(),
      averageClarityScore: this._calculateAverageClarityScore(),
      validationFrequency: this.validationFrequency,
      exportTimestamp: Date.now(),
      metadata: {
        sessionId: this.sessionState?.sessionId || 'unknown',
        totalResponses: this.responseCount,
        validationFrequency: this.validationFrequency,
        exportedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Export as markdown format
   * @returns {string} Markdown formatted export
   */
  exportAsMarkdown() {
    const lines = [
      '# Active Listening Session',
      '',
      `**Total Responses:** ${this.responseCount}`,
      `**Average Clarity Score:** ${(this._calculateAverageClarityScore() * 100).toFixed(1)}%`,
      '',
      '## Summary',
      '',
      this.generateConsolidatedSummary(),
      '',
      '## Responses',
      ''
    ];

    this.history.forEach((record, index) => {
      lines.push(`### Response ${index + 1}`);
      lines.push('');
      lines.push(`**Original:** ${record.original}`);
      lines.push('');
      lines.push(`**Reformulated:** ${record.reformulated}`);
      lines.push('');
      lines.push(`**Clarity Score:** ${(record.clarityScore * 100).toFixed(1)}%`);
      lines.push('');
      if (record.keyPoints && record.keyPoints.length > 0) {
        lines.push('**Key Points:**');
        record.keyPoints.forEach(kp => lines.push(`- ${kp}`));
        lines.push('');
      }
    });

    return lines.join('\n');
  }

  /**
   * Export as JSON format
   * @returns {string} JSON formatted export
   */
  exportAsJSON() {
    return JSON.stringify(this.export(), null, 2);
  }

  // Private helper methods

  _removeFiller(text) {
    let result = text;
    
    this.fillerWords.forEach(filler => {
      const pattern = new RegExp(`\\b${filler}\\b,?\\s*`, 'gi');
      result = result.replace(pattern, '');
    });
    
    return result;
  }

  _toActiveVoice(text) {
    // Basic passive to active voice conversions
    const patterns = [
      { passive: /was (\w+ed) by/gi, active: (match, verb) => verb },
      { passive: /were (\w+ed) by/gi, active: (match, verb) => verb },
      { passive: /is being (\w+ed)/gi, active: (match, verb) => verb },
      { passive: /has been (\w+ed)/gi, active: (match, verb) => verb }
    ];

    let result = text;
    patterns.forEach(({ passive }) => {
      result = result.replace(passive, '');
    });

    return result;
  }

  _simplifyComplexSentences(text) {
    // Replace complex conjunctions with simpler ones
    let result = text;
    
    const replacements = {
      'in order to': 'to',
      'due to the fact that': 'because',
      'in the event that': 'if',
      'at this point in time': 'now',
      'for the purpose of': 'for',
      'in spite of': 'despite',
      'on the basis of': 'based on'
    };

    Object.entries(replacements).forEach(([complex, simple]) => {
      const pattern = new RegExp(complex, 'gi');
      result = result.replace(pattern, simple);
    });

    return result;
  }

  _removeRedundancy(text) {
    // Remove repeated words
    const words = text.split(/\s+/);
    const filtered = [];
    let previous = null;

    words.forEach(word => {
      const normalized = word.toLowerCase().replace(/[.,!?;:]$/, '');
      if (normalized !== previous) {
        filtered.push(word);
        previous = normalized;
      }
    });

    return filtered.join(' ');
  }

  _normalizeWhitespace(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\s+([.,!?;:])/g, '$1')
      .trim();
  }

  _calculateClarityScore(original, improved, improvementScore, maxImprovements) {
    // Base score from improvements made
    const improvementRatio = improvementScore / maxImprovements;
    
    // Length reduction bonus (shorter is often clearer)
    const lengthReduction = Math.max(0, (original.length - improved.length) / original.length);
    
    // Combined score
    const score = (improvementRatio * 0.7) + (lengthReduction * 0.3);
    
    // Normalize to 0.0-1.0 range
    return Math.max(this.clarityThresholdMin, Math.min(this.clarityThresholdMax, score));
  }

  _splitIntoSentences(text) {
    // Split on sentence boundaries
    const sentences = text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    return sentences;
  }

  _scoreSentenceImportance(sentence, allSentences) {
    let score = 0;
    
    // Longer sentences often contain more information
    score += Math.min(10, sentence.length / 10);
    
    // First and last sentences are often important
    const index = allSentences.indexOf(sentence);
    if (index === 0 || index === allSentences.length - 1) {
      score += 5;
    }
    
    // Sentences with numbers or specific terms
    if (/\d+/.test(sentence)) {
      score += 3;
    }
    
    // Sentences with key business terms
    const keyTerms = ['need', 'want', 'require', 'must', 'should', 'important', 'critical', 'essential'];
    keyTerms.forEach(term => {
      if (sentence.toLowerCase().includes(term)) {
        score += 2;
      }
    });
    
    return score;
  }

  _lowercaseFirst(text) {
    if (!text || text.length === 0) return text;
    return text.charAt(0).toLowerCase() + text.slice(1);
  }

  _parseConfirmation(input) {
    if (typeof input === 'boolean') {
      return input;
    }
    
    if (typeof input === 'string') {
      const normalized = input.toLowerCase().trim();
      const positive = ['yes', 'y', 'yeah', 'yep', 'correct', 'right', 'true', 'ok', 'okay'];
      const negative = ['no', 'n', 'nope', 'incorrect', 'wrong', 'false'];
      
      if (positive.includes(normalized)) return true;
      if (negative.includes(normalized)) return false;
    }
    
    return false;
  }

  _calculateAverageClarityScore() {
    if (this.history.length === 0) return 0.0;
    
    const sum = this.history.reduce((acc, record) => acc + record.clarityScore, 0);
    return sum / this.history.length;
  }
}

module.exports = ActiveListener;
