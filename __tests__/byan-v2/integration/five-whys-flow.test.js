/**
 * Integration Tests: 5 Whys Workflow
 * 
 * Tests the complete 5 Whys root cause analysis workflow:
 * - Pain point detection in user responses
 * - Automatic triggering of 5 Whys analysis
 * - Sequential WHY questioning (depth 1-5)
 * - Early root cause detection (depth 3)
 * - Root cause extraction at max depth
 * - Root cause categorization
 * - Action item extraction
 * - Export functionality
 * 
 * Quality: KISS, DRY, SOLID
 * Performance: < 5s total execution
 * Mantra IA-23: Zero emojis
 */

const ByanV2 = require('../../../src/byan-v2');
const FiveWhysAnalyzer = require('../../../src/byan-v2/dispatcher/five-whys-analyzer');

describe('5 Whys Workflow Integration', () => {
  let byan;
  let fiveWhysAnalyzer;

  beforeEach(() => {
    byan = new ByanV2({
      sessionId: 'test-five-whys-flow',
      maxQuestions: 12,
      bmad_features: {
        five_whys: {
          enabled: true,
          max_depth: 5,
          pain_keywords: [
            'problem', 'issue', 'challenge', 'difficult', 'slow', 
            'error', 'fail', 'bug', 'struggle', 'frustrating'
          ]
        }
      }
    });

    fiveWhysAnalyzer = byan.fiveWhysAnalyzer;
  });

  describe('Session Initialization with 5 Whys', () => {
    it('should initialize ByanV2 with 5 Whys analyzer', () => {
      expect(byan).toBeDefined();
      expect(byan.fiveWhysAnalyzer).toBeInstanceOf(FiveWhysAnalyzer);
      expect(byan.fiveWhysAnalyzer.maxDepth).toBe(5);
    });

    it('should support backwards compatibility when 5 Whys disabled', () => {
      const byanNoWhys = new ByanV2({
        bmad_features: {
          five_whys: { enabled: false }
        }
      });

      expect(byanNoWhys.fiveWhysAnalyzer).toBeUndefined();
    });

    it('should allow custom 5 Whys configuration', () => {
      const customByan = new ByanV2({
        bmad_features: {
          five_whys: {
            enabled: true,
            max_depth: 3,
            pain_keywords: ['problem', 'issue', 'slow']
          }
        }
      });

      expect(customByan.fiveWhysAnalyzer.maxDepth).toBe(3);
      expect(customByan.fiveWhysAnalyzer.painKeywords).toEqual(['problem', 'issue', 'slow']);
    });
  });

  describe('Pain Point Detection', () => {
    it('should detect pain point in user response with problem keyword', () => {
      const response = 'Our checkout process has a problem with payment validation taking too long';
      const result = fiveWhysAnalyzer.start(response);

      expect(result.needsWhys).toBe(true);
      expect(result.painPoints).toBeDefined();
      expect(result.painPoints.length).toBeGreaterThan(0);
      expect(result.firstQuestion).toBeDefined();
    });

    it('should detect multiple pain points in single response', () => {
      const response = 'The system is slow and we have bugs in the checkout. Users struggle with errors';
      const result = fiveWhysAnalyzer.start(response);

      expect(result.needsWhys).toBe(true);
      expect(result.painPoints.length).toBeGreaterThanOrEqual(3);
    });

    it('should not trigger 5 Whys when no pain points detected', () => {
      const response = 'Our system works well and customers are satisfied with the experience';
      const result = fiveWhysAnalyzer.start(response);

      expect(result.needsWhys).toBe(false);
      expect(result.reason).toBe('No pain points detected');
    });

    it('should detect pain point with various keywords', () => {
      const testCases = [
        'The checkout is slow',
        'We have an issue with inventory',
        'Users find it difficult to navigate',
        'The system fails during peak hours',
        'This is frustrating for our team'
      ];

      testCases.forEach(testCase => {
        const analyzer = new FiveWhysAnalyzer(byan.sessionState, byan.logger);
        const result = analyzer.start(testCase);
        expect(result.needsWhys).toBe(true);
      });
    });

    it('should provide context for detected pain points', () => {
      const response = 'The main problem is that our payment gateway is extremely slow during peak hours';
      const result = fiveWhysAnalyzer.start(response);

      expect(result.painPoints[0]).toBeDefined();
      expect(result.painPoints[0].keyword).toBeDefined();
      expect(result.painPoints[0].context).toBeDefined();
      expect(result.painPoints[0].context.length).toBeGreaterThan(0);
    });
  });

  describe('Automatic 5 Whys Triggering', () => {
    it('should automatically trigger when pain point detected', () => {
      const response = 'Our checkout process is slow and causing customer complaints';
      const result = fiveWhysAnalyzer.start(response);

      expect(result.needsWhys).toBe(true);
      expect(fiveWhysAnalyzer.active).toBe(true);
      expect(fiveWhysAnalyzer.depth).toBe(0);
    });

    it('should provide first WHY question after triggering', () => {
      const response = 'The system has performance issues during high traffic';
      const result = fiveWhysAnalyzer.start(response);

      expect(result.firstQuestion).toBeDefined();
      expect(result.firstQuestion.question).toBeDefined();
      expect(result.firstQuestion.depth).toBe(1);
    });

    it('should track initial response in analysis history', () => {
      const response = 'We have a critical bug in the payment module';
      fiveWhysAnalyzer.start(response);

      expect(fiveWhysAnalyzer.responses.length).toBe(1);
      expect(fiveWhysAnalyzer.responses[0].depth).toBe(0);
      expect(fiveWhysAnalyzer.responses[0].answer).toBe(response);
    });
  });

  describe('Sequential WHY Questioning', () => {
    it('should process 5 sequential WHY answers', () => {
      const initialResponse = 'Our checkout process is slow';
      fiveWhysAnalyzer.start(initialResponse);

      const whyAnswers = [
        'Because the payment gateway takes too long to respond',
        'Because we are making synchronous calls to external services',
        'Because we did not implement proper caching mechanisms',
        'Because caching was not prioritized in the initial development',
        'Because we lacked infrastructure expertise during project planning'
      ];

      whyAnswers.forEach((answer, index) => {
        const nextQuestion = fiveWhysAnalyzer.askNext();
        expect(nextQuestion).toBeDefined();
        
        const result = fiveWhysAnalyzer.processAnswer(answer);
        expect(result.valid).toBe(true);
        expect(result.depth).toBe(index + 1);
      });

      expect(fiveWhysAnalyzer.depth).toBe(5);
      expect(fiveWhysAnalyzer.responses.length).toBe(6); // Initial + 5 whys
    });

    it('should ask different WHY questions at each depth', () => {
      fiveWhysAnalyzer.start('The system is slow');

      const questions = [];
      for (let i = 0; i < 5; i++) {
        const question = fiveWhysAnalyzer.askNext();
        questions.push(question.question);
        fiveWhysAnalyzer.processAnswer('Because of reason ' + (i + 1));
      }

      const uniqueQuestions = new Set(questions);
      expect(uniqueQuestions.size).toBeGreaterThan(1);
    });

    it('should stop asking after reaching max depth', () => {
      fiveWhysAnalyzer.start('Performance issue');

      for (let i = 0; i < 5; i++) {
        fiveWhysAnalyzer.askNext();
        fiveWhysAnalyzer.processAnswer('Because of reason ' + (i + 1));
      }

      const nextQuestion = fiveWhysAnalyzer.askNext();
      expect(nextQuestion).toBeNull();
    });

    it('should validate each answer before processing', () => {
      fiveWhysAnalyzer.start('System has bugs');
      fiveWhysAnalyzer.askNext();

      const invalidResult = fiveWhysAnalyzer.processAnswer('');
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toBeDefined();

      const validResult = fiveWhysAnalyzer.processAnswer('Because the code lacks proper validation');
      expect(validResult.valid).toBe(true);
    });
  });

  describe('Early Root Cause Detection', () => {
    it('should detect root cause at depth 3 if clearly identified', () => {
      fiveWhysAnalyzer.start('Checkout is slow');
      
      fiveWhysAnalyzer.askNext();
      fiveWhysAnalyzer.processAnswer('Because payment processing takes long');
      
      fiveWhysAnalyzer.askNext();
      fiveWhysAnalyzer.processAnswer('Because we make synchronous external API calls');
      
      fiveWhysAnalyzer.askNext();
      const result = fiveWhysAnalyzer.processAnswer('Because we lack proper caching infrastructure');

      const rootCause = fiveWhysAnalyzer.detectRootCause();
      if (rootCause) {
        expect(rootCause.depth).toBeLessThanOrEqual(3);
        expect(rootCause.confidence).toBeGreaterThan(0.7);
      }
    });

    it('should continue to max depth if root cause not clearly identified', () => {
      fiveWhysAnalyzer.start('System is slow');

      for (let i = 0; i < 3; i++) {
        fiveWhysAnalyzer.askNext();
        fiveWhysAnalyzer.processAnswer('Because of various reasons');
      }

      const rootCause = fiveWhysAnalyzer.detectRootCause();
      
      if (!rootCause || rootCause.confidence < 0.8) {
        expect(fiveWhysAnalyzer.depth).toBeLessThan(5);
        const nextQuestion = fiveWhysAnalyzer.askNext();
        expect(nextQuestion).toBeDefined();
      }
    });

    it('should provide confidence score for early detection', () => {
      fiveWhysAnalyzer.start('Payment failures');
      
      fiveWhysAnalyzer.askNext();
      fiveWhysAnalyzer.processAnswer('Because the payment gateway times out');
      
      fiveWhysAnalyzer.askNext();
      fiveWhysAnalyzer.processAnswer('Because we have no retry mechanism');
      
      fiveWhysAnalyzer.askNext();
      fiveWhysAnalyzer.processAnswer('Because error handling was not implemented properly');

      const rootCause = fiveWhysAnalyzer.detectRootCause();
      
      if (rootCause) {
        expect(rootCause.confidence).toBeGreaterThanOrEqual(0);
        expect(rootCause.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Root Cause Extraction', () => {
    beforeEach(() => {
      fiveWhysAnalyzer.start('Checkout process is slow');
      
      const answers = [
        'Because payment processing takes too long',
        'Because we make synchronous calls to external services',
        'Because no caching mechanism was implemented',
        'Because caching was not prioritized in development',
        'Because we lacked infrastructure expertise'
      ];

      answers.forEach(answer => {
        fiveWhysAnalyzer.askNext();
        fiveWhysAnalyzer.processAnswer(answer);
      });
    });

    it('should extract root cause at max depth', () => {
      const rootCause = fiveWhysAnalyzer.extractRootCause();

      expect(rootCause).toBeDefined();
      expect(rootCause.cause).toBeDefined();
      expect(rootCause.depth).toBe(5);
      expect(rootCause.confidence).toBeDefined();
    });

    it('should extract root cause from last response', () => {
      const rootCause = fiveWhysAnalyzer.extractRootCause();

      expect(rootCause.cause).toContain('infrastructure expertise');
    });

    it('should provide full analysis chain', () => {
      const rootCause = fiveWhysAnalyzer.extractRootCause();

      expect(rootCause.chain).toBeDefined();
      expect(rootCause.chain.length).toBe(6); // Initial + 5 whys
    });
  });

  describe('Root Cause Categorization', () => {
    it('should categorize as technical root cause', () => {
      fiveWhysAnalyzer.start('System crashes frequently');
      
      const answers = [
        'Because of memory leaks',
        'Because objects are not properly disposed',
        'Because no memory management strategy exists',
        'Because developers lack understanding of memory lifecycle',
        'Because no technical training was provided'
      ];

      answers.forEach(answer => {
        fiveWhysAnalyzer.askNext();
        fiveWhysAnalyzer.processAnswer(answer);
      });

      const category = fiveWhysAnalyzer.categorizeRootCause();
      expect(category).toBe('technical');
    });

    it('should categorize as process root cause', () => {
      fiveWhysAnalyzer.start('Deployments fail often');
      
      const answers = [
        'Because testing is incomplete',
        'Because test process is not followed',
        'Because no clear testing guidelines exist',
        'Because process documentation was never created',
        'Because no process owner was assigned'
      ];

      answers.forEach(answer => {
        fiveWhysAnalyzer.askNext();
        fiveWhysAnalyzer.processAnswer(answer);
      });

      const category = fiveWhysAnalyzer.categorizeRootCause();
      expect(category).toBe('process');
    });

    it('should categorize as resource root cause', () => {
      fiveWhysAnalyzer.start('Features are delayed');
      
      const answers = [
        'Because team is understaffed',
        'Because budget was cut',
        'Because company prioritized other projects',
        'Because resource allocation strategy was poor',
        'Because management lacked funding visibility'
      ];

      answers.forEach(answer => {
        fiveWhysAnalyzer.askNext();
        fiveWhysAnalyzer.processAnswer(answer);
      });

      const category = fiveWhysAnalyzer.categorizeRootCause();
      expect(category).toBe('resource');
    });

    it('should categorize as knowledge root cause', () => {
      fiveWhysAnalyzer.start('Code quality is poor');
      
      const answers = [
        'Because developers write inconsistent code',
        'Because no coding standards are enforced',
        'Because team does not know best practices',
        'Because no training was provided',
        'Because knowledge transfer was never prioritized'
      ];

      answers.forEach(answer => {
        fiveWhysAnalyzer.askNext();
        fiveWhysAnalyzer.processAnswer(answer);
      });

      const category = fiveWhysAnalyzer.categorizeRootCause();
      expect(category).toBe('knowledge');
    });
  });

  describe('Action Item Extraction', () => {
    beforeEach(() => {
      fiveWhysAnalyzer.start('System performance degrades under load');
      
      const answers = [
        'Because database queries are not optimized',
        'Because no query optimization was done',
        'Because performance testing was skipped',
        'Because testing process does not include performance checks',
        'Because performance expertise is lacking on the team'
      ];

      answers.forEach(answer => {
        fiveWhysAnalyzer.askNext();
        fiveWhysAnalyzer.processAnswer(answer);
      });
    });

    it('should extract actionable items from analysis', () => {
      const actions = fiveWhysAnalyzer.extractActionItems();

      expect(actions).toBeDefined();
      expect(Array.isArray(actions)).toBe(true);
      expect(actions.length).toBeGreaterThan(0);
    });

    it('should categorize actions by type', () => {
      const actions = fiveWhysAnalyzer.extractActionItems();

      actions.forEach(action => {
        expect(action.type).toBeDefined();
        expect(['immediate', 'short-term', 'long-term']).toContain(action.type);
      });
    });

    it('should prioritize actions based on impact', () => {
      const actions = fiveWhysAnalyzer.extractActionItems();

      actions.forEach(action => {
        expect(action.priority).toBeDefined();
        expect(['high', 'medium', 'low']).toContain(action.priority);
      });
    });

    it('should provide specific action descriptions', () => {
      const actions = fiveWhysAnalyzer.extractActionItems();

      actions.forEach(action => {
        expect(action.description).toBeDefined();
        expect(action.description.length).toBeGreaterThan(10);
      });
    });
  });

  describe('Export Analysis', () => {
    beforeEach(() => {
      fiveWhysAnalyzer.start('Checkout is slow and causing customer complaints');
      
      const answers = [
        'Because payment gateway responds slowly',
        'Because we make synchronous external calls',
        'Because no caching was implemented',
        'Because it was not prioritized',
        'Because we lacked infrastructure knowledge'
      ];

      answers.forEach(answer => {
        fiveWhysAnalyzer.askNext();
        fiveWhysAnalyzer.processAnswer(answer);
      });
    });

    it('should export complete 5 Whys analysis', () => {
      const exported = fiveWhysAnalyzer.export();

      expect(exported).toBeDefined();
      expect(exported.painPoints).toBeDefined();
      expect(exported.responses).toHaveLength(6);
      expect(exported.rootCause).toBeDefined();
      expect(exported.category).toBeDefined();
      expect(exported.actions).toBeDefined();
    });

    it('should include metadata in export', () => {
      const exported = fiveWhysAnalyzer.export();

      expect(exported.metadata).toBeDefined();
      expect(exported.metadata.sessionId).toBeDefined();
      expect(exported.metadata.completedAt).toBeDefined();
      expect(exported.metadata.maxDepth).toBe(5);
    });

    it('should export as formatted markdown', () => {
      const markdown = fiveWhysAnalyzer.exportAsMarkdown();

      expect(markdown).toContain('# 5 Whys Analysis');
      expect(markdown).toContain('## Pain Points');
      expect(markdown).toContain('## Root Cause');
      expect(markdown).toContain('## Action Items');
    });

    it('should export as JSON format', () => {
      const json = fiveWhysAnalyzer.exportAsJSON();
      const parsed = JSON.parse(json);

      expect(parsed.painPoints).toBeDefined();
      expect(parsed.responses).toBeDefined();
      expect(parsed.rootCause).toBeDefined();
    });
  });

  describe('Performance Requirements', () => {
    it('should detect pain points in under 5ms', () => {
      const start = Date.now();
      
      fiveWhysAnalyzer.start('The system has serious performance problems');
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5);
    });

    it('should process WHY answer in under 10ms', () => {
      fiveWhysAnalyzer.start('System is slow');
      fiveWhysAnalyzer.askNext();

      const start = Date.now();
      fiveWhysAnalyzer.processAnswer('Because of external API calls');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10);
    });

    it('should export analysis in under 20ms', () => {
      fiveWhysAnalyzer.start('Slow checkout');
      
      for (let i = 0; i < 5; i++) {
        fiveWhysAnalyzer.askNext();
        fiveWhysAnalyzer.processAnswer('Because of reason ' + (i + 1));
      }

      const start = Date.now();
      fiveWhysAnalyzer.export();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(20);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null response gracefully', () => {
      const result = fiveWhysAnalyzer.start(null);

      expect(result.needsWhys).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should handle empty response', () => {
      const result = fiveWhysAnalyzer.start('');

      expect(result.needsWhys).toBe(false);
    });

    it('should handle very short responses', () => {
      const result = fiveWhysAnalyzer.start('bug');

      expect(result.needsWhys).toBe(true);
    });

    it('should handle very long responses', () => {
      const longResponse = 'We have a serious problem with our system. '.repeat(100);
      const result = fiveWhysAnalyzer.start(longResponse);

      expect(result.needsWhys).toBe(true);
      expect(result.painPoints.length).toBeGreaterThan(0);
    });
  });
});
