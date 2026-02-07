/**
 * Integration Tests: Active Listening Workflow
 * 
 * Tests the complete active listening workflow:
 * - Session initialization with active listening
 * - Processing user responses with reformulation
 * - Reformulation every 3rd response
 * - Generating understanding summaries
 * - Validating understanding (yes/no)
 * - Handling misunderstanding corrections
 * - Tracking listening history
 * - Export session data
 * 
 * Quality: KISS, DRY, SOLID
 * Performance: < 5s total execution, < 100ms per reformulation
 * Mantra IA-23: Zero emojis
 */

const ByanV2 = require('../../../src/byan-v2');
const ActiveListener = require('../../../src/byan-v2/orchestrator/active-listener');

describe('Active Listening Workflow Integration', () => {
  let byan;
  let activeListener;

  beforeEach(() => {
    byan = new ByanV2({
      sessionId: 'test-active-listening-flow',
      maxQuestions: 12,
      bmad_features: {
        active_listening: {
          enabled: true,
          reformulate_every: 3,
          clarity_threshold: 0.7
        }
      }
    });

    activeListener = byan.activeListener;
  });

  describe('Session Initialization with Active Listening', () => {
    it('should initialize ByanV2 with active listener', () => {
      expect(byan).toBeDefined();
      expect(byan.activeListener).toBeInstanceOf(ActiveListener);
      expect(byan.activeListener.validationFrequency).toBe(3);
    });

    it('should support backwards compatibility when active listening disabled', () => {
      const byanNoListener = new ByanV2({
        bmad_features: {
          active_listening: { enabled: false }
        }
      });

      expect(byanNoListener.activeListener).toBeUndefined();
    });

    it('should allow custom active listening configuration', () => {
      const customByan = new ByanV2({
        bmad_features: {
          active_listening: {
            enabled: true,
            reformulate_every: 2,
            clarity_threshold: 0.8
          }
        }
      });

      expect(customByan.activeListener.validationFrequency).toBe(2);
      expect(customByan.activeListener.clarityThresholdMax).toBe(1.0);
    });
  });

  describe('Processing User Responses', () => {
    it('should process valid user response successfully', () => {
      const response = 'I need an agent that can help customers find products quickly';
      const result = activeListener.listen(response);

      expect(result.valid).toBe(true);
      expect(result.reformulated).toBeDefined();
      expect(result.clarityScore).toBeGreaterThanOrEqual(0);
      expect(result.keyPoints).toBeDefined();
      expect(result.summary).toBeDefined();
    });

    it('should reject empty response', () => {
      const result = activeListener.listen('');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject null response', () => {
      const result = activeListener.listen(null);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid input');
    });

    it('should handle non-string input gracefully', () => {
      const result = activeListener.listen(123);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should track response count after each listen', () => {
      expect(activeListener.responseCount).toBe(0);

      activeListener.listen('First response about ecommerce platform');
      expect(activeListener.responseCount).toBe(1);

      activeListener.listen('Second response about product catalog');
      expect(activeListener.responseCount).toBe(2);
    });
  });

  describe('Reformulation Process', () => {
    it('should reformulate text removing filler words', () => {
      const response = 'Um, I think we need, like, an agent that can, you know, help with orders';
      const result = activeListener.listen(response);

      expect(result.reformulated).toBeDefined();
      expect(result.reformulated).not.toContain('um');
      expect(result.reformulated).not.toContain('like');
      expect(result.reformulated).not.toContain('you know');
    });

    it('should maintain core meaning during reformulation', () => {
      const response = 'The agent should handle customer inquiries about product availability and pricing';
      const result = activeListener.listen(response);

      expect(result.reformulated).toContain('customer');
      expect(result.reformulated).toContain('product');
    });

    it('should calculate clarity score for reformulated text', () => {
      const response = 'I need an agent for customer service and order tracking';
      const result = activeListener.listen(response);

      expect(result.clarityScore).toBeGreaterThanOrEqual(0);
      expect(result.clarityScore).toBeLessThanOrEqual(1);
    });

    it('should improve clarity through reformulation', () => {
      const vagueResponse = 'Um, basically we need something that does stuff with things';
      const result = activeListener.listen(vagueResponse);

      expect(result.reformulated.length).toBeLessThanOrEqual(vagueResponse.length);
      expect(result.clarityScore).toBeDefined();
    });
  });

  describe('Reformulation Every 3rd Response', () => {
    it('should flag for validation on 3rd response', () => {
      activeListener.listen('First response about the agent purpose');
      activeListener.listen('Second response about target users');
      const result = activeListener.listen('Third response about key features');

      expect(result.needsValidation).toBe(true);
    });

    it('should not flag validation before 3rd response', () => {
      const result1 = activeListener.listen('First response');
      expect(result1.needsValidation).toBe(false);

      const result2 = activeListener.listen('Second response');
      expect(result2.needsValidation).toBe(false);
    });

    it('should flag validation again on 6th response', () => {
      for (let i = 1; i <= 5; i++) {
        activeListener.listen(`Response number ${i}`);
      }

      const result = activeListener.listen('Sixth response');
      expect(result.needsValidation).toBe(true);
    });

    it('should use custom frequency when configured', () => {
      const customListener = new ActiveListener(byan.sessionState, byan.logger);
      customListener.validationFrequency = 2;

      customListener.listen('First response');
      const result = customListener.listen('Second response');

      expect(result.needsValidation).toBe(true);
    });
  });

  describe('Generating Understanding Summaries', () => {
    beforeEach(() => {
      activeListener.listen('I need an agent for ecommerce order management');
      activeListener.listen('It should help customers track their orders');
      activeListener.listen('And provide real-time delivery updates');
    });

    it('should generate summary with "So if I understand" format', () => {
      const summary = activeListener.generateConsolidatedSummary();

      expect(summary).toBeDefined();
      expect(summary).toContain('So if I understand');
      expect(summary.length).toBeGreaterThan(20);
    });

    it('should include key points from all responses', () => {
      const summary = activeListener.generateConsolidatedSummary();

      expect(summary).toContain('ecommerce');
      expect(summary).toContain('order');
      expect(summary).toContain('track');
    });

    it('should be concise and clear', () => {
      const summary = activeListener.generateConsolidatedSummary();

      expect(summary.split(' ').length).toBeLessThan(50);
      expect(summary).not.toContain('um');
      expect(summary).not.toContain('like');
    });

    it('should extract key points from responses', () => {
      const response = 'The agent needs to access the inventory database and provide real-time stock levels';
      const result = activeListener.listen(response);

      expect(result.keyPoints).toBeDefined();
      expect(result.keyPoints.length).toBeGreaterThan(0);
      expect(result.keyPoints.some(kp => kp.includes('inventory') || kp.includes('database'))).toBe(true);
    });
  });

  describe('Validating Understanding', () => {
    beforeEach(() => {
      activeListener.listen('I want an ecommerce agent');
      activeListener.listen('For order management');
      activeListener.listen('With inventory tracking');
    });

    it('should accept positive validation', () => {
      const summary = activeListener.generateConsolidatedSummary();
      const result = activeListener.validateUnderstanding('yes', summary);

      expect(result.validated).toBe(true);
      expect(result.needsCorrection).toBe(false);
    });

    it('should accept various positive responses', () => {
      const summary = activeListener.generateConsolidatedSummary();
      const positiveResponses = ['yes', 'correct', 'exactly', 'right', 'that is correct'];

      positiveResponses.forEach(response => {
        const result = activeListener.validateUnderstanding(response, summary);
        expect(result.validated).toBe(true);
      });
    });

    it('should detect negative validation', () => {
      const summary = activeListener.generateConsolidatedSummary();
      const result = activeListener.validateUnderstanding('no', summary);

      expect(result.validated).toBe(false);
      expect(result.needsCorrection).toBe(true);
    });

    it('should accept various negative responses', () => {
      const summary = activeListener.generateConsolidatedSummary();
      const negativeResponses = ['no', 'not quite', 'incorrect', 'not exactly', 'wrong'];

      negativeResponses.forEach(response => {
        const result = activeListener.validateUnderstanding(response, summary);
        expect(result.needsCorrection).toBe(true);
      });
    });

    it('should handle ambiguous responses', () => {
      const summary = activeListener.generateConsolidatedSummary();
      const result = activeListener.validateUnderstanding('maybe', summary);

      expect(result.ambiguous).toBe(true);
    });
  });

  describe('Handling Misunderstanding', () => {
    it('should request clarification on negative validation', () => {
      activeListener.listen('Agent for customer service');
      activeListener.listen('With chat support');
      activeListener.listen('And email integration');

      const summary = activeListener.generateConsolidatedSummary();
      const validation = activeListener.validateUnderstanding('no', summary);

      expect(validation.needsCorrection).toBe(true);
      expect(validation.clarificationPrompt).toBeDefined();
      expect(validation.clarificationPrompt).toContain('clarify');
    });

    it('should process correction response', () => {
      activeListener.listen('Agent for inventory');
      activeListener.listen('Real-time tracking');
      activeListener.listen('Stock alerts');

      const summary = activeListener.generateConsolidatedSummary();
      activeListener.validateUnderstanding('no', summary);

      const correction = 'Actually, I meant warehouse management, not just inventory tracking';
      const result = activeListener.processCorrection(correction);

      expect(result.updated).toBe(true);
      expect(result.newSummary).toContain('warehouse');
    });

    it('should reformulate after correction', () => {
      activeListener.listen('Product recommendations');
      activeListener.listen('Based on user history');
      activeListener.listen('With ML algorithms');

      const summary = activeListener.generateConsolidatedSummary();
      activeListener.validateUnderstanding('not quite', summary);

      const correction = 'I want collaborative filtering recommendations';
      const result = activeListener.processCorrection(correction);

      expect(result.reformulated).toBeDefined();
      expect(result.reformulated).toContain('collaborative filtering');
    });

    it('should track correction in history', () => {
      activeListener.listen('Payment processing agent');
      activeListener.listen('Multiple gateways');
      activeListener.listen('Fraud detection');

      const summary = activeListener.generateConsolidatedSummary();
      activeListener.validateUnderstanding('no', summary);

      const historyBefore = activeListener.history.length;
      activeListener.processCorrection('I meant payment reconciliation, not processing');
      const historyAfter = activeListener.history.length;

      expect(historyAfter).toBeGreaterThan(historyBefore);
    });
  });

  describe('Tracking Listening History', () => {
    it('should record each response in history', () => {
      expect(activeListener.history.length).toBe(0);

      activeListener.listen('First response');
      expect(activeListener.history.length).toBe(1);

      activeListener.listen('Second response');
      expect(activeListener.history.length).toBe(2);
    });

    it('should store complete record for each response', () => {
      activeListener.listen('Agent for shipping logistics');

      const record = activeListener.history[0];
      expect(record.original).toBeDefined();
      expect(record.reformulated).toBeDefined();
      expect(record.clarityScore).toBeDefined();
      expect(record.keyPoints).toBeDefined();
      expect(record.summary).toBeDefined();
      expect(record.timestamp).toBeDefined();
    });

    it('should maintain chronological order', () => {
      const responses = [
        'First response at time 1',
        'Second response at time 2',
        'Third response at time 3'
      ];

      responses.forEach(r => activeListener.listen(r));

      for (let i = 1; i < activeListener.history.length; i++) {
        expect(activeListener.history[i].timestamp).toBeGreaterThanOrEqual(
          activeListener.history[i - 1].timestamp
        );
      }
    });

    it('should allow history retrieval by index', () => {
      activeListener.listen('Agent for warehouse management');
      activeListener.listen('Inventory optimization');

      const firstRecord = activeListener.getHistoryRecord(0);
      expect(firstRecord).toBeDefined();
      expect(firstRecord.original).toContain('warehouse');

      const secondRecord = activeListener.getHistoryRecord(1);
      expect(secondRecord).toBeDefined();
      expect(secondRecord.original).toContain('Inventory');
    });
  });

  describe('Export Session', () => {
    beforeEach(() => {
      activeListener.listen('I need an agent for customer support');
      activeListener.listen('With automated ticket routing');
      activeListener.listen('And priority escalation rules');
      activeListener.listen('Integration with our CRM system');
      activeListener.listen('Real-time agent availability checking');
    });

    it('should export complete listening session', () => {
      const exported = activeListener.export();

      expect(exported).toBeDefined();
      expect(exported.history).toHaveLength(5);
      expect(exported.metadata).toBeDefined();
      expect(exported.summary).toBeDefined();
    });

    it('should include metadata in export', () => {
      const exported = activeListener.export();

      expect(exported.metadata.sessionId).toBeDefined();
      expect(exported.metadata.totalResponses).toBe(5);
      expect(exported.metadata.validationFrequency).toBe(3);
      expect(exported.metadata.exportedAt).toBeDefined();
    });

    it('should include consolidated summary', () => {
      const exported = activeListener.export();

      expect(exported.summary).toBeDefined();
      expect(exported.summary).toContain('customer support');
      expect(exported.summary).toContain('ticket');
    });

    it('should export as formatted markdown', () => {
      const markdown = activeListener.exportAsMarkdown();

      expect(markdown).toContain('# Active Listening Session');
      expect(markdown).toContain('## Responses');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('customer support');
    });

    it('should export as JSON format', () => {
      const json = activeListener.exportAsJSON();
      const parsed = JSON.parse(json);

      expect(parsed.history).toHaveLength(5);
      expect(parsed.metadata.totalResponses).toBe(5);
    });
  });

  describe('Complete Listening Workflow', () => {
    it('should process complete conversation with validation checkpoints', () => {
      const responses = [
        'I want to build an ecommerce agent',
        'It should help with product recommendations',
        'Based on customer purchase history',
        'And integrate with our inventory system',
        'To show only available products',
        'With real-time stock updates'
      ];

      responses.forEach((response, index) => {
        const result = activeListener.listen(response);
        expect(result.valid).toBe(true);

        if ((index + 1) % 3 === 0) {
          expect(result.needsValidation).toBe(true);
          
          const summary = activeListener.generateConsolidatedSummary();
          const validation = activeListener.validateUnderstanding('yes', summary);
          expect(validation.validated).toBe(true);
        }
      });

      expect(activeListener.history.length).toBe(6);
    });

    it('should handle workflow with correction', () => {
      activeListener.listen('Agent for payment processing');
      activeListener.listen('Multiple payment gateways');
      const result = activeListener.listen('Automatic retry on failure');

      expect(result.needsValidation).toBe(true);

      const summary = activeListener.generateConsolidatedSummary();
      const validation = activeListener.validateUnderstanding('not quite', summary);
      
      expect(validation.needsCorrection).toBe(true);

      const correction = 'I meant payment reconciliation, not just processing';
      const corrected = activeListener.processCorrection(correction);

      expect(corrected.updated).toBe(true);
      expect(corrected.newSummary).toContain('reconciliation');
    });
  });

  describe('Performance Requirements', () => {
    it('should process response in under 100ms', () => {
      const response = 'I need an agent that handles customer inquiries about product availability and pricing information';
      
      const start = Date.now();
      activeListener.listen(response);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('should reformulate in under 50ms', () => {
      const text = 'Um, I think we need, like, an agent that can, you know, help with customer orders and stuff';
      
      const start = Date.now();
      activeListener.reformulate(text);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });

    it('should generate summary in under 50ms', () => {
      activeListener.listen('Agent for inventory management');
      activeListener.listen('Real-time stock tracking');
      activeListener.listen('Automated reorder alerts');

      const start = Date.now();
      activeListener.generateConsolidatedSummary();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });

    it('should export session in under 20ms', () => {
      for (let i = 0; i < 5; i++) {
        activeListener.listen(`Response number ${i + 1} about various features`);
      }

      const start = Date.now();
      activeListener.export();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(20);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long response', () => {
      const longResponse = 'I need an agent that can help customers with their orders. '.repeat(50);
      const result = activeListener.listen(longResponse);

      expect(result.valid).toBe(true);
      expect(result.reformulated.length).toBeLessThanOrEqual(longResponse.length);
    });

    it('should handle response with special characters', () => {
      const response = 'Agent for products: electronics, books & music (50% off)';
      const result = activeListener.listen(response);

      expect(result.valid).toBe(true);
      expect(result.reformulated).toBeDefined();
    });

    it('should handle response with numbers', () => {
      const response = 'Process 1000 orders per day with 99.9% accuracy';
      const result = activeListener.listen(response);

      expect(result.valid).toBe(true);
      expect(result.keyPoints.some(kp => kp.includes('1000') || kp.includes('99.9'))).toBe(true);
    });

    it('should handle response with technical terms', () => {
      const response = 'REST API integration with OAuth2 authentication and JWT tokens';
      const result = activeListener.listen(response);

      expect(result.valid).toBe(true);
      expect(result.reformulated).toContain('REST');
    });
  });
});
