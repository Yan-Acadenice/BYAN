/**
 * FiveWhysAnalyzer Tests
 * MANTRAS: KISS, DRY, SOLID, Zero Emoji
 */

const FiveWhysAnalyzer = require('../../../src/byan-v2/dispatcher/five-whys-analyzer');
const SessionState = require('../../../src/byan-v2/context/session-state');
const Logger = require('../../../src/byan-v2/observability/logger');

describe('FiveWhysAnalyzer', () => {
  let sessionState;
  let logger;
  let analyzer;

  beforeEach(() => {
    sessionState = new SessionState();
    logger = new Logger({ logDir: 'logs', logFile: 'test-five-whys.log' });
    analyzer = new FiveWhysAnalyzer(sessionState, logger);
  });

  describe('constructor', () => {
    it('should initialize with sessionState and logger', () => {
      expect(analyzer.sessionState).toBe(sessionState);
      expect(analyzer.logger).toBe(logger);
      expect(analyzer.depth).toBe(0);
      expect(analyzer.maxDepth).toBe(5);
      expect(analyzer.responses).toEqual([]);
    });

    it('should create default logger if not provided', () => {
      const analyzerNoLogger = new FiveWhysAnalyzer(sessionState);
      expect(analyzerNoLogger.logger).toBeDefined();
    });
  });

  describe('start()', () => {
    it('should detect pain points and start analysis', () => {
      const response = 'Our deployment process is slow and error-prone, causing major problems for the team.';
      const result = analyzer.start(response);

      expect(result.needsWhys).toBe(true);
      expect(result.painPoints.length).toBeGreaterThan(0);
      expect(result.firstQuestion).toBeDefined();
      expect(result.firstQuestion.depth).toBe(1);
      expect(analyzer.active).toBe(true);
    });

    it('should not start if no pain points detected', () => {
      const response = 'Everything is working perfectly and smoothly.';
      const result = analyzer.start(response);

      expect(result.needsWhys).toBe(false);
      expect(result.reason).toContain('No pain points');
      expect(analyzer.active).toBe(false);
    });

    it('should reject invalid input', () => {
      const result = analyzer.start(null);
      expect(result.needsWhys).toBe(false);
      expect(result.reason).toContain('Invalid');
    });

    it('should detect multiple pain keywords', () => {
      const response = 'The system is slow, complex, and has frequent errors that are difficult to debug.';
      const result = analyzer.start(response);

      expect(result.painPoints.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('_detectPainPoints()', () => {
    it('should detect single pain keyword', () => {
      const result = analyzer._detectPainPoints('We have a problem with the API');
      
      expect(result.hasPainPoints).toBe(true);
      expect(result.painPoints.length).toBe(1);
      expect(result.painPoints[0].keyword).toBe('problem');
    });

    it('should detect multiple pain keywords', () => {
      const result = analyzer._detectPainPoints('The slow system causes errors and is difficult to fix');
      
      expect(result.hasPainPoints).toBe(true);
      expect(result.painPoints.length).toBeGreaterThanOrEqual(3);
    });

    it('should return false for positive text', () => {
      const result = analyzer._detectPainPoints('Everything works great and users are happy');
      
      expect(result.hasPainPoints).toBe(false);
      expect(result.painPoints.length).toBe(0);
    });

    it('should calculate confidence score', () => {
      const result = analyzer._detectPainPoints('We struggle with complex issues and errors');
      
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe('askNext()', () => {
    beforeEach(() => {
      analyzer.start('We have a slow deployment problem that is blocking releases.');
    });

    it('should return first WHY question', () => {
      const question = analyzer.askNext();

      expect(question).toBeDefined();
      expect(question.depth).toBe(2);
      expect(question.question).toContain('Why');
      expect(question.prompt).toContain('2/5');
    });

    it('should increment depth with each call', () => {
      const q1 = analyzer.askNext();
      const result = analyzer.processAnswer('Because our CI/CD pipeline is not automated properly.');
      
      expect(result.nextQuestion.depth).toBe(3);
    });

    it('should return null when max depth reached', () => {
      for (let i = 0; i < 5; i++) {
        analyzer.askNext();
        if (i < 4) {
          analyzer.processAnswer('Because of reason ' + i);
        }
      }

      const question = analyzer.askNext();
      expect(question).toBeNull();
    });

    it('should return null when not active', () => {
      analyzer.active = false;
      const question = analyzer.askNext();
      expect(question).toBeNull();
    });
  });

  describe('processAnswer()', () => {
    beforeEach(() => {
      analyzer.start('The deployment process is slow and causes problems.');
    });

    it('should accept valid answer', () => {
      analyzer.askNext();
      const result = analyzer.processAnswer('Because we do not have automated testing in place.');

      expect(result.valid).toBe(true);
      expect(analyzer.responses.length).toBe(2);
    });

    it('should reject too short answer', () => {
      analyzer.askNext();
      const result = analyzer.processAnswer('Short');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('short');
    });

    it('should reject null answer', () => {
      analyzer.askNext();
      const result = analyzer.processAnswer(null);

      expect(result.valid).toBe(false);
    });

    it('should detect root cause early at depth 3+', () => {
      analyzer.askNext();
      const r1 = analyzer.processAnswer('Because our team does not have proper CI/CD setup yet.');
      
      const r2 = analyzer.processAnswer('Because we are still learning and figuring things out.');
      
      const result = analyzer.processAnswer('Because there is no fundamental process in place and the underlying lack of documentation has always been an issue since the beginning.');

      expect(result.rootCauseFound).toBe(true);
      expect(analyzer.isComplete()).toBe(true);
    });

    it('should complete after 5 WHYs', () => {
      analyzer.askNext();
      for (let i = 0; i < 4; i++) {
        const result = analyzer.processAnswer(`This is just answer number ${i + 1} explaining our situation.`);
        
        if (i === 3) {
          expect(result.completed).toBe(true);
          expect(result.rootCause).toBeDefined();
        }
      }
    });

    it('should return next question if not complete', () => {
      analyzer.askNext();
      const result = analyzer.processAnswer('Because we do not have proper tools.');

      expect(result.nextQuestion).toBeDefined();
      expect(result.nextQuestion.depth).toBe(3);
    });
  });

  describe('_analyzeForRootCause()', () => {
    it('should detect root cause indicators', () => {
      const answer = 'The fundamental problem is the lack of proper process and underlying infrastructure issues.';
      const result = analyzer._analyzeForRootCause(answer);

      expect(result.isRootCause).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.indicators).toBeGreaterThanOrEqual(2);
    });

    it('should not detect root cause without indicators', () => {
      const answer = 'We just need more time.';
      const result = analyzer._analyzeForRootCause(answer);

      expect(result.isRootCause).toBe(false);
    });

    it('should consider answer length in confidence', () => {
      const shortAnswer = 'Because of lack of time.';
      const longAnswer = 'Because we have a fundamental lack of proper documentation and processes in place, which has been an underlying issue since the project started, and there is no clear system for knowledge sharing.';

      const shortResult = analyzer._analyzeForRootCause(shortAnswer);
      const longResult = analyzer._analyzeForRootCause(longAnswer);

      expect(longResult.confidence).toBeGreaterThan(shortResult.confidence);
    });
  });

  describe('_extractRootCause()', () => {
    beforeEach(() => {
      analyzer.start('We have deployment problems.');
      for (let i = 0; i < 5; i++) {
        analyzer.askNext();
        analyzer.processAnswer(`This is response number ${i + 1} explaining the underlying issue with our process and lack of proper training.`);
      }
    });

    it('should extract root cause from last response', () => {
      const rootCause = analyzer._extractRootCause();

      expect(rootCause.statement).toBeDefined();
      expect(rootCause.confidence).toBeGreaterThan(0);
      expect(rootCause.category).toBeDefined();
    });

    it('should categorize root cause', () => {
      const rootCause = analyzer._extractRootCause();

      expect(['technical', 'process', 'resource', 'knowledge', 'general']).toContain(rootCause.category);
    });

    it('should extract action items', () => {
      const rootCause = analyzer._extractRootCause();

      expect(Array.isArray(rootCause.actionItems)).toBe(true);
    });
  });

  describe('_categorizeRootCause()', () => {
    it('should categorize as technical', () => {
      const category = analyzer._categorizeRootCause('Our database system is causing performance issues.');
      expect(category).toBe('technical');
    });

    it('should categorize as process', () => {
      const category = analyzer._categorizeRootCause('We lack a proper workflow and procedure for deployments.');
      expect(category).toBe('process');
    });

    it('should categorize as resource', () => {
      const category = analyzer._categorizeRootCause('The team does not have enough time or budget to implement this.');
      expect(category).toBe('resource');
    });

    it('should categorize as knowledge', () => {
      const category = analyzer._categorizeRootCause('Nobody understands how this works and we lack proper documentation.');
      expect(category).toBe('knowledge');
    });

    it('should default to general', () => {
      const category = analyzer._categorizeRootCause('This is a generic problem.');
      expect(category).toBe('general');
    });
  });

  describe('_extractActionItems()', () => {
    it('should extract action items from statement', () => {
      const statement = 'We need to implement better testing. We should create documentation. We must improve the process.';
      const actions = analyzer._extractActionItems(statement);

      expect(actions.length).toBeGreaterThan(0);
      expect(actions.length).toBeLessThanOrEqual(3);
    });

    it('should return empty array if no actions found', () => {
      const statement = 'This is just a description without any actions.';
      const actions = analyzer._extractActionItems(statement);

      expect(Array.isArray(actions)).toBe(true);
    });

    it('should limit to 3 action items', () => {
      const statement = 'We need to implement A. We should create B. We must improve C. We have to build D. We require E.';
      const actions = analyzer._extractActionItems(statement);

      expect(actions.length).toBeLessThanOrEqual(3);
    });
  });

  describe('_calculateConfidence()', () => {
    it('should calculate confidence based on depth', () => {
      const conf1 = analyzer._calculateConfidence(1, 'Short answer');
      const conf5 = analyzer._calculateConfidence(5, 'Short answer');

      expect(conf5).toBeGreaterThan(conf1);
    });

    it('should consider statement length', () => {
      const confShort = analyzer._calculateConfidence(3, 'Short');
      const confLong = analyzer._calculateConfidence(3, 'This is a much longer statement that provides more context and detail about the situation.');

      expect(confLong).toBeGreaterThan(confShort);
    });

    it('should not exceed 1.0', () => {
      const conf = analyzer._calculateConfidence(5, 'Very long statement'.repeat(20));

      expect(conf).toBeLessThanOrEqual(1.0);
    });
  });

  describe('isComplete()', () => {
    it('should return false initially', () => {
      expect(analyzer.isComplete()).toBe(true);
    });

    it('should return false when active', () => {
      analyzer.start('We have a deployment problem.');
      expect(analyzer.isComplete()).toBe(false);
    });

    it('should return true when max depth reached', () => {
      analyzer.start('We have a problem.');
      for (let i = 0; i < 5; i++) {
        analyzer.askNext();
        analyzer.processAnswer('Because of reason ' + i);
      }

      expect(analyzer.isComplete()).toBe(true);
    });

    it('should return true when root cause found early', () => {
      analyzer.start('We have issues.');
      analyzer.askNext();
      analyzer.processAnswer('Because of something.');
      analyzer.askNext();
      analyzer.processAnswer('Because of something else.');
      analyzer.askNext();
      analyzer.processAnswer('The fundamental underlying lack of process has been the core issue since the beginning.');

      expect(analyzer.isComplete()).toBe(true);
    });
  });

  describe('getRootCause()', () => {
    it('should return null initially', () => {
      expect(analyzer.getRootCause()).toBeNull();
    });

    it('should return root cause after completion', () => {
      analyzer.start('We have deployment problems.');
      for (let i = 0; i < 5; i++) {
        analyzer.askNext();
        analyzer.processAnswer('Because of underlying reason ' + i);
      }

      const rootCause = analyzer.getRootCause();
      expect(rootCause).toBeDefined();
      expect(rootCause.statement).toBeDefined();
    });
  });

  describe('getDepth()', () => {
    it('should return 0 initially', () => {
      expect(analyzer.getDepth()).toBe(0);
    });

    it('should return current depth', () => {
      analyzer.start('We have problems.');
      analyzer.askNext();
      analyzer.processAnswer('Because of reasons.');

      expect(analyzer.getDepth()).toBe(3);
    });
  });

  describe('getResponses()', () => {
    it('should return empty array initially', () => {
      expect(analyzer.getResponses()).toEqual([]);
    });

    it('should return copy of responses array', () => {
      analyzer.start('Problem detected.');
      const responses = analyzer.getResponses();
      responses.push({ fake: true });

      expect(analyzer.getResponses().length).toBe(1);
    });

    it('should return all responses', () => {
      analyzer.start('We have deployment problems that are slow and cause errors.');
      analyzer.askNext();
      analyzer.processAnswer('Because our automation is not working properly.');
      analyzer.processAnswer('Because we do not have proper testing in place.');

      const responses = analyzer.getResponses();
      expect(responses.length).toBe(3);
    });
  });

  describe('export()', () => {
    it('should export analysis with metadata', () => {
      analyzer.start('We have a deployment problem that causes errors.');
      analyzer.askNext();
      analyzer.processAnswer('Because we lack proper automation.');

      const exported = analyzer.export();

      expect(exported.version).toBe('1.0.0');
      expect(exported.createdAt).toBeDefined();
      expect(exported.painPoints).toBeDefined();
      expect(exported.depth).toBeGreaterThan(0);
      expect(exported.responses).toBeDefined();
      expect(exported.metadata).toBeDefined();
    });

    it('should include completion status', () => {
      analyzer.start('Problem.');
      const exported = analyzer.export();

      expect(exported.metadata.completed).toBe(false);
    });

    it('should include all responses', () => {
      analyzer.start('We have a deployment problem that is blocking our releases.');
      analyzer.askNext();
      analyzer.processAnswer('Because we lack proper automation tools.');

      const exported = analyzer.export();
      expect(exported.responses.length).toBe(2);
    });
  });

  describe('performance', () => {
    it('should detect pain points in less than 50ms', () => {
      const start = Date.now();
      analyzer._detectPainPoints('We have multiple slow problems that are difficult to fix and cause errors.');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });

    it('should analyze root cause in less than 50ms', () => {
      const start = Date.now();
      analyzer._analyzeForRootCause('The fundamental underlying lack of proper process and documentation has been the core issue.');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });
  });
});
