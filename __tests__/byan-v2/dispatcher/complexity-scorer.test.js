const ComplexityScorer = require('../../../src/byan-v2/dispatcher/complexity-scorer');

describe('Complexity Scoring Algorithm', () => {
  let scorer;

  beforeEach(() => {
    scorer = new ComplexityScorer();
  });

  describe('AC1: Class exists with calculateComplexity method', () => {
    test('should create instance', () => {
      expect(scorer).toBeInstanceOf(ComplexityScorer);
    });

    test('should have calculateComplexity method', () => {
      expect(typeof scorer.calculateComplexity).toBe('function');
    });

    test('should return numeric score', () => {
      const score = scorer.calculateComplexity({ prompt: 'simple task', context: {} });
      expect(typeof score).toBe('number');
    });

    test('should return score between 0 and 100', () => {
      const score = scorer.calculateComplexity({ prompt: 'test', context: {} });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('AC2: Factor 1 - Token count (max 30 points)', () => {
    test('should score 0 for very short prompts (< 10 tokens)', () => {
      const task = { prompt: 'test', context: {} };
      const score = scorer.calculateComplexity(task);
      const tokenScore = scorer._calculateTokenScore(task.prompt);
      
      expect(tokenScore).toBe(0);
    });

    test('should score ~6 for medium-short prompts (~30 tokens)', () => {
      const prompt = Array(30).fill('word').join(' ');
      const tokenScore = scorer._calculateTokenScore(prompt);
      
      expect(tokenScore).toBeGreaterThanOrEqual(3);
      expect(tokenScore).toBeLessThanOrEqual(7);
    });

    test('should score 30 for very long prompts (> 200 tokens)', () => {
      const longPrompt = Array(250).fill('word').join(' ');
      const tokenScore = scorer._calculateTokenScore(longPrompt);
      
      expect(tokenScore).toBe(30);
    });

    test('should scale linearly between thresholds', () => {
      const prompt20 = Array(20).fill('word').join(' ');
      const prompt100 = Array(100).fill('word').join(' ');
      
      const score20 = scorer._calculateTokenScore(prompt20);
      const score100 = scorer._calculateTokenScore(prompt100);
      
      expect(score100).toBeGreaterThan(score20);
    });
  });

  describe('AC3: Factor 2 - Task type (max 80 points)', () => {
    test('should score low (10-20) for simple exploration tasks', () => {
      const task = { prompt: 'explore the codebase and list files', context: {}, type: 'exploration' };
      const typeScore = scorer._calculateTaskTypeScore(task);
      
      expect(typeScore).toBeGreaterThanOrEqual(10);
      expect(typeScore).toBeLessThanOrEqual(20);
    });

    test('should score medium (40-50) for implementation tasks', () => {
      const task = { prompt: 'implement a new feature', context: {}, type: 'implementation' };
      const typeScore = scorer._calculateTaskTypeScore(task);
      
      expect(typeScore).toBeGreaterThanOrEqual(40);
      expect(typeScore).toBeLessThanOrEqual(50);
    });

    test('should score high (70-80) for analysis/design tasks', () => {
      const task = { prompt: 'analyze architecture and propose design', context: {}, type: 'analysis' };
      const typeScore = scorer._calculateTaskTypeScore(task);
      
      expect(typeScore).toBeGreaterThanOrEqual(70);
      expect(typeScore).toBeLessThanOrEqual(80);
    });

    test('should infer type from keywords if not specified', () => {
      const exploreTask = { prompt: 'search for authentication logic', context: {} };
      const implementTask = { prompt: 'create a new API endpoint', context: {} };
      
      const exploreScore = scorer._calculateTaskTypeScore(exploreTask);
      const implementScore = scorer._calculateTaskTypeScore(implementTask);
      
      expect(exploreScore).toBeLessThan(implementScore);
    });

    test('should recognize analysis keywords', () => {
      const keywords = ['analyze', 'design', 'architect', 'evaluate', 'review'];
      
      keywords.forEach(keyword => {
        const task = { prompt: `${keyword} the system`, context: {} };
        const score = scorer._calculateTaskTypeScore(task);
        expect(score).toBeGreaterThan(60);
      });
    });
  });

  describe('AC4: Factor 3 - Context size (max 20 points)', () => {
    test('should score 0 for empty context', () => {
      const task = { prompt: 'test', context: {} };
      const contextScore = scorer._calculateContextScore(task.context);
      
      expect(contextScore).toBe(0);
    });

    test('should score 5-10 for small context (few properties)', () => {
      const task = { 
        prompt: 'test', 
        context: { 
          projectRoot: '/home/user/project',
          userName: 'test'
        } 
      };
      const contextScore = scorer._calculateContextScore(task.context);
      
      expect(contextScore).toBeGreaterThanOrEqual(5);
      expect(contextScore).toBeLessThanOrEqual(10);
    });

    test('should score 15-20 for large context (many properties)', () => {
      const task = { 
        prompt: 'test', 
        context: { 
          projectRoot: '/home/user/project',
          userName: 'test',
          questionHistory: Array(10).fill({ question: 'q', answer: 'a' }),
          userResponses: Array(5).fill({ response: 'r' }),
          analysisResults: { data: 'complex' },
          gitBranch: 'main',
          workingDir: '/home/user/project',
          previousContext: { nested: { data: 'here' } }
        } 
      };
      const contextScore = scorer._calculateContextScore(task.context);
      
      expect(contextScore).toBeGreaterThanOrEqual(15);
      expect(contextScore).toBeLessThanOrEqual(20);
    });

    test('should consider nested object complexity', () => {
      const flatContext = { a: 1, b: 2, c: 3 };
      const nestedContext = { 
        a: { b: { c: { d: 'deep' } } },
        x: { y: { z: 'nested' } }
      };
      
      const flatScore = scorer._calculateContextScore(flatContext);
      const nestedScore = scorer._calculateContextScore(nestedContext);
      
      expect(nestedScore).toBeGreaterThanOrEqual(flatScore);
    });
  });

  describe('AC5: Factor 4 - Keywords (max 25 points)', () => {
    test('should score 0 for no special keywords', () => {
      const task = { prompt: 'do something normal here', context: {} };
      const keywordScore = scorer._calculateKeywordScore(task.prompt);
      
      expect(keywordScore).toBe(0);
    });

    test('should score 5-10 for simple keywords', () => {
      const simpleKeywords = ['list', 'show', 'find', 'get', 'read'];
      
      simpleKeywords.forEach(keyword => {
        const task = { prompt: `${keyword} the files`, context: {} };
        const score = scorer._calculateKeywordScore(task.prompt);
        expect(score).toBeGreaterThanOrEqual(5);
        expect(score).toBeLessThanOrEqual(10);
      });
    });

    test('should score 15-20 for complex keywords', () => {
      const complexKeywords = ['refactor', 'optimize', 'implement', 'integrate'];
      
      complexKeywords.forEach(keyword => {
        const task = { prompt: `${keyword} the module`, context: {} };
        const score = scorer._calculateKeywordScore(task.prompt);
        expect(score).toBeGreaterThanOrEqual(15);
        expect(score).toBeLessThanOrEqual(20);
      });
    });

    test('should score 25 for critical keywords', () => {
      const criticalKeywords = ['security', 'performance', 'architecture', 'scalability'];
      
      criticalKeywords.forEach(keyword => {
        const task = { prompt: `review ${keyword} implications`, context: {} };
        const score = scorer._calculateKeywordScore(task.prompt);
        expect(score).toBe(25);
      });
    });

    test('should accumulate scores for multiple keywords', () => {
      const task = { prompt: 'refactor and optimize for security', context: {} };
      const score = scorer._calculateKeywordScore(task.prompt);
      
      expect(score).toBeGreaterThan(20);
      expect(score).toBeLessThanOrEqual(25);
    });
  });

  describe('AC6: Combined scoring logic', () => {
    test('should combine all factors correctly', () => {
      const task = {
        prompt: 'simple exploration',
        context: {},
        type: 'exploration'
      };
      
      const score = scorer.calculateComplexity(task);
      
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(50);
    });

    test('should cap total score at 100', () => {
      const task = {
        prompt: Array(300).fill('critical security architecture performance scalability refactor optimize').join(' '),
        context: {
          massive: Array(100).fill({ nested: { data: 'complex' } }),
          projectRoot: '/path',
          userName: 'user',
          questionHistory: Array(50).fill({ q: 'question' }),
          userResponses: Array(50).fill({ r: 'response' })
        },
        type: 'analysis'
      };
      
      const score = scorer.calculateComplexity(task);
      
      expect(score).toBeLessThanOrEqual(100);
    });

    test('should return consistent scores for same input', () => {
      const task = { prompt: 'test consistent scoring', context: { a: 1 } };
      
      const score1 = scorer.calculateComplexity(task);
      const score2 = scorer.calculateComplexity(task);
      
      expect(score1).toBe(score2);
    });
  });

  describe('AC7: Real-world scenarios', () => {
    test('scenario: simple file exploration (should be < 30)', () => {
      const task = {
        prompt: 'list all JavaScript files in src directory',
        context: { projectRoot: '/home/user/project' }
      };
      
      const score = scorer.calculateComplexity(task);
      
      expect(score).toBeLessThan(30);
    });

    test('scenario: medium code implementation (should be 45-70)', () => {
      const task = {
        prompt: 'implement a new authentication middleware that validates JWT tokens and checks user permissions',
        context: {
          projectRoot: '/home/user/project',
          userName: 'yan',
          currentFile: 'src/middleware/auth.js'
        }
      };
      
      const score = scorer.calculateComplexity(task);
      
      // This is implementation task (45) + moderate context (7) + implement keyword (17) = ~69
      expect(score).toBeGreaterThanOrEqual(45);
      expect(score).toBeLessThan(75);
    });

    test('scenario: complex architecture analysis (should be >= 60)', () => {
      const task = {
        prompt: 'analyze the current microservices architecture, evaluate security vulnerabilities, and propose a scalable refactoring strategy with performance optimizations',
        context: {
          projectRoot: '/home/user/project',
          userName: 'yan',
          questionHistory: Array(15).fill({ question: 'q', answer: 'a' }),
          userResponses: Array(10).fill({ response: 'detailed' }),
          analysisResults: { complexity: 'high', issues: ['security', 'performance'] }
        }
      };
      
      const score = scorer.calculateComplexity(task);
      
      expect(score).toBeGreaterThanOrEqual(60);
    });

    test('scenario: BYAN interview question (should be 70-95)', () => {
      const task = {
        prompt: 'Based on user response about project type, analyze whether they need a general-purpose agent or a specialist agent',
        context: {
          questionHistory: [
            { question: 'What type of project?', timestamp: Date.now() },
            { question: 'What is the main goal?', timestamp: Date.now() }
          ],
          userResponses: [
            { questionId: 'q1', response: 'Web application', timestamp: Date.now() },
            { questionId: 'q2', response: 'E-commerce platform', timestamp: Date.now() }
          ]
        }
      };
      
      const score = scorer.calculateComplexity(task);
      
      // This is analysis (75) + large context (15-20) = 90-95
      expect(score).toBeGreaterThanOrEqual(70);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('Edge cases', () => {
    test('should handle null prompt', () => {
      const task = { prompt: null, context: {} };
      
      expect(() => scorer.calculateComplexity(task)).toThrow('prompt is required');
    });

    test('should handle undefined context', () => {
      const task = { prompt: 'test' };
      const score = scorer.calculateComplexity(task);
      
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    test('should handle empty string prompt', () => {
      const task = { prompt: '', context: {} };
      
      expect(() => scorer.calculateComplexity(task)).toThrow('prompt is required');
    });

    test('should handle circular references in context', () => {
      const circular = { a: 1 };
      circular.self = circular;
      
      const task = { prompt: 'test', context: circular };
      
      expect(() => scorer.calculateComplexity(task)).not.toThrow();
    });
  });
});
