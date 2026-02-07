/**
 * ActiveListener Tests
 * 
 * Coverage: Reformulation, key points, summaries, validation, edge cases
 * Target: > 90% coverage, < 100ms performance
 */

const ActiveListener = require('../../../src/byan-v2/orchestrator/active-listener');
const Logger = require('../../../src/byan-v2/observability/logger');

describe('ActiveListener', () => {
  let listener;
  let mockSessionState;
  let mockLogger;

  beforeEach(() => {
    mockSessionState = {
      data: {},
      save: jest.fn(),
      load: jest.fn()
    };
    
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    listener = new ActiveListener(mockSessionState, mockLogger);
  });

  describe('constructor', () => {
    it('should initialize with session state and logger', () => {
      expect(listener.sessionState).toBe(mockSessionState);
      expect(listener.logger).toBe(mockLogger);
      expect(listener.history).toEqual([]);
      expect(listener.responseCount).toBe(0);
    });

    it('should create default logger if none provided', () => {
      const listenerWithDefaultLogger = new ActiveListener(mockSessionState);
      expect(listenerWithDefaultLogger.logger).toBeInstanceOf(Logger);
    });

    it('should set validation frequency to 3', () => {
      expect(listener.validationFrequency).toBe(3);
    });

    it('should initialize filler words list', () => {
      expect(listener.fillerWords).toContain('um');
      expect(listener.fillerWords).toContain('like');
      expect(listener.fillerWords).toContain('you know');
    });
  });

  describe('listen', () => {
    it('should process valid user response successfully', () => {
      const response = 'I need a system to manage customer orders';
      const result = listener.listen(response);

      expect(result.valid).toBe(true);
      expect(result.reformulated).toBeDefined();
      expect(result.clarityScore).toBeGreaterThanOrEqual(0.0);
      expect(result.clarityScore).toBeLessThanOrEqual(1.0);
      expect(result.keyPoints).toBeInstanceOf(Array);
      expect(result.summary).toContain('So if I understand correctly');
      expect(result.needsValidation).toBe(false); // First response
      expect(result.processingTime).toBeDefined();
    });

    it('should process response in under 100ms', () => {
      const response = 'I need a system to manage customer orders with inventory tracking';
      const result = listener.listen(response);

      expect(result.processingTime).toBeLessThan(100);
    });

    it('should reject null input', () => {
      const result = listener.listen(null);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid input');
    });

    it('should reject undefined input', () => {
      const result = listener.listen(undefined);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid input');
    });

    it('should reject empty string', () => {
      const result = listener.listen('');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject whitespace-only string', () => {
      const result = listener.listen('   \n\t  ');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject non-string input', () => {
      const result = listener.listen(12345);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid input');
    });

    it('should increment response count', () => {
      listener.listen('First response');
      expect(listener.responseCount).toBe(1);
      
      listener.listen('Second response');
      expect(listener.responseCount).toBe(2);
    });

    it('should add to history', () => {
      listener.listen('Test response');
      
      expect(listener.history).toHaveLength(1);
      expect(listener.history[0].original).toBe('Test response');
      expect(listener.history[0].reformulated).toBeDefined();
      expect(listener.history[0].clarityScore).toBeDefined();
      expect(listener.history[0].keyPoints).toBeDefined();
      expect(listener.history[0].summary).toBeDefined();
      expect(listener.history[0].timestamp).toBeDefined();
    });

    it('should log processing info', () => {
      listener.listen('Test response');
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Processing user response',
        expect.objectContaining({ length: expect.any(Number) })
      );
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Response processed',
        expect.objectContaining({
          duration: expect.any(Number),
          clarityScore: expect.any(Number),
          keyPointsCount: expect.any(Number)
        })
      );
    });
  });

  describe('reformulate', () => {
    it('should return empty result for null input', () => {
      const result = listener.reformulate(null);
      
      expect(result.text).toBe('');
      expect(result.clarityScore).toBe(0.0);
    });

    it('should return empty result for non-string input', () => {
      const result = listener.reformulate(123);
      
      expect(result.text).toBe('');
      expect(result.clarityScore).toBe(0.0);
    });

    it('should remove filler words', () => {
      const text = 'Um, I think we need, like, a system, you know';
      const result = listener.reformulate(text);
      
      expect(result.text).not.toContain('Um');
      expect(result.text).not.toContain('like');
      expect(result.text).not.toContain('you know');
      expect(result.clarityScore).toBeGreaterThan(0);
    });

    it('should simplify complex sentences', () => {
      const text = 'In order to process orders due to the fact that customers need products';
      const result = listener.reformulate(text);
      
      expect(result.text).toContain('to process');
      expect(result.text).toContain('because');
    });

    it('should normalize whitespace', () => {
      const text = 'Text   with    multiple     spaces';
      const result = listener.reformulate(text);
      
      expect(result.text).not.toMatch(/\s{2,}/);
    });

    it('should remove redundancy', () => {
      const text = 'The system system should process process orders';
      const result = listener.reformulate(text);
      
      expect(result.text).toBe('The system should process orders');
    });

    it('should calculate clarity score between 0 and 1', () => {
      const text = 'Um, like, I really think we basically need a system, you know';
      const result = listener.reformulate(text);
      
      expect(result.clarityScore).toBeGreaterThanOrEqual(0.0);
      expect(result.clarityScore).toBeLessThanOrEqual(1.0);
    });

    it('should improve clarity for messy input', () => {
      const text = 'Um, well, I guess we kind of need, like, a system that is being used by customers';
      const result = listener.reformulate(text);
      
      expect(result.text.length).toBeLessThan(text.length);
      expect(result.clarityScore).toBeGreaterThan(0);
    });

    it('should handle already clean text', () => {
      const text = 'We need a system to manage customer orders.';
      const result = listener.reformulate(text);
      
      expect(result.text).toBe('We need a system to manage customer orders.');
      expect(result.clarityScore).toBeGreaterThanOrEqual(0);
    });

    it('should preserve important information', () => {
      const text = 'I need to track 500 orders per day with real-time inventory';
      const result = listener.reformulate(text);
      
      expect(result.text).toContain('500');
      expect(result.text).toContain('orders');
      expect(result.text).toContain('inventory');
    });
  });

  describe('extractKeyPoints', () => {
    it('should return empty array for null input', () => {
      const points = listener.extractKeyPoints(null);
      expect(points).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      const points = listener.extractKeyPoints('');
      expect(points).toEqual([]);
    });

    it('should extract single sentence', () => {
      const text = 'I need a customer management system.';
      const points = listener.extractKeyPoints(text);
      
      expect(points).toHaveLength(1);
      expect(points[0]).toContain('customer management system');
    });

    it('should extract multiple key points', () => {
      const text = 'I need a system to manage customers. It should track orders. It must generate reports. The system should be user-friendly. Performance is critical.';
      const points = listener.extractKeyPoints(text);
      
      expect(points.length).toBeGreaterThanOrEqual(3);
      expect(points.length).toBeLessThanOrEqual(5);
    });

    it('should limit to 5 key points maximum', () => {
      const text = 'One. Two. Three. Four. Five. Six. Seven. Eight. Nine. Ten.';
      const points = listener.extractKeyPoints(text);
      
      expect(points.length).toBeLessThanOrEqual(5);
    });

    it('should prioritize important sentences', () => {
      const text = 'Some detail. Critical requirement: must process 1000 orders. Another detail. Essential feature needed. More details.';
      const points = listener.extractKeyPoints(text);
      
      // Should include sentences with "Critical" and numbers
      const hasImportant = points.some(p => p.includes('Critical') || p.includes('1000'));
      expect(hasImportant).toBe(true);
    });

    it('should handle text without punctuation', () => {
      const text = 'no punctuation here just words';
      const points = listener.extractKeyPoints(text);
      
      expect(points.length).toBeGreaterThan(0);
    });

    it('should filter empty sentences', () => {
      const text = 'First sentence.. . . Second sentence.';
      const points = listener.extractKeyPoints(text);
      
      points.forEach(point => {
        expect(point.trim().length).toBeGreaterThan(0);
      });
    });

    it('should handle very short text', () => {
      const text = 'Short';
      const points = listener.extractKeyPoints(text);
      
      expect(points).toHaveLength(1);
    });

    it('should handle very long text', () => {
      const sentences = Array(20).fill('This is sentence number X.');
      const text = sentences.join(' ');
      const points = listener.extractKeyPoints(text);
      
      expect(points.length).toBeGreaterThanOrEqual(3);
      expect(points.length).toBeLessThanOrEqual(5);
    });
  });

  describe('generateSummary', () => {
    it('should generate summary for empty key points', () => {
      const summary = listener.generateSummary([]);
      
      expect(summary).toContain('So if I understand correctly');
      expect(summary).toContain('not provided enough information');
    });

    it('should generate summary for single key point', () => {
      const keyPoints = ['I need a customer management system'];
      const summary = listener.generateSummary(keyPoints);
      
      expect(summary).toContain('So if I understand correctly');
      expect(summary).toContain('customer management system');
      expect(summary).toContain('Is that accurate?');
    });

    it('should generate summary for two key points', () => {
      const keyPoints = [
        'I need a customer management system',
        'It should track orders'
      ];
      const summary = listener.generateSummary(keyPoints);
      
      expect(summary).toContain('So if I understand correctly');
      expect(summary).toContain('Additionally');
      expect(summary).toContain('Is that accurate?');
    });

    it('should generate summary for multiple key points', () => {
      const keyPoints = [
        'I need a customer management system',
        'It should track orders',
        'It must generate reports',
        'The system should be user-friendly'
      ];
      const summary = listener.generateSummary(keyPoints);
      
      expect(summary).toContain('So if I understand correctly');
      expect(summary).toContain('Finally');
      expect(summary).toContain('Is that accurate?');
    });

    it('should lowercase first letter when combining points', () => {
      const keyPoints = [
        'The system needs features',
        'The interface should be simple'
      ];
      const summary = listener.generateSummary(keyPoints);
      
      // Second point should be lowercased
      expect(summary).toMatch(/Additionally, the interface/);
    });

    it('should end with validation question', () => {
      const keyPoints = ['Some point'];
      const summary = listener.generateSummary(keyPoints);
      
      expect(summary).toContain('Is that accurate?');
    });

    it('should handle null input', () => {
      const summary = listener.generateSummary(null);
      
      expect(summary).toContain('So if I understand correctly');
    });

    it('should create cohesive narrative', () => {
      const keyPoints = [
        'We need order management',
        'We need inventory tracking',
        'We need customer portal'
      ];
      const summary = listener.generateSummary(keyPoints);
      
      expect(summary).toContain('order management');
      expect(summary).toContain('inventory tracking');
      expect(summary).toContain('customer portal');
    });
  });

  describe('needsValidation', () => {
    it('should return false for first response', () => {
      listener.responseCount = 1;
      expect(listener.needsValidation()).toBe(false);
    });

    it('should return false for second response', () => {
      listener.responseCount = 2;
      expect(listener.needsValidation()).toBe(false);
    });

    it('should return true for third response', () => {
      listener.responseCount = 3;
      expect(listener.needsValidation()).toBe(true);
    });

    it('should return true every 3 responses', () => {
      listener.responseCount = 6;
      expect(listener.needsValidation()).toBe(true);
      
      listener.responseCount = 9;
      expect(listener.needsValidation()).toBe(true);
    });

    it('should respect custom validation frequency', () => {
      listener.validationFrequency = 5;
      listener.responseCount = 5;
      expect(listener.needsValidation()).toBe(true);
      
      listener.responseCount = 10;
      expect(listener.needsValidation()).toBe(true);
    });
  });

  describe('validateUnderstanding', () => {
    beforeEach(() => {
      // Add a response to history
      listener.listen('Test response');
    });

    it('should accept boolean true', () => {
      const result = listener.validateUnderstanding(true);
      
      expect(result.confirmed).toBe(true);
      expect(result.timestamp).toBeDefined();
    });

    it('should accept boolean false', () => {
      const result = listener.validateUnderstanding(false);
      
      expect(result.confirmed).toBe(false);
    });

    it('should accept "yes" string', () => {
      const result = listener.validateUnderstanding('yes');
      expect(result.confirmed).toBe(true);
    });

    it('should accept "no" string', () => {
      const result = listener.validateUnderstanding('no');
      expect(result.confirmed).toBe(false);
    });

    it('should accept variations of yes', () => {
      expect(listener.validateUnderstanding('Yes').confirmed).toBe(true);
      expect(listener.validateUnderstanding('YES').confirmed).toBe(true);
      expect(listener.validateUnderstanding('y').confirmed).toBe(true);
      expect(listener.validateUnderstanding('yeah').confirmed).toBe(true);
      expect(listener.validateUnderstanding('yep').confirmed).toBe(true);
      expect(listener.validateUnderstanding('correct').confirmed).toBe(true);
      expect(listener.validateUnderstanding('right').confirmed).toBe(true);
    });

    it('should accept variations of no', () => {
      expect(listener.validateUnderstanding('No').confirmed).toBe(false);
      expect(listener.validateUnderstanding('NO').confirmed).toBe(false);
      expect(listener.validateUnderstanding('n').confirmed).toBe(false);
      expect(listener.validateUnderstanding('nope').confirmed).toBe(false);
      expect(listener.validateUnderstanding('wrong').confirmed).toBe(false);
    });

    it('should default to false for unclear input', () => {
      const result = listener.validateUnderstanding('maybe');
      expect(result.confirmed).toBe(false);
    });

    it('should update history with validation result', () => {
      listener.validateUnderstanding(true);
      
      const lastEntry = listener.history[listener.history.length - 1];
      expect(lastEntry.validationResult).toBeDefined();
      expect(lastEntry.validationResult.confirmed).toBe(true);
    });

    it('should log validation', () => {
      listener.validateUnderstanding(true);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Understanding validated',
        expect.objectContaining({ confirmed: true })
      );
    });

    it('should handle whitespace in input', () => {
      const result = listener.validateUnderstanding('  yes  ');
      expect(result.confirmed).toBe(true);
    });
  });

  describe('export', () => {
    it('should export empty session', () => {
      const exported = listener.export();
      
      expect(exported.totalResponses).toBe(0);
      expect(exported.history).toEqual([]);
      expect(exported.averageClarityScore).toBe(0.0);
      expect(exported.validationFrequency).toBe(3);
      expect(exported.exportTimestamp).toBeDefined();
    });

    it('should export session with history', () => {
      listener.listen('First response');
      listener.listen('Second response');
      
      const exported = listener.export();
      
      expect(exported.totalResponses).toBe(2);
      expect(exported.history).toHaveLength(2);
      expect(exported.averageClarityScore).toBeGreaterThanOrEqual(0);
    });

    it('should calculate average clarity score', () => {
      listener.listen('Um, like, messy response');
      listener.listen('Clean response');
      
      const exported = listener.export();
      
      expect(exported.averageClarityScore).toBeGreaterThanOrEqual(0);
      expect(exported.averageClarityScore).toBeLessThanOrEqual(1.0);
    });

    it('should include validation frequency', () => {
      const exported = listener.export();
      expect(exported.validationFrequency).toBe(3);
    });

    it('should include export timestamp', () => {
      const before = Date.now();
      const exported = listener.export();
      const after = Date.now();
      
      expect(exported.exportTimestamp).toBeGreaterThanOrEqual(before);
      expect(exported.exportTimestamp).toBeLessThanOrEqual(after);
    });

    it('should preserve complete history', () => {
      listener.listen('Test response');
      listener.validateUnderstanding(true);
      
      const exported = listener.export();
      
      expect(exported.history[0]).toHaveProperty('original');
      expect(exported.history[0]).toHaveProperty('reformulated');
      expect(exported.history[0]).toHaveProperty('clarityScore');
      expect(exported.history[0]).toHaveProperty('keyPoints');
      expect(exported.history[0]).toHaveProperty('summary');
      expect(exported.history[0]).toHaveProperty('timestamp');
      expect(exported.history[0]).toHaveProperty('validationResult');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete listening workflow', () => {
      // Response 1
      const result1 = listener.listen('Um, I think we need a system');
      expect(result1.valid).toBe(true);
      expect(result1.needsValidation).toBe(false);
      
      // Response 2
      const result2 = listener.listen('It should track orders, you know');
      expect(result2.valid).toBe(true);
      expect(result2.needsValidation).toBe(false);
      
      // Response 3 - triggers validation
      const result3 = listener.listen('And generate reports basically');
      expect(result3.valid).toBe(true);
      expect(result3.needsValidation).toBe(true);
      
      // Validate
      listener.validateUnderstanding(true);
      
      const exported = listener.export();
      expect(exported.totalResponses).toBe(3);
      expect(exported.history).toHaveLength(3);
    });

    it('should maintain clarity improvements over time', () => {
      const messyResponse = 'Um, like, I really think, you know, we basically need a system';
      const result1 = listener.listen(messyResponse);
      
      const cleanResponse = 'The system should manage customer orders efficiently';
      const result2 = listener.listen(cleanResponse);
      
      // Both should have valid clarity scores
      expect(result1.clarityScore).toBeGreaterThanOrEqual(0);
      expect(result2.clarityScore).toBeGreaterThanOrEqual(0);
      
      // Messier text should generally show more improvement (higher score)
      // But since we're measuring improvement, not cleanliness, this is expected
      expect(result1.clarityScore).toBeGreaterThan(0);
    });

    it('should handle mixed validation responses', () => {
      listener.listen('Response 1');
      listener.listen('Response 2');
      listener.listen('Response 3');
      listener.validateUnderstanding(true);
      
      listener.listen('Response 4');
      listener.listen('Response 5');
      listener.listen('Response 6');
      listener.validateUnderstanding(false);
      
      const history = listener.history;
      expect(history[2].validationResult.confirmed).toBe(true);
      expect(history[5].validationResult.confirmed).toBe(false);
    });

    it('should handle edge case: very long response', () => {
      const longResponse = Array(100).fill('I need a system to manage orders.').join(' ');
      const result = listener.listen(longResponse);
      
      expect(result.valid).toBe(true);
      expect(result.keyPoints.length).toBeLessThanOrEqual(5);
      expect(result.processingTime).toBeLessThan(100);
    });

    it('should handle edge case: single word response', () => {
      const result = listener.listen('Orders');
      
      expect(result.valid).toBe(true);
      expect(result.keyPoints).toHaveLength(1);
    });

    it('should maintain performance across multiple responses', () => {
      const times = [];
      
      for (let i = 0; i < 10; i++) {
        const result = listener.listen(`Response number ${i} with some details`);
        times.push(result.processingTime);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avgTime).toBeLessThan(100);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle response with only filler words', () => {
      const result = listener.listen('um uh like you know');
      
      expect(result.valid).toBe(true);
      expect(result.reformulated.length).toBeLessThan(20);
    });

    it('should handle response with special characters', () => {
      const result = listener.listen('I need @#$% system! Really? Yes!');
      
      expect(result.valid).toBe(true);
    });

    it('should handle response with numbers', () => {
      const result = listener.listen('Process 1000 orders per day at 99.9% uptime');
      
      expect(result.valid).toBe(true);
      expect(result.reformulated).toContain('1000');
      expect(result.reformulated).toContain('99.9');
    });

    it('should handle response with line breaks', () => {
      const result = listener.listen('Line 1\nLine 2\nLine 3');
      
      expect(result.valid).toBe(true);
    });

    it('should handle response with tabs', () => {
      const result = listener.listen('Column1\tColumn2\tColumn3');
      
      expect(result.valid).toBe(true);
    });

    it('should handle non-English characters', () => {
      const result = listener.listen('Système de gestion des commandes');
      
      expect(result.valid).toBe(true);
    });

    it('should handle maximum clarity score scenario', () => {
      const result = listener.listen('Clear and concise statement.');
      
      expect(result.clarityScore).toBeGreaterThanOrEqual(0);
      expect(result.clarityScore).toBeLessThanOrEqual(1.0);
    });
  });
});
