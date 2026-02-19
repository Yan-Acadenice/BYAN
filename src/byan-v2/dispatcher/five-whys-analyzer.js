/**
 * FiveWhysAnalyzer - Root cause analysis through 5 WHYs technique
 * 
 * MANTRAS: KISS, DRY, SOLID, Zero Emoji (IA-23)
 * 
 * Features:
 * - Pain point detection in user responses
 * - Sequential WHY questioning (1-5 depth)
 * - Root cause extraction
 * - Analysis export with metadata
 */

const Logger = require('../observability/logger');

class FiveWhysAnalyzer {
  constructor(sessionState, logger, factChecker = null) {
    this.sessionState = sessionState;
    this.logger = logger || new Logger({ logDir: 'logs', logFile: 'five-whys.log' });
    this.factChecker = factChecker;
    
    this.depth = 0;
    this.maxDepth = 5;
    this.responses = [];
    this.painPoints = [];
    this.rootCause = null;
    this.active = false;
    
    this.painKeywords = [
      'problem', 'issue', 'challenge', 'difficult', 'slow', 'complex',
      'error', 'fail', 'break', 'bug', 'struggle', 'hard', 'confusing',
      'frustrating', 'annoying', 'painful', 'blocking', 'stuck'
    ];
  }

  start(initialResponse) {
    if (!initialResponse || typeof initialResponse !== 'string') {
      return { needsWhys: false, reason: 'Invalid response' };
    }

    const detected = this._detectPainPoints(initialResponse);
    
    if (!detected.hasPainPoints) {
      this.logger.info('No pain points detected', { response: initialResponse.substring(0, 100) });
      return { needsWhys: false, reason: 'No pain points detected' };
    }

    this.active = true;
    this.painPoints = detected.painPoints;
    this.responses.push({
      depth: 0,
      question: 'initial',
      answer: initialResponse,
      painPoints: detected.painPoints
    });

    this.logger.info('5 Whys started', { painPoints: detected.painPoints });

    return {
      needsWhys: true,
      painPoints: detected.painPoints,
      firstQuestion: this.askNext()
    };
  }

  _detectPainPoints(text) {
    const lowerText = text.toLowerCase();
    const foundPoints = [];

    for (const keyword of this.painKeywords) {
      if (lowerText.includes(keyword)) {
        const index = lowerText.indexOf(keyword);
        const context = text.substring(Math.max(0, index - 20), Math.min(text.length, index + 50));
        foundPoints.push({ keyword, context: context.trim() });
      }
    }

    return {
      hasPainPoints: foundPoints.length > 0,
      painPoints: foundPoints,
      confidence: Math.min(1.0, foundPoints.length / 3)
    };
  }

  askNext() {
    if (!this.active) {
      return null;
    }

    if (this.depth >= this.maxDepth) {
      return null;
    }

    this.depth++;

    const questions = [
      'Why is this a problem for you?',
      'Why does this happen?',
      'Why is that the case?',
      'Why does that matter?',
      'What is the underlying reason?'
    ];

    const question = this.depth === 1 
      ? 'Why is this a problem for you?'
      : questions[Math.min(this.depth - 1, questions.length - 1)];

    return {
      depth: this.depth,
      question,
      prompt: `${question} (${this.depth}/5)`
    };
  }

  processAnswer(answer) {
    if (!this.active) {
      return { valid: false, reason: 'Analyzer not active' };
    }

    if (!answer || typeof answer !== 'string' || answer.trim().length < 10) {
      return { valid: false, reason: 'Answer too short or invalid' };
    }

    this.responses.push({
      depth: this.depth,
      question: `Why #${this.depth}`,
      answer: answer.trim(),
      timestamp: new Date().toISOString(),
      assertionType: 'HYPOTHESIS'
    });

    if (this.factChecker) {
      const claims = this.factChecker.parse(answer);
      if (claims.length > 0) {
        this.logger.info('Fact-check triggered on WHY answer', { depth: this.depth, patterns: claims.map(c => c.matched) });
      }
    }

    const rootCauseAnalysis = this._analyzeForRootCause(answer);
    
    if (rootCauseAnalysis.isRootCause && this.depth >= 3) {
      this.rootCause = rootCauseAnalysis;
      this.active = false;
      this.logger.info('Root cause identified early', { 
        depth: this.depth, 
        rootCause: rootCauseAnalysis.statement 
      });
      
      return {
        valid: true,
        rootCauseFound: true,
        analysis: rootCauseAnalysis,
        nextQuestion: null
      };
    }

    if (this.depth >= this.maxDepth) {
      this.rootCause = this._extractRootCause();
      this.active = false;
      this.logger.info('5 Whys completed', { 
        depth: this.depth, 
        rootCause: this.rootCause.statement 
      });
      
      return {
        valid: true,
        completed: true,
        rootCause: this.rootCause,
        nextQuestion: null
      };
    }

    return {
      valid: true,
      nextQuestion: this.askNext()
    };
  }

  _analyzeForRootCause(answer) {
    const lowerAnswer = answer.toLowerCase();
    
    const rootCauseIndicators = [
      'because', 'fundamental', 'core', 'underlying', 'root',
      'lack of', 'missing', 'no process', 'no system', 'unclear',
      'not defined', 'never', 'always', 'since beginning'
    ];

    let indicatorCount = 0;
    for (const indicator of rootCauseIndicators) {
      if (lowerAnswer.includes(indicator)) {
        indicatorCount++;
      }
    }

    const isRootCause = indicatorCount >= 2 || (indicatorCount >= 1 && answer.length > 100);
    const confidence = Math.min(1.0, (indicatorCount * 0.3) + (answer.length / 500));

    return {
      isRootCause,
      confidence,
      statement: answer.trim(),
      depth: this.depth,
      indicators: indicatorCount
    };
  }

  _extractRootCause() {
    if (this.responses.length < 2) {
      return {
        statement: 'Insufficient data for root cause analysis',
        confidence: 0.0,
        category: 'unknown',
        actionItems: []
      };
    }

    const lastResponses = this.responses.slice(-2);
    const deepestAnswer = lastResponses[lastResponses.length - 1].answer;
    
    const category = this._categorizeRootCause(deepestAnswer);
    const actionItems = this._extractActionItems(deepestAnswer);
    const confidence = this._calculateConfidence(this.depth, deepestAnswer);

    return {
      statement: deepestAnswer,
      confidence,
      category,
      actionItems,
      depth: this.depth
    };
  }

  _categorizeRootCause(statement) {
    const lowerStatement = statement.toLowerCase();
    
    const categories = {
      technical: ['code', 'system', 'software', 'hardware', 'infrastructure', 'api', 'database'],
      process: ['process', 'workflow', 'procedure', 'method', 'approach', 'way we'],
      resource: ['time', 'money', 'budget', 'people', 'team', 'resource', 'capacity'],
      knowledge: ['know', 'understand', 'learn', 'training', 'documentation', 'experience', 'skill']
    };

    for (const [category, keywords] of Object.entries(categories)) {
      for (const keyword of keywords) {
        if (lowerStatement.includes(keyword)) {
          return category;
        }
      }
    }

    return 'general';
  }

  _extractActionItems(statement) {
    const actionKeywords = [
      'need to', 'should', 'must', 'have to', 'require',
      'implement', 'create', 'build', 'fix', 'improve'
    ];

    const sentences = statement.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const actions = [];

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      for (const keyword of actionKeywords) {
        if (lowerSentence.includes(keyword)) {
          actions.push(sentence.trim());
          break;
        }
      }
    }

    return actions.slice(0, 3);
  }

  _calculateConfidence(depth, statement) {
    let confidence = 0.5;
    
    confidence += (depth / this.maxDepth) * 0.3;
    
    if (statement.length > 50) confidence += 0.1;
    if (statement.length > 100) confidence += 0.1;
    
    return Math.min(1.0, confidence);
  }

  isComplete() {
    return !this.active;
  }

  getRootCause() {
    return this.rootCause;
  }

  getDepth() {
    return this.depth;
  }

  getResponses() {
    return [...this.responses];
  }

  export() {
    return {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      painPoints: this.painPoints,
      depth: this.depth,
      responses: this.responses,
      rootCause: this.rootCause,
      metadata: {
        completed: this.isComplete(),
        maxDepth: this.maxDepth,
        responseCount: this.responses.length
      }
    };
  }
}

module.exports = FiveWhysAnalyzer;
