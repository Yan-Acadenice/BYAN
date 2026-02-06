const StateMachine = require('../../../src/byan-v2/orchestrator/state-machine');
const Logger = require('../../../src/byan-v2/observability/logger');
const ErrorTracker = require('../../../src/byan-v2/observability/error-tracker');

// Mock Logger and ErrorTracker
jest.mock('../../../src/byan-v2/observability/logger');
jest.mock('../../../src/byan-v2/observability/error-tracker');

describe('StateMachine Core', () => {
  let stateMachine;
  let mockLogger;
  let mockErrorTracker;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock instances
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };
    
    mockErrorTracker = {
      track: jest.fn(),
      getErrors: jest.fn().mockReturnValue([])
    };
    
    Logger.mockImplementation(() => mockLogger);
    ErrorTracker.mockImplementation(() => mockErrorTracker);
    
    stateMachine = new StateMachine();
  });

  describe('AC1: StateMachine manages states', () => {
    test('should manage five states: INTERVIEW, ANALYSIS, GENERATION, COMPLETED, ERROR', () => {
      expect(stateMachine.STATES).toEqual({
        INTERVIEW: 'INTERVIEW',
        ANALYSIS: 'ANALYSIS',
        GENERATION: 'GENERATION',
        COMPLETED: 'COMPLETED',
        ERROR: 'ERROR'
      });
    });

    test('should start in INTERVIEW state', () => {
      expect(stateMachine.currentState).toBe('INTERVIEW');
    });

    test('should have metadata for current state', () => {
      const state = stateMachine.getCurrentState();
      expect(state).toHaveProperty('name', 'INTERVIEW');
      expect(state).toHaveProperty('timestamp');
      expect(state).toHaveProperty('attempts', 0);
    });
  });

  describe('AC2: Valid transitions', () => {
    test('should allow INTERVIEW → ANALYSIS transition', () => {
      const result = stateMachine.transition('ANALYSIS');
      expect(result.success).toBe(true);
      expect(stateMachine.currentState).toBe('ANALYSIS');
    });

    test('should allow ANALYSIS → GENERATION transition', () => {
      stateMachine.transition('ANALYSIS');
      const result = stateMachine.transition('GENERATION');
      expect(result.success).toBe(true);
      expect(stateMachine.currentState).toBe('GENERATION');
    });

    test('should allow GENERATION → COMPLETED transition', () => {
      stateMachine.transition('ANALYSIS');
      stateMachine.transition('GENERATION');
      const result = stateMachine.transition('COMPLETED');
      expect(result.success).toBe(true);
      expect(stateMachine.currentState).toBe('COMPLETED');
    });

    test('should allow any state → ERROR transition', () => {
      const result = stateMachine.transition('ERROR');
      expect(result.success).toBe(true);
      expect(stateMachine.currentState).toBe('ERROR');
    });

    test('should allow ANALYSIS → ERROR transition', () => {
      stateMachine.transition('ANALYSIS');
      const result = stateMachine.transition('ERROR');
      expect(result.success).toBe(true);
      expect(stateMachine.currentState).toBe('ERROR');
    });

    test('should reject INTERVIEW → GENERATION transition', () => {
      const result = stateMachine.transition('GENERATION');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
      expect(stateMachine.currentState).toBe('INTERVIEW');
    });

    test('should reject INTERVIEW → COMPLETED transition', () => {
      const result = stateMachine.transition('COMPLETED');
      expect(result.success).toBe(false);
      expect(stateMachine.currentState).toBe('INTERVIEW');
    });

    test('should reject ANALYSIS → COMPLETED transition', () => {
      stateMachine.transition('ANALYSIS');
      const result = stateMachine.transition('COMPLETED');
      expect(result.success).toBe(false);
      expect(stateMachine.currentState).toBe('ANALYSIS');
    });

    test('should reject backward transitions', () => {
      stateMachine.transition('ANALYSIS');
      const result = stateMachine.transition('INTERVIEW');
      expect(result.success).toBe(false);
      expect(stateMachine.currentState).toBe('ANALYSIS');
    });
  });

  describe('AC3: transition(newState) validates and executes', () => {
    test('should validate newState exists', () => {
      const result = stateMachine.transition('INVALID_STATE');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown state');
      expect(stateMachine.currentState).toBe('INTERVIEW');
    });

    test('should validate transition is allowed', () => {
      const result = stateMachine.transition('COMPLETED');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
    });

    test('should execute transition if valid', () => {
      const result = stateMachine.transition('ANALYSIS');
      expect(result.success).toBe(true);
      expect(result.previousState).toBe('INTERVIEW');
      expect(result.newState).toBe('ANALYSIS');
    });

    test('should update state metadata after transition', () => {
      stateMachine.transition('ANALYSIS');
      const state = stateMachine.getCurrentState();
      expect(state.name).toBe('ANALYSIS');
      expect(state.attempts).toBe(0);
      expect(state.timestamp).toBeDefined();
    });

    test('should log successful transition', () => {
      stateMachine.transition('ANALYSIS');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('State transition'),
        expect.objectContaining({
          from: 'INTERVIEW',
          to: 'ANALYSIS'
        })
      );
    });

    test('should track failed transition error', () => {
      stateMachine.transition('INVALID_STATE');
      expect(mockErrorTracker.track).toHaveBeenCalledWith(
        expect.objectContaining({
          component: 'StateMachine',
          operation: 'transition'
        })
      );
    });
  });

  describe('AC4: getCurrentState() returns state with metadata', () => {
    test('should return current state name', () => {
      const state = stateMachine.getCurrentState();
      expect(state.name).toBe('INTERVIEW');
    });

    test('should return timestamp', () => {
      const state = stateMachine.getCurrentState();
      expect(state.timestamp).toBeDefined();
      expect(typeof state.timestamp).toBe('number');
    });

    test('should return attempts count', () => {
      const state = stateMachine.getCurrentState();
      expect(state.attempts).toBe(0);
    });

    test('should update timestamp after transition', () => {
      const state1 = stateMachine.getCurrentState();
      const timestamp1 = state1.timestamp;
      
      // Small delay to ensure different timestamp
      const before = Date.now();
      stateMachine.transition('ANALYSIS');
      const after = Date.now();
      
      const state2 = stateMachine.getCurrentState();
      expect(state2.timestamp).toBeGreaterThanOrEqual(before);
      expect(state2.timestamp).toBeLessThanOrEqual(after);
    });

    test('should increment attempts on retry', () => {
      stateMachine.incrementAttempts();
      const state = stateMachine.getCurrentState();
      expect(state.attempts).toBe(1);
    });
  });

  describe('AC5: onStateEnter/onStateExit hooks', () => {
    test('should call onStateExit hook before transition', () => {
      const exitSpy = jest.fn();
      stateMachine.onStateExit('INTERVIEW', exitSpy);
      
      stateMachine.transition('ANALYSIS');
      
      expect(exitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'INTERVIEW',
          to: 'ANALYSIS'
        })
      );
    });

    test('should call onStateEnter hook after transition', () => {
      const enterSpy = jest.fn();
      stateMachine.onStateEnter('ANALYSIS', enterSpy);
      
      stateMachine.transition('ANALYSIS');
      
      expect(enterSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'INTERVIEW',
          to: 'ANALYSIS'
        })
      );
    });

    test('should call exit hook before enter hook', () => {
      const callOrder = [];
      const exitSpy = jest.fn(() => callOrder.push('exit'));
      const enterSpy = jest.fn(() => callOrder.push('enter'));
      
      stateMachine.onStateExit('INTERVIEW', exitSpy);
      stateMachine.onStateEnter('ANALYSIS', enterSpy);
      
      stateMachine.transition('ANALYSIS');
      
      expect(callOrder).toEqual(['exit', 'enter']);
    });

    test('should not call hooks if transition fails', () => {
      const exitSpy = jest.fn();
      const enterSpy = jest.fn();
      
      stateMachine.onStateExit('INTERVIEW', exitSpy);
      stateMachine.onStateEnter('COMPLETED', enterSpy);
      
      stateMachine.transition('COMPLETED'); // Invalid transition
      
      expect(exitSpy).not.toHaveBeenCalled();
      expect(enterSpy).not.toHaveBeenCalled();
    });

    test('should support multiple hooks for same state', () => {
      const hook1 = jest.fn();
      const hook2 = jest.fn();
      
      stateMachine.onStateEnter('ANALYSIS', hook1);
      stateMachine.onStateEnter('ANALYSIS', hook2);
      
      stateMachine.transition('ANALYSIS');
      
      expect(hook1).toHaveBeenCalled();
      expect(hook2).toHaveBeenCalled();
    });

    test('should handle hook errors gracefully', () => {
      const errorHook = jest.fn(() => {
        throw new Error('Hook failed');
      });
      
      stateMachine.onStateEnter('ANALYSIS', errorHook);
      
      // Should still complete transition despite hook error
      const result = stateMachine.transition('ANALYSIS');
      expect(result.success).toBe(true);
      expect(mockErrorTracker.track).toHaveBeenCalled();
    });
  });

  describe('AC6: Tests validate transitions and reject invalid ones', () => {
    test('should validate full workflow path INTERVIEW → COMPLETED', () => {
      expect(stateMachine.currentState).toBe('INTERVIEW');
      
      stateMachine.transition('ANALYSIS');
      expect(stateMachine.currentState).toBe('ANALYSIS');
      
      stateMachine.transition('GENERATION');
      expect(stateMachine.currentState).toBe('GENERATION');
      
      stateMachine.transition('COMPLETED');
      expect(stateMachine.currentState).toBe('COMPLETED');
    });

    test('should reject transitions from COMPLETED state', () => {
      stateMachine.transition('ANALYSIS');
      stateMachine.transition('GENERATION');
      stateMachine.transition('COMPLETED');
      
      const result = stateMachine.transition('INTERVIEW');
      expect(result.success).toBe(false);
      expect(stateMachine.currentState).toBe('COMPLETED');
    });

    test('should reject transitions from ERROR state', () => {
      stateMachine.transition('ERROR');
      
      const result = stateMachine.transition('INTERVIEW');
      expect(result.success).toBe(false);
      expect(stateMachine.currentState).toBe('ERROR');
    });

    test('should handle rapid successive transitions', () => {
      const result1 = stateMachine.transition('ANALYSIS');
      expect(result1.success).toBe(true);
      
      const result2 = stateMachine.transition('GENERATION');
      expect(result2.success).toBe(true);
      
      const result3 = stateMachine.transition('COMPLETED');
      expect(result3.success).toBe(true);
    });

    test('should maintain state integrity after failed transition', () => {
      const beforeState = stateMachine.getCurrentState();
      
      stateMachine.transition('INVALID_STATE');
      
      const afterState = stateMachine.getCurrentState();
      expect(afterState.name).toBe(beforeState.name);
    });
  });

  describe('Integration: Logger and ErrorTracker', () => {
    test('should log all state transitions', () => {
      stateMachine.transition('ANALYSIS');
      stateMachine.transition('GENERATION');
      
      expect(mockLogger.info).toHaveBeenCalledTimes(2);
    });

    test('should track all transition errors', () => {
      stateMachine.transition('INVALID_STATE');
      stateMachine.transition('COMPLETED');
      
      expect(mockErrorTracker.track).toHaveBeenCalledTimes(2);
    });

    test('should include context in error tracking', () => {
      stateMachine.transition('COMPLETED');
      
      expect(mockErrorTracker.track).toHaveBeenCalledWith(
        expect.objectContaining({
          component: 'StateMachine',
          currentState: 'INTERVIEW',
          attemptedState: 'COMPLETED'
        })
      );
    });
  });

  describe('Edge Cases', () => {
    test('should handle null state transition', () => {
      const result = stateMachine.transition(null);
      expect(result.success).toBe(false);
    });

    test('should handle undefined state transition', () => {
      const result = stateMachine.transition(undefined);
      expect(result.success).toBe(false);
    });

    test('should handle empty string state transition', () => {
      const result = stateMachine.transition('');
      expect(result.success).toBe(false);
    });

    test('should handle case-sensitive state names', () => {
      const result = stateMachine.transition('analysis'); // lowercase
      expect(result.success).toBe(false);
      expect(stateMachine.currentState).toBe('INTERVIEW');
    });
  });
});
