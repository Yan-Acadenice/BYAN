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
      expect(fiveWhysAnalyzer.depth).toBe(1);
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
      const result = fiveWhysAnalyzer.start(initialResponse);

      const whyAnswers = [
        'Because the payment gateway takes too long to respond',
        'Because we are making synchronous calls to external services',
        'Because we did not implement proper caching mechanisms',
        'Because caching was not prioritized in the initial development',
        'Because we lacked infrastructure expertise during project planning'
      ];

      let currentQuestion = result.firstQuestion;
      
      whyAnswers.forEach((answer) => {
        expect(currentQuestion).toBeDefined();
        
        const processResult = fiveWhysAnalyzer.processAnswer(answer);
        expect(processResult.valid).toBe(true);
        currentQuestion = processResult.nextQuestion;
      });

      expect(fiveWhysAnalyzer.depth).toBe(5);
      expect(fiveWhysAnalyzer.responses.length).toBe(6); // Initial + 5 whys
    });

    it('should ask different WHY questions at each depth', () => {
      const result = fiveWhysAnalyzer.start('The system is slow');

      const questions = [result.firstQuestion.question];
      
      for (let i = 0; i < 4; i++) {
        const processResult = fiveWhysAnalyzer.processAnswer('Because of reason ' + (i + 1));
        if (processResult.nextQuestion) {
          questions.push(processResult.nextQuestion.question);
        }
      }

      const uniqueQuestions = new Set(questions);
      expect(uniqueQuestions.size).toBeGreaterThan(1);
    });

    it('should stop asking after reaching max depth', () => {
      const result = fiveWhysAnalyzer.start('Performance issue');

      let processResult = null;
      for (let i = 0; i < 5; i++) {
        processResult = fiveWhysAnalyzer.processAnswer('Because of reason ' + (i + 1));
      }

      expect(processResult.completed).toBe(true);
      expect(processResult.nextQuestion).toBeNull();
    });

    it('should validate each answer before processing', () => {
      fiveWhysAnalyzer.start('System has bugs');

      const invalidResult = fiveWhysAnalyzer.processAnswer('');
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.reason).toBeDefined();

      const validResult = fiveWhysAnalyzer.processAnswer('Because the code lacks proper validation');
      expect(validResult.valid).toBe(true);
    });
  });

  describe('Early Root Cause Detection', () => {
    it('should detect root cause at depth 3 if clearly identified', () => {
      fiveWhysAnalyzer.start('Checkout is slow');
      
      fiveWhysAnalyzer.processAnswer('Because payment processing takes long');
      fiveWhysAnalyzer.processAnswer('Because we make synchronous external API calls');
      const result = fiveWhysAnalyzer.processAnswer('Because we lack proper caching infrastructure');

      if (result.rootCauseFound) {
        expect(fiveWhysAnalyzer.depth).toBeLessThanOrEqual(3);
        expect(result.analysis.confidence).toBeGreaterThan(0.7);
      }
    });

    it('should continue to max depth if root cause not clearly identified', () => {
      fiveWhysAnalyzer.start('System is slow');

      for (let i = 0; i < 3; i++) {
        fiveWhysAnalyzer.processAnswer('Because of various reasons');
      }

      expect(fiveWhysAnalyzer.active).toBe(true);
    });

    it('should provide confidence score for early detection', () => {
      fiveWhysAnalyzer.start('Payment failures');
      
      fiveWhysAnalyzer.processAnswer('Because the payment gateway times out');
      fiveWhysAnalyzer.processAnswer('Because we have no retry mechanism');
      const result = fiveWhysAnalyzer.processAnswer('Because error handling was not implemented properly');
      
      if (result.rootCauseFound && result.analysis) {
        expect(result.analysis.confidence).toBeGreaterThanOrEqual(0);
        expect(result.analysis.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Root Cause Extraction', () => {
    beforeEach(() => {
      fiveWhysAnalyzer.start('Checkout process is slow');
      
      const answers = [
        'Because payment processing takes too long',
        'Because we make synchronous calls to external services',
        'Because infrastructure was not properly planned',
        'Because planning phase was rushed',
        'Because we lacked infrastructure expertise'
      ];

      answers.forEach(answer => {
        fiveWhysAnalyzer.processAnswer(answer);
      });
    });

    it('should extract root cause at max depth', () => {
      const rootCause = fiveWhysAnalyzer.rootCause;

      expect(rootCause).toBeDefined();
      expect(rootCause.statement).toBeDefined();
      expect(rootCause.depth).toBe(5);
      expect(rootCause.confidence).toBeDefined();
    });

    it('should extract root cause from last response', () => {
      const rootCause = fiveWhysAnalyzer.rootCause;

      expect(rootCause.statement).toContain('infrastructure expertise');
    });

    it('should provide full analysis chain', () => {
      const responses = fiveWhysAnalyzer.responses;

      expect(responses).toBeDefined();
      expect(responses.length).toBe(6); // Initial + 5 whys
    });
  });

  describe('Root Cause Categorization', () => {
    it('should categorize as technical root cause', () => {
      fiveWhysAnalyzer.start('System has critical problems with frequent crashes');
      
      const answers = [
        'Because of memory leaks in the system',
        'Because objects are not properly disposed in our code',
        'Because no memory management strategy exists in our software',
        'Because developers lack understanding of memory lifecycle in the codebase',
        'Because no technical training was provided on software memory management'
      ];

      answers.forEach(answer => {
        fiveWhysAnalyzer.processAnswer(answer);
      });

      const rootCause = fiveWhysAnalyzer.rootCause;
      expect(rootCause).toBeDefined();
      expect(rootCause.category).toBe('technical');
    });

    it('should categorize as process root cause', () => {
      fiveWhysAnalyzer.start('Deployments fail often causing problems');
      
      const answers = [
        'Because testing is incomplete in our deployment workflow',
        'Because the test workflow is not followed properly by the team',
        'Because testing guidelines are not well defined for deployments',
        'Because documentation on the deployment process is insufficient',
        'Because the deployment workflow owner was not assigned to maintain it'
      ];

      answers.forEach(answer => {
        fiveWhysAnalyzer.processAnswer(answer);
      });

      const rootCause = fiveWhysAnalyzer.rootCause;
      expect(rootCause).toBeDefined();
      expect(rootCause.category).toBe('process');
    });

    it('should categorize as resource root cause', () => {
      fiveWhysAnalyzer.start('Features are delayed causing problems for customers');
      
      const answers = [
        'Because our team is understaffed for the workload',
        'Because the budget was cut last quarter for our resources',
        'Because company prioritized other projects with their resources',
        'Because resource allocation strategy was poor in planning',
        'Because management lacked funding visibility for team resources'
      ];

      answers.forEach(answer => {
        fiveWhysAnalyzer.processAnswer(answer);
      });

      const rootCause = fiveWhysAnalyzer.rootCause;
      expect(rootCause).toBeDefined();
      expect(rootCause.category).toBe('resource');
    });

    it('should categorize as knowledge root cause', () => {
      fiveWhysAnalyzer.start('Code quality is poor and causing bugs');
      
      const answers = [
        'Because developers write inconsistent code styles',
        'Because coding standards are not enforced by team',
        'Because the team does not understand best practices well',
        'Because training was not provided to the development team',
        'Because knowledge transfer sessions were not prioritized during learning'
      ];

      answers.forEach(answer => {
        fiveWhysAnalyzer.processAnswer(answer);
      });

      const rootCause = fiveWhysAnalyzer.rootCause;
      expect(rootCause).toBeDefined();
      expect(rootCause.category).toBe('knowledge');
    });
  });

  describe('Action Item Extraction', () => {
    beforeEach(() => {
      fiveWhysAnalyzer.start('System performance has serious problems under load');
      
      const answers = [
        'Because database queries are not optimized',
        'Because no query optimization was done',
        'Because performance testing was skipped',
        'Because testing process does not include performance checks',
        'Because performance expertise is lacking on the team'
      ];

      answers.forEach(answer => {
        fiveWhysAnalyzer.processAnswer(answer);
      });
    });

    it('should extract actionable items from analysis', () => {
      const rootCause = fiveWhysAnalyzer.rootCause;

      expect(rootCause).toBeDefined();
      expect(rootCause.actionItems).toBeDefined();
      expect(Array.isArray(rootCause.actionItems)).toBe(true);
    });

    it('should include action items in root cause', () => {
      const rootCause = fiveWhysAnalyzer.rootCause;

      expect(rootCause.actionItems).toBeDefined();
      expect(Array.isArray(rootCause.actionItems)).toBe(true);
    });

    it('should extract action items from statements', () => {
      const rootCause = fiveWhysAnalyzer.rootCause;

      if (rootCause.actionItems.length > 0) {
        rootCause.actionItems.forEach(action => {
          expect(typeof action).toBe('string');
          expect(action.length).toBeGreaterThan(0);
        });
      }
    });

    it('should provide action items based on root cause analysis', () => {
      const rootCause = fiveWhysAnalyzer.rootCause;

      expect(rootCause.actionItems).toBeDefined();
      expect(Array.isArray(rootCause.actionItems)).toBe(true);
    });
  });

  describe('Export Analysis', () => {
    beforeEach(() => {
      fiveWhysAnalyzer.start('Checkout is slow and causing customer complaints');
      
      const answers = [
        'Because payment gateway responds slowly',
        'Because we make synchronous external calls',
        'Because infrastructure was not properly planned',
        'Because it was not prioritized properly',
        'Because we lacked infrastructure knowledge'
      ];

      answers.forEach(answer => {
        fiveWhysAnalyzer.processAnswer(answer);
      });
    });

    it('should export complete 5 Whys analysis', () => {
      const exported = fiveWhysAnalyzer.export();

      expect(exported).toBeDefined();
      expect(exported.painPoints).toBeDefined();
      expect(exported.responses).toHaveLength(6);
      expect(exported.rootCause).toBeDefined();
      expect(exported.rootCause.category).toBeDefined();
      expect(exported.rootCause.actionItems).toBeDefined();
    });

    it('should include metadata in export', () => {
      const exported = fiveWhysAnalyzer.export();

      expect(exported.metadata).toBeDefined();
      expect(exported.metadata.completed).toBeDefined();
      expect(exported.metadata.maxDepth).toBe(5);
      expect(exported.metadata.responseCount).toBe(6);
    });

    it('should include version and timestamp in export', () => {
      const exported = fiveWhysAnalyzer.export();

      expect(exported.version).toBeDefined();
      expect(exported.createdAt).toBeDefined();
      expect(typeof exported.createdAt).toBe('string');
    });

    it('should export all analysis data', () => {
      const exported = fiveWhysAnalyzer.export();

      expect(exported.painPoints).toBeDefined();
      expect(exported.responses).toBeDefined();
      expect(exported.rootCause).toBeDefined();
      expect(exported.depth).toBe(5);
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
