/**
 * Tests for WorkflowExecutor
 * 
 * @module __tests__/workflow-executor
 */

const { WorkflowExecutor } = require('../src/core/workflow/workflow-executor');

describe('WorkflowExecutor', () => {
  let executor;

  beforeEach(() => {
    executor = new WorkflowExecutor();
  });

  describe('Constructor', () => {
    test('should initialize with idle status', () => {
      expect(executor.status).toBe('idle');
      expect(executor.currentWorkflow).toBeNull();
      expect(executor.results).toEqual([]);
      expect(executor.isPaused).toBe(false);
    });
  });

  describe('executeWorkflow', () => {
    test('should execute simple workflow successfully', async () => {
      const workflow = {
        name: 'test-workflow',
        steps: [
          { id: 'step1', action: 'task1' },
          { id: 'step2', action: 'task2' },
        ],
      };

      const result = await executor.executeWorkflow(workflow);

      expect(result.success).toBe(true);
      expect(result.workflowName).toBe('test-workflow');
      expect(result.stepsCompleted).toBe(2);
      expect(result.totalSteps).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(result.duration).toBeGreaterThan(0);
    });

    test('should throw error if workflow is null', async () => {
      await expect(executor.executeWorkflow(null)).rejects.toThrow(
        'Workflow is required'
      );
    });

    test('should throw error if workflow name is missing', async () => {
      const workflow = {
        steps: [{ id: 'step1', action: 'task1' }],
      };

      await expect(executor.executeWorkflow(workflow)).rejects.toThrow(
        'Workflow name is required'
      );
    });

    test('should throw error if steps array is empty', async () => {
      const workflow = {
        name: 'test',
        steps: [],
      };

      await expect(executor.executeWorkflow(workflow)).rejects.toThrow(
        'Workflow must have at least one step'
      );
    });

    test('should throw error if steps is not an array', async () => {
      const workflow = {
        name: 'test',
        steps: 'not-an-array',
      };

      await expect(executor.executeWorkflow(workflow)).rejects.toThrow(
        'Workflow must have at least one step'
      );
    });

    test('should handle step without id', async () => {
      const workflow = {
        name: 'test-workflow',
        steps: [{ action: 'task1' }],
      };

      const result = await executor.executeWorkflow(workflow);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Step id is required');
      expect(result.stepsCompleted).toBe(0);
    });

    test('should execute multiple steps in sequence', async () => {
      const workflow = {
        name: 'multi-step',
        steps: [
          { id: 'step1', action: 'task1' },
          { id: 'step2', action: 'task2' },
          { id: 'step3', action: 'task3' },
        ],
      };

      const result = await executor.executeWorkflow(workflow);

      expect(result.success).toBe(true);
      expect(result.stepsCompleted).toBe(3);
      expect(result.results[0].stepId).toBe('step1');
      expect(result.results[1].stepId).toBe('step2');
      expect(result.results[2].stepId).toBe('step3');
    });

    test('should store step results with metadata', async () => {
      const workflow = {
        name: 'test-workflow',
        steps: [{ id: 'step1', action: 'task1' }],
      };

      const result = await executor.executeWorkflow(workflow);

      expect(result.results[0]).toHaveProperty('stepId');
      expect(result.results[0]).toHaveProperty('action');
      expect(result.results[0]).toHaveProperty('duration');
      expect(result.results[0]).toHaveProperty('result');
      expect(result.results[0]).toHaveProperty('timestamp');
    });

    test('should update status during execution', async () => {
      const workflow = {
        name: 'test',
        steps: [{ id: 'step1', action: 'task1' }],
      };

      const promise = executor.executeWorkflow(workflow);
      
      // Status should be running during execution
      expect(executor.status).toBe('running');

      await promise;

      // Status should be completed after execution
      expect(executor.status).toBe('completed');
    });
  });

  describe('getExecutionStatus', () => {
    test('should return idle status initially', () => {
      const status = executor.getExecutionStatus();

      expect(status.status).toBe('idle');
      expect(status.currentWorkflow).toBeNull();
      expect(status.stepsCompleted).toBe(0);
      expect(status.totalSteps).toBe(0);
      expect(status.isPaused).toBe(false);
    });

    test('should return running status during execution', async () => {
      const workflow = {
        name: 'test',
        steps: [{ id: 'step1', action: 'task1' }],
      };

      const promise = executor.executeWorkflow(workflow);
      
      const status = executor.getExecutionStatus();
      expect(status.status).toBe('running');
      expect(status.currentWorkflow).toBe('test');

      await promise;
    });

    test('should return completed status after execution', async () => {
      const workflow = {
        name: 'test',
        steps: [{ id: 'step1', action: 'task1' }],
      };

      await executor.executeWorkflow(workflow);

      const status = executor.getExecutionStatus();
      expect(status.status).toBe('completed');
      expect(status.stepsCompleted).toBe(1);
      expect(status.totalSteps).toBe(1);
    });
  });

  describe('pause and resume', () => {
    test('should pause workflow execution', async () => {
      const workflow = {
        name: 'test',
        steps: [
          { id: 'step1', action: 'task1' },
          { id: 'step2', action: 'task2' },
        ],
      };

      const promise = executor.executeWorkflow(workflow);
      
      // Pause immediately
      executor.pause();

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.paused).toBe(true);
      expect(executor.status).toBe('paused');
    });

    test('should resume paused workflow', () => {
      executor.status = 'paused';
      executor.isPaused = true;

      executor.resume();

      expect(executor.status).toBe('running');
      expect(executor.isPaused).toBe(false);
    });

    test('should not pause if not running', () => {
      executor.status = 'idle';

      executor.pause();

      expect(executor.status).toBe('idle');
      expect(executor.isPaused).toBe(false);
    });

    test('should not resume if not paused', () => {
      executor.status = 'idle';

      executor.resume();

      expect(executor.status).toBe('idle');
    });
  });

  describe('getResults', () => {
    test('should return empty array initially', () => {
      const results = executor.getResults();

      expect(results).toEqual([]);
    });

    test('should return copy of results array', async () => {
      const workflow = {
        name: 'test',
        steps: [{ id: 'step1', action: 'task1' }],
      };

      await executor.executeWorkflow(workflow);

      const results = executor.getResults();
      
      // Modify returned array should not affect internal state
      results.push({ stepId: 'fake' });

      expect(executor.results).toHaveLength(1);
      expect(results).toHaveLength(2);
    });

    test('should return results after execution', async () => {
      const workflow = {
        name: 'test',
        steps: [
          { id: 'step1', action: 'task1' },
          { id: 'step2', action: 'task2' },
        ],
      };

      await executor.executeWorkflow(workflow);

      const results = executor.getResults();

      expect(results).toHaveLength(2);
      expect(results[0].stepId).toBe('step1');
      expect(results[1].stepId).toBe('step2');
    });
  });

  describe('reset', () => {
    test('should reset executor to initial state', async () => {
      const workflow = {
        name: 'test',
        steps: [{ id: 'step1', action: 'task1' }],
      };

      await executor.executeWorkflow(workflow);

      executor.reset();

      expect(executor.status).toBe('idle');
      expect(executor.currentWorkflow).toBeNull();
      expect(executor.results).toEqual([]);
      expect(executor.isPaused).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('should handle workflow with single step', async () => {
      const workflow = {
        name: 'single-step',
        steps: [{ id: 'step1', action: 'task1' }],
      };

      const result = await executor.executeWorkflow(workflow);

      expect(result.success).toBe(true);
      expect(result.stepsCompleted).toBe(1);
    });

    test('should handle workflow with many steps', async () => {
      const steps = Array.from({ length: 10 }, (_, i) => ({
        id: `step${i + 1}`,
        action: `task${i + 1}`,
      }));

      const workflow = {
        name: 'many-steps',
        steps,
      };

      const result = await executor.executeWorkflow(workflow);

      expect(result.success).toBe(true);
      expect(result.stepsCompleted).toBe(10);
    });

    test('should handle undefined workflow', async () => {
      await expect(executor.executeWorkflow(undefined)).rejects.toThrow(
        'Workflow is required'
      );
    });
  });

  describe('Performance', () => {
    test('should complete workflow in reasonable time', async () => {
      const workflow = {
        name: 'perf-test',
        steps: [
          { id: 'step1', action: 'task1' },
          { id: 'step2', action: 'task2' },
          { id: 'step3', action: 'task3' },
        ],
      };

      const start = Date.now();
      await executor.executeWorkflow(workflow);
      const duration = Date.now() - start;

      // 3 steps @ 10ms each + overhead < 200ms
      expect(duration).toBeLessThan(200);
    });
  });
});
