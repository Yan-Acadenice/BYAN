const LocalExecutor = require('../../../src/byan-v2/dispatcher/local-executor');
const Logger = require('../../../src/byan-v2/observability/logger');
const ErrorTracker = require('../../../src/byan-v2/observability/error-tracker');
const MetricsCollector = require('../../../src/byan-v2/observability/metrics-collector');

// Mock dependencies
jest.mock('../../../src/byan-v2/observability/logger');
jest.mock('../../../src/byan-v2/observability/error-tracker');
jest.mock('../../../src/byan-v2/observability/metrics-collector');

describe('LocalExecutor - Story 3.1', () => {
  let localExecutor;
  let mockLogger;
  let mockErrorTracker;
  let mockMetricsCollector;

  beforeEach(() => {
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

    mockMetricsCollector = {
      recordTaskRouting: jest.fn(),
      recordTaskExecution: jest.fn(),
      getMetrics: jest.fn().mockReturnValue({
        localExecutions: 0,
        totalTokens: 0,
        totalDuration: 0
      })
    };

    Logger.mockImplementation(() => mockLogger);
    ErrorTracker.mockImplementation(() => mockErrorTracker);
    MetricsCollector.mockImplementation(() => mockMetricsCollector);

    localExecutor = new LocalExecutor();
  });

  describe('AC1: LocalExecutor handles tasks with complexity > 60', () => {
    test('should initialize with correct properties', () => {
      expect(localExecutor).toHaveProperty('logger');
      expect(localExecutor).toHaveProperty('errorTracker');
      expect(localExecutor).toHaveProperty('metricsCollector');
    });

    test('should accept tasks with complexity > 60', async () => {
      const task = {
        type: 'analysis',
        prompt: 'Complex analysis task',
        complexity: 65
      };

      const result = await localExecutor.execute(task);
      expect(result).toBeDefined();
      expect(result.executor).toBe('local');
    });

    test('should handle tasks with complexity = 61 (boundary)', async () => {
      const task = {
        type: 'analysis',
        prompt: 'Boundary complexity task',
        complexity: 61
      };

      const result = await localExecutor.execute(task);
      expect(result.executor).toBe('local');
    });

    test('should handle tasks with complexity = 100 (max)', async () => {
      const task = {
        type: 'general-purpose',
        prompt: 'Maximum complexity task',
        complexity: 100
      };

      const result = await localExecutor.execute(task);
      expect(result.executor).toBe('local');
    });
  });

  describe('AC2: execute(task) processes task locally', () => {
    test('should process simple analysis task', async () => {
      const task = {
        type: 'analysis',
        prompt: 'Extract key requirements from user responses',
        complexity: 70
      };

      const result = await localExecutor.execute(task);

      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('tokens');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('executor', 'local');
    });

    test('should process task without delegation', async () => {
      const task = {
        type: 'generation',
        prompt: 'Generate agent profile',
        complexity: 80
      };

      const result = await localExecutor.execute(task);

      // Verify no task-tool delegation occurred
      expect(result.executor).toBe('local');
      expect(result.output).toBeDefined();
    });

    test('should handle tasks with metadata', async () => {
      const task = {
        type: 'analysis',
        prompt: 'Analyze responses',
        complexity: 75,
        metadata: {
          requiresReasoning: true,
          context: { phase: 'interview' }
        }
      };

      const result = await localExecutor.execute(task);
      expect(result.executor).toBe('local');
    });
  });

  describe('AC3: Returns structured result object', () => {
    test('should return output field with result', async () => {
      const task = {
        type: 'analysis',
        prompt: 'Analyze data',
        complexity: 65
      };

      const result = await localExecutor.execute(task);
      expect(result.output).toBeDefined();
      expect(typeof result.output).toBe('string');
    });

    test('should return tokens count', async () => {
      const task = {
        type: 'generation',
        prompt: 'Generate content',
        complexity: 70
      };

      const result = await localExecutor.execute(task);
      expect(result.tokens).toBeDefined();
      expect(typeof result.tokens).toBe('number');
      expect(result.tokens).toBeGreaterThanOrEqual(0);
    });

    test('should return duration in milliseconds', async () => {
      const task = {
        type: 'analysis',
        prompt: 'Process data',
        complexity: 68
      };

      const startTime = Date.now();
      const result = await localExecutor.execute(task);
      const endTime = Date.now();

      expect(result.duration).toBeDefined();
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.duration).toBeLessThanOrEqual(endTime - startTime + 100);
    });

    test('should return executor field as "local"', async () => {
      const task = {
        type: 'task',
        prompt: 'Execute task',
        complexity: 72
      };

      const result = await localExecutor.execute(task);
      expect(result.executor).toBe('local');
    });

    test('should include task metadata in result', async () => {
      const task = {
        type: 'analysis',
        prompt: 'Analyze',
        complexity: 65
      };

      const result = await localExecutor.execute(task);
      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('tokens');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('executor');
    });
  });

  describe('AC4: Integration with MetricsCollector', () => {
    test('should track local execution start', async () => {
      const task = {
        type: 'analysis',
        prompt: 'Analyze data',
        complexity: 65
      };

      await localExecutor.execute(task);

      expect(mockMetricsCollector.recordTaskExecution).toHaveBeenCalled();
    });

    test('should track execution with correct metrics', async () => {
      const task = {
        type: 'analysis',
        prompt: 'Process',
        complexity: 70
      };

      await localExecutor.execute(task);

      expect(mockMetricsCollector.recordTaskExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          executor: 'local',
          duration: expect.any(Number),
          tokens: expect.any(Number),
          success: true
        })
      );
    });

    test('should track tokens consumed', async () => {
      const task = {
        type: 'generation',
        prompt: 'Generate agent profile',
        complexity: 80
      };

      await localExecutor.execute(task);

      const callArgs = mockMetricsCollector.recordTaskExecution.mock.calls[0][0];
      expect(callArgs.tokens).toBeGreaterThanOrEqual(0);
    });

    test('should track execution duration', async () => {
      const task = {
        type: 'analysis',
        prompt: 'Analyze',
        complexity: 65
      };

      await localExecutor.execute(task);

      const callArgs = mockMetricsCollector.recordTaskExecution.mock.calls[0][0];
      expect(callArgs.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('AC5: Integration with Logger', () => {
    test('should log local execution start', async () => {
      const task = {
        type: 'analysis',
        prompt: 'Analyze data',
        complexity: 65
      };

      await localExecutor.execute(task);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Local execution'),
        expect.objectContaining({
          type: task.type,
          complexity: task.complexity
        })
      );
    });

    test('should log execution completion', async () => {
      const task = {
        type: 'generation',
        prompt: 'Generate',
        complexity: 75
      };

      await localExecutor.execute(task);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('completed'),
        expect.any(Object)
      );
    });

    test('should log execution metrics', async () => {
      const task = {
        type: 'analysis',
        prompt: 'Process',
        complexity: 68
      };

      await localExecutor.execute(task);

      const logCalls = mockLogger.info.mock.calls;
      const completionLog = logCalls.find(call => 
        call[0].includes('completed')
      );

      expect(completionLog).toBeDefined();
      expect(completionLog[1]).toMatchObject({
        duration: expect.any(Number),
        tokens: expect.any(Number)
      });
    });
  });

  describe('AC6: Error handling with ErrorTracker', () => {
    test('should track error if task is invalid', async () => {
      await expect(localExecutor.execute(null)).rejects.toThrow();
      expect(mockErrorTracker.track).toHaveBeenCalled();
    });

    test('should track error with context', async () => {
      await expect(localExecutor.execute(undefined)).rejects.toThrow();

      expect(mockErrorTracker.track).toHaveBeenCalledWith(
        expect.objectContaining({
          component: 'LocalExecutor',
          operation: 'execute'
        })
      );
    });

    test('should handle processing errors gracefully', async () => {
      const invalidTask = {
        type: 'invalid-type',
        prompt: '', // Empty prompt might cause issues
        complexity: 70
      };

      // Even with potential issues, should not crash
      try {
        await localExecutor.execute(invalidTask);
      } catch (error) {
        expect(mockErrorTracker.track).toHaveBeenCalled();
      }
    });

    test('should return error details in result on failure', async () => {
      // Test error handling without crashing
      await expect(async () => {
        await localExecutor.execute(null);
      }).rejects.toThrow();

      expect(mockErrorTracker.track).toHaveBeenCalled();
    });
  });

  describe('AC7: Tests validate execution and metrics tracking', () => {
    test('should execute multiple tasks sequentially', async () => {
      const task1 = { type: 'analysis', prompt: 'Task 1', complexity: 65 };
      const task2 = { type: 'generation', prompt: 'Task 2', complexity: 75 };

      const result1 = await localExecutor.execute(task1);
      const result2 = await localExecutor.execute(task2);

      expect(result1.executor).toBe('local');
      expect(result2.executor).toBe('local');
      expect(mockMetricsCollector.recordTaskExecution).toHaveBeenCalledTimes(2);
    });

    test('should maintain consistent result structure', async () => {
      const tasks = [
        { type: 'analysis', prompt: 'A', complexity: 65 },
        { type: 'generation', prompt: 'B', complexity: 70 },
        { type: 'task', prompt: 'C', complexity: 80 }
      ];

      for (const task of tasks) {
        const result = await localExecutor.execute(task);
        expect(result).toMatchObject({
          output: expect.any(String),
          tokens: expect.any(Number),
          duration: expect.any(Number),
          executor: 'local'
        });
      }
    });

    test('should track metrics for all executions', async () => {
      const task1 = { type: 'analysis', prompt: 'T1', complexity: 65 };
      const task2 = { type: 'analysis', prompt: 'T2', complexity: 70 };
      const task3 = { type: 'generation', prompt: 'T3', complexity: 75 };

      await localExecutor.execute(task1);
      await localExecutor.execute(task2);
      await localExecutor.execute(task3);

      expect(mockMetricsCollector.recordTaskExecution).toHaveBeenCalledTimes(3);
    });

    test('should log all executions', async () => {
      const task = { type: 'analysis', prompt: 'Test', complexity: 65 };

      await localExecutor.execute(task);

      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('Task Processing Logic', () => {
    test('should process analysis tasks', async () => {
      const task = {
        type: 'analysis',
        prompt: 'Extract requirements from responses: User wants agent for testing',
        complexity: 70
      };

      const result = await localExecutor.execute(task);
      expect(result.output).toContain('requirement');
    });

    test('should process generation tasks', async () => {
      const task = {
        type: 'generation',
        prompt: 'Generate agent profile for testing agent',
        complexity: 75
      };

      const result = await localExecutor.execute(task);
      expect(result.output).toBeDefined();
      expect(result.tokens).toBeGreaterThan(0);
    });

    test('should estimate tokens based on output length', async () => {
      const task = {
        type: 'analysis',
        prompt: 'Short analysis task',
        complexity: 65
      };

      const result = await localExecutor.execute(task);
      
      // Token count should correlate with output length
      const expectedTokens = Math.ceil(result.output.split(/\s+/).length * 1.3);
      expect(result.tokens).toBeGreaterThanOrEqual(expectedTokens * 0.5);
      expect(result.tokens).toBeLessThanOrEqual(expectedTokens * 2);
    });
  });

  describe('Edge Cases', () => {
    test('should reject null task', async () => {
      await expect(localExecutor.execute(null)).rejects.toThrow();
    });

    test('should reject undefined task', async () => {
      await expect(localExecutor.execute(undefined)).rejects.toThrow();
    });

    test('should handle task without complexity field', async () => {
      const task = {
        type: 'analysis',
        prompt: 'Task without complexity'
      };

      // Should still execute (complexity not required for execution)
      const result = await localExecutor.execute(task);
      expect(result.executor).toBe('local');
    });

    test('should handle task without type field', async () => {
      const task = {
        prompt: 'Task without type',
        complexity: 70
      };

      const result = await localExecutor.execute(task);
      expect(result.executor).toBe('local');
    });

    test('should handle empty prompt', async () => {
      const task = {
        type: 'analysis',
        prompt: '',
        complexity: 65
      };

      const result = await localExecutor.execute(task);
      expect(result.output).toBeDefined();
    });
  });
});
