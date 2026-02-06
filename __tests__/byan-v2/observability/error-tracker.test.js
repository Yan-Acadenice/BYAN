/**
 * ErrorTracker Tests - TDD
 * AC: Store errors with type, message, stack, context
 * Types: ROUTING_ERROR, EXECUTION_ERROR, VALIDATION_ERROR
 * Max 100 errors (FIFO)
 */

const ErrorTracker = require('../../../src/byan-v2/observability/error-tracker');

describe('ErrorTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new ErrorTracker();
  });

  describe('AC1: Initialization', () => {
    test('should initialize with empty error list', () => {
      const errors = tracker.getErrors();
      expect(errors).toEqual([]);
      expect(Array.isArray(errors)).toBe(true);
    });

    test('should initialize with default max size', () => {
      expect(tracker.maxErrors).toBe(100);
    });

    test('should accept custom max size', () => {
      const customTracker = new ErrorTracker({ maxErrors: 50 });
      expect(customTracker.maxErrors).toBe(50);
    });
  });

  describe('AC2: trackError()', () => {
    test('should store error with all required fields', () => {
      const error = new Error('Test error');
      tracker.trackError({
        type: 'ROUTING_ERROR',
        message: 'Failed to route task',
        error,
        context: { taskType: 'explore' }
      });

      const errors = tracker.getErrors();
      expect(errors.length).toBe(1);
      expect(errors[0]).toHaveProperty('type', 'ROUTING_ERROR');
      expect(errors[0]).toHaveProperty('message', 'Failed to route task');
      expect(errors[0]).toHaveProperty('stack');
      expect(errors[0]).toHaveProperty('context');
      expect(errors[0]).toHaveProperty('timestamp');
    });

    test('should handle ROUTING_ERROR type', () => {
      tracker.trackError({
        type: 'ROUTING_ERROR',
        message: 'Routing failed',
        error: new Error('Test')
      });

      const errors = tracker.getErrors();
      expect(errors[0].type).toBe('ROUTING_ERROR');
    });

    test('should handle EXECUTION_ERROR type', () => {
      tracker.trackError({
        type: 'EXECUTION_ERROR',
        message: 'Execution failed',
        error: new Error('Test')
      });

      const errors = tracker.getErrors();
      expect(errors[0].type).toBe('EXECUTION_ERROR');
    });

    test('should handle VALIDATION_ERROR type', () => {
      tracker.trackError({
        type: 'VALIDATION_ERROR',
        message: 'Validation failed',
        error: new Error('Test')
      });

      const errors = tracker.getErrors();
      expect(errors[0].type).toBe('VALIDATION_ERROR');
    });

    test('should store error stack trace', () => {
      const error = new Error('Test error');
      tracker.trackError({
        type: 'EXECUTION_ERROR',
        message: 'Test',
        error
      });

      const errors = tracker.getErrors();
      expect(errors[0].stack).toBeDefined();
      expect(errors[0].stack).toContain('Error: Test error');
    });

    test('should store error context', () => {
      tracker.trackError({
        type: 'ROUTING_ERROR',
        message: 'Test',
        error: new Error('Test'),
        context: {
          task: { type: 'explore' },
          complexity: 25
        }
      });

      const errors = tracker.getErrors();
      expect(errors[0].context).toEqual({
        task: { type: 'explore' },
        complexity: 25
      });
    });

    test('should store timestamp in ISO format', () => {
      const before = Date.now();
      tracker.trackError({
        type: 'EXECUTION_ERROR',
        message: 'Test',
        error: new Error('Test')
      });
      const after = Date.now();

      const errors = tracker.getErrors();
      const timestamp = new Date(errors[0].timestamp).getTime();
      
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('AC3: FIFO Behavior (Max 100 errors)', () => {
    test('should store up to maxErrors', () => {
      const customTracker = new ErrorTracker({ maxErrors: 5 });

      for (let i = 0; i < 5; i++) {
        customTracker.trackError({
          type: 'EXECUTION_ERROR',
          message: `Error ${i}`,
          error: new Error(`Test ${i}`)
        });
      }

      const errors = customTracker.getErrors();
      expect(errors.length).toBe(5);
    });

    test('should remove oldest error when exceeding max', () => {
      const customTracker = new ErrorTracker({ maxErrors: 3 });

      customTracker.trackError({
        type: 'EXECUTION_ERROR',
        message: 'Error 0',
        error: new Error('Test 0')
      });
      customTracker.trackError({
        type: 'EXECUTION_ERROR',
        message: 'Error 1',
        error: new Error('Test 1')
      });
      customTracker.trackError({
        type: 'EXECUTION_ERROR',
        message: 'Error 2',
        error: new Error('Test 2')
      });

      // This should remove Error 0
      customTracker.trackError({
        type: 'EXECUTION_ERROR',
        message: 'Error 3',
        error: new Error('Test 3')
      });

      const errors = customTracker.getErrors();
      expect(errors.length).toBe(3);
      expect(errors[0].message).toBe('Error 1');
      expect(errors[2].message).toBe('Error 3');
    });

    test('should maintain FIFO order', () => {
      const customTracker = new ErrorTracker({ maxErrors: 5 });

      for (let i = 0; i < 7; i++) {
        customTracker.trackError({
          type: 'EXECUTION_ERROR',
          message: `Error ${i}`,
          error: new Error(`Test ${i}`)
        });
      }

      const errors = customTracker.getErrors();
      expect(errors.length).toBe(5);
      expect(errors[0].message).toBe('Error 2'); // First two removed
      expect(errors[4].message).toBe('Error 6');
    });

    test('should handle default max of 100 errors', () => {
      for (let i = 0; i < 105; i++) {
        tracker.trackError({
          type: 'EXECUTION_ERROR',
          message: `Error ${i}`,
          error: new Error(`Test ${i}`)
        });
      }

      const errors = tracker.getErrors();
      expect(errors.length).toBe(100);
      expect(errors[0].message).toBe('Error 5'); // First 5 removed
      expect(errors[99].message).toBe('Error 104');
    });
  });

  describe('AC4: getErrors()', () => {
    test('should return all errors', () => {
      tracker.trackError({
        type: 'ROUTING_ERROR',
        message: 'Error 1',
        error: new Error('Test 1')
      });
      tracker.trackError({
        type: 'EXECUTION_ERROR',
        message: 'Error 2',
        error: new Error('Test 2')
      });

      const errors = tracker.getErrors();
      expect(errors.length).toBe(2);
    });

    test('should return errors in chronological order', () => {
      tracker.trackError({
        type: 'ROUTING_ERROR',
        message: 'First',
        error: new Error('1')
      });

      // Small delay to ensure different timestamps
      const secondTime = Date.now() + 10;
      
      tracker.trackError({
        type: 'EXECUTION_ERROR',
        message: 'Second',
        error: new Error('2')
      });

      const errors = tracker.getErrors();
      expect(errors[0].message).toBe('First');
      expect(errors[1].message).toBe('Second');
    });

    test('should return copy of errors array', () => {
      tracker.trackError({
        type: 'ROUTING_ERROR',
        message: 'Test',
        error: new Error('Test')
      });

      const errors1 = tracker.getErrors();
      const errors2 = tracker.getErrors();

      // Should be different array instances
      expect(errors1).not.toBe(errors2);
      expect(errors1).toEqual(errors2);
    });
  });

  describe('AC5: getErrorsByType()', () => {
    beforeEach(() => {
      tracker.trackError({
        type: 'ROUTING_ERROR',
        message: 'Routing error 1',
        error: new Error('R1')
      });
      tracker.trackError({
        type: 'EXECUTION_ERROR',
        message: 'Execution error 1',
        error: new Error('E1')
      });
      tracker.trackError({
        type: 'ROUTING_ERROR',
        message: 'Routing error 2',
        error: new Error('R2')
      });
      tracker.trackError({
        type: 'VALIDATION_ERROR',
        message: 'Validation error 1',
        error: new Error('V1')
      });
    });

    test('should filter errors by ROUTING_ERROR type', () => {
      const routingErrors = tracker.getErrorsByType('ROUTING_ERROR');
      expect(routingErrors.length).toBe(2);
      expect(routingErrors.every(e => e.type === 'ROUTING_ERROR')).toBe(true);
    });

    test('should filter errors by EXECUTION_ERROR type', () => {
      const executionErrors = tracker.getErrorsByType('EXECUTION_ERROR');
      expect(executionErrors.length).toBe(1);
      expect(executionErrors[0].type).toBe('EXECUTION_ERROR');
    });

    test('should filter errors by VALIDATION_ERROR type', () => {
      const validationErrors = tracker.getErrorsByType('VALIDATION_ERROR');
      expect(validationErrors.length).toBe(1);
      expect(validationErrors[0].type).toBe('VALIDATION_ERROR');
    });

    test('should return empty array for type with no errors', () => {
      tracker.clearErrors();
      const errors = tracker.getErrorsByType('ROUTING_ERROR');
      expect(errors).toEqual([]);
    });
  });

  describe('AC6: getErrorStats()', () => {
    test('should return stats with counts by type', () => {
      tracker.trackError({
        type: 'ROUTING_ERROR',
        message: 'R1',
        error: new Error('R1')
      });
      tracker.trackError({
        type: 'ROUTING_ERROR',
        message: 'R2',
        error: new Error('R2')
      });
      tracker.trackError({
        type: 'EXECUTION_ERROR',
        message: 'E1',
        error: new Error('E1')
      });

      const stats = tracker.getErrorStats();

      expect(stats).toEqual({
        total: 3,
        byType: {
          ROUTING_ERROR: 2,
          EXECUTION_ERROR: 1,
          VALIDATION_ERROR: 0
        }
      });
    });

    test('should return zero stats when no errors', () => {
      const stats = tracker.getErrorStats();

      expect(stats).toEqual({
        total: 0,
        byType: {
          ROUTING_ERROR: 0,
          EXECUTION_ERROR: 0,
          VALIDATION_ERROR: 0
        }
      });
    });
  });

  describe('AC7: clearErrors()', () => {
    test('should clear all errors', () => {
      tracker.trackError({
        type: 'ROUTING_ERROR',
        message: 'Test',
        error: new Error('Test')
      });
      tracker.trackError({
        type: 'EXECUTION_ERROR',
        message: 'Test 2',
        error: new Error('Test 2')
      });

      expect(tracker.getErrors().length).toBe(2);

      tracker.clearErrors();

      expect(tracker.getErrors().length).toBe(0);
    });

    test('should reset error stats', () => {
      tracker.trackError({
        type: 'ROUTING_ERROR',
        message: 'Test',
        error: new Error('Test')
      });

      tracker.clearErrors();

      const stats = tracker.getErrorStats();
      expect(stats.total).toBe(0);
    });
  });

  describe('AC8: Edge Cases', () => {
    test('should handle null or undefined error data', () => {
      expect(() => tracker.trackError(null)).not.toThrow();
      expect(() => tracker.trackError(undefined)).not.toThrow();

      expect(tracker.getErrors().length).toBe(0);
    });

    test('should handle error without context', () => {
      tracker.trackError({
        type: 'EXECUTION_ERROR',
        message: 'Test',
        error: new Error('Test')
        // No context
      });

      const errors = tracker.getErrors();
      expect(errors[0].context).toBeUndefined();
    });

    test('should handle error without stack', () => {
      tracker.trackError({
        type: 'EXECUTION_ERROR',
        message: 'Test',
        error: { message: 'No stack' } // Not a real Error object
      });

      const errors = tracker.getErrors();
      expect(errors[0]).toBeDefined();
    });

    test('should handle string error instead of Error object', () => {
      tracker.trackError({
        type: 'EXECUTION_ERROR',
        message: 'Test',
        error: 'String error'
      });

      const errors = tracker.getErrors();
      expect(errors[0]).toBeDefined();
      expect(errors[0].message).toBe('Test');
    });

    test('should handle missing message', () => {
      tracker.trackError({
        type: 'EXECUTION_ERROR',
        error: new Error('Test')
        // No message
      });

      const errors = tracker.getErrors();
      expect(errors[0]).toBeDefined();
    });

    test('should handle unknown error type', () => {
      tracker.trackError({
        type: 'UNKNOWN_ERROR',
        message: 'Test',
        error: new Error('Test')
      });

      const errors = tracker.getErrors();
      expect(errors[0].type).toBe('UNKNOWN_ERROR');
    });
  });
});
