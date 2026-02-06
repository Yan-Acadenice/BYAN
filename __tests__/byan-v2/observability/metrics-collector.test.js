/**
 * MetricsCollector Tests - TDD
 * AC: Track tasksRouted, taskToolCalls, tokens, duration
 * Methods: recordTaskRouting(), recordTaskExecution(), getMetrics()
 */

const MetricsCollector = require('../../../src/byan-v2/observability/metrics-collector');

describe('MetricsCollector', () => {
  let collector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('AC1: Initialization', () => {
    test('should initialize with zero metrics', () => {
      const metrics = collector.getMetrics();

      expect(metrics).toEqual({
        tasksRouted: 0,
        taskToolCalls: 0,
        localExecutions: 0,
        totalTokens: 0,
        totalDuration: 0,
        successfulTasks: 0,
        failedTasks: 0,
        averageDuration: 0,
        averageTokens: 0
      });
    });

    test('should initialize metrics storage', () => {
      expect(collector.metrics).toBeDefined();
      expect(collector.taskHistory).toBeDefined();
      expect(Array.isArray(collector.taskHistory)).toBe(true);
    });
  });

  describe('AC2: recordTaskRouting()', () => {
    test('should increment tasksRouted counter', () => {
      const routingData = {
        executor: 'task-tool',
        complexity: 25
      };

      collector.recordTaskRouting(routingData);

      const metrics = collector.getMetrics();
      expect(metrics.tasksRouted).toBe(1);
    });

    test('should increment taskToolCalls for task-tool executor', () => {
      collector.recordTaskRouting({ executor: 'task-tool' });

      const metrics = collector.getMetrics();
      expect(metrics.taskToolCalls).toBe(1);
      expect(metrics.localExecutions).toBe(0);
    });

    test('should increment localExecutions for local executor', () => {
      collector.recordTaskRouting({ executor: 'local' });

      const metrics = collector.getMetrics();
      expect(metrics.localExecutions).toBe(1);
      expect(metrics.taskToolCalls).toBe(0);
    });

    test('should handle multiple routing records', () => {
      collector.recordTaskRouting({ executor: 'task-tool' });
      collector.recordTaskRouting({ executor: 'task-tool' });
      collector.recordTaskRouting({ executor: 'local' });

      const metrics = collector.getMetrics();
      expect(metrics.tasksRouted).toBe(3);
      expect(metrics.taskToolCalls).toBe(2);
      expect(metrics.localExecutions).toBe(1);
    });

    test('should store routing timestamp', () => {
      const before = Date.now();
      collector.recordTaskRouting({ executor: 'task-tool' });
      const after = Date.now();

      expect(collector.taskHistory.length).toBe(1);
      const timestamp = new Date(collector.taskHistory[0].timestamp).getTime();
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('AC3: recordTaskExecution()', () => {
    test('should record execution duration', () => {
      collector.recordTaskExecution({
        duration: 1500,
        success: true
      });

      const metrics = collector.getMetrics();
      expect(metrics.totalDuration).toBe(1500);
    });

    test('should record token usage', () => {
      collector.recordTaskExecution({
        duration: 1000,
        success: true,
        tokens: 2500
      });

      const metrics = collector.getMetrics();
      expect(metrics.totalTokens).toBe(2500);
    });

    test('should increment successful tasks counter', () => {
      collector.recordTaskExecution({
        duration: 1000,
        success: true
      });

      const metrics = collector.getMetrics();
      expect(metrics.successfulTasks).toBe(1);
      expect(metrics.failedTasks).toBe(0);
    });

    test('should increment failed tasks counter', () => {
      collector.recordTaskExecution({
        duration: 2000,
        success: false,
        error: 'Task failed'
      });

      const metrics = collector.getMetrics();
      expect(metrics.failedTasks).toBe(1);
      expect(metrics.successfulTasks).toBe(0);
    });

    test('should handle multiple execution records', () => {
      collector.recordTaskExecution({
        duration: 1000,
        success: true,
        tokens: 500
      });
      collector.recordTaskExecution({
        duration: 2000,
        success: true,
        tokens: 1500
      });
      collector.recordTaskExecution({
        duration: 500,
        success: false
      });

      const metrics = collector.getMetrics();
      expect(metrics.totalDuration).toBe(3500);
      expect(metrics.totalTokens).toBe(2000);
      expect(metrics.successfulTasks).toBe(2);
      expect(metrics.failedTasks).toBe(1);
    });
  });

  describe('AC4: Average Calculations', () => {
    test('should calculate average duration', () => {
      collector.recordTaskExecution({ duration: 1000, success: true });
      collector.recordTaskExecution({ duration: 2000, success: true });
      collector.recordTaskExecution({ duration: 3000, success: false });

      const metrics = collector.getMetrics();
      expect(metrics.averageDuration).toBe(2000); // (1000 + 2000 + 3000) / 3
    });

    test('should calculate average tokens', () => {
      collector.recordTaskExecution({ duration: 1000, success: true, tokens: 500 });
      collector.recordTaskExecution({ duration: 1000, success: true, tokens: 1500 });
      collector.recordTaskExecution({ duration: 1000, success: true, tokens: 1000 });

      const metrics = collector.getMetrics();
      expect(metrics.averageTokens).toBe(1000); // (500 + 1500 + 1000) / 3
    });

    test('should return 0 average when no tasks executed', () => {
      const metrics = collector.getMetrics();
      expect(metrics.averageDuration).toBe(0);
      expect(metrics.averageTokens).toBe(0);
    });

    test('should handle tasks without token data', () => {
      collector.recordTaskExecution({ duration: 1000, success: true });
      collector.recordTaskExecution({ duration: 1000, success: true, tokens: 1000 });

      const metrics = collector.getMetrics();
      expect(metrics.totalTokens).toBe(1000);
      expect(metrics.averageTokens).toBe(500); // 1000 / 2 tasks
    });
  });

  describe('AC5: getMetrics()', () => {
    test('should return complete metrics object', () => {
      collector.recordTaskRouting({ executor: 'task-tool' });
      collector.recordTaskExecution({
        duration: 1500,
        success: true,
        tokens: 1000
      });

      const metrics = collector.getMetrics();

      expect(metrics).toHaveProperty('tasksRouted');
      expect(metrics).toHaveProperty('taskToolCalls');
      expect(metrics).toHaveProperty('localExecutions');
      expect(metrics).toHaveProperty('totalTokens');
      expect(metrics).toHaveProperty('totalDuration');
      expect(metrics).toHaveProperty('successfulTasks');
      expect(metrics).toHaveProperty('failedTasks');
      expect(metrics).toHaveProperty('averageDuration');
      expect(metrics).toHaveProperty('averageTokens');
    });

    test('should return snapshot of current metrics', () => {
      collector.recordTaskRouting({ executor: 'task-tool' });
      
      const metrics1 = collector.getMetrics();
      expect(metrics1.tasksRouted).toBe(1);

      collector.recordTaskRouting({ executor: 'local' });
      
      const metrics2 = collector.getMetrics();
      expect(metrics2.tasksRouted).toBe(2);
      
      // First snapshot should not change
      expect(metrics1.tasksRouted).toBe(1);
    });
  });

  describe('AC6: reset()', () => {
    test('should reset all metrics to zero', () => {
      collector.recordTaskRouting({ executor: 'task-tool' });
      collector.recordTaskExecution({
        duration: 1500,
        success: true,
        tokens: 1000
      });

      collector.reset();

      const metrics = collector.getMetrics();
      expect(metrics).toEqual({
        tasksRouted: 0,
        taskToolCalls: 0,
        localExecutions: 0,
        totalTokens: 0,
        totalDuration: 0,
        successfulTasks: 0,
        failedTasks: 0,
        averageDuration: 0,
        averageTokens: 0
      });
    });

    test('should clear task history', () => {
      collector.recordTaskRouting({ executor: 'task-tool' });
      collector.recordTaskRouting({ executor: 'local' });

      expect(collector.taskHistory.length).toBe(2);

      collector.reset();

      expect(collector.taskHistory.length).toBe(0);
    });
  });

  describe('AC7: Edge Cases', () => {
    test('should handle null or undefined routing data', () => {
      expect(() => collector.recordTaskRouting(null)).not.toThrow();
      expect(() => collector.recordTaskRouting(undefined)).not.toThrow();

      const metrics = collector.getMetrics();
      expect(metrics.tasksRouted).toBe(0);
    });

    test('should handle null or undefined execution data', () => {
      expect(() => collector.recordTaskExecution(null)).not.toThrow();
      expect(() => collector.recordTaskExecution(undefined)).not.toThrow();

      const metrics = collector.getMetrics();
      expect(metrics.totalDuration).toBe(0);
    });

    test('should handle missing optional fields', () => {
      collector.recordTaskExecution({
        duration: 1000
        // No success, tokens
      });

      const metrics = collector.getMetrics();
      expect(metrics.totalDuration).toBe(1000);
      expect(metrics.totalTokens).toBe(0);
    });

    test('should handle zero duration', () => {
      collector.recordTaskExecution({
        duration: 0,
        success: true
      });

      const metrics = collector.getMetrics();
      expect(metrics.totalDuration).toBe(0);
      expect(metrics.averageDuration).toBe(0);
    });

    test('should handle negative values gracefully', () => {
      collector.recordTaskExecution({
        duration: -100,
        success: true,
        tokens: -50
      });

      const metrics = collector.getMetrics();
      // Should not record negative values
      expect(metrics.totalDuration).toBe(0);
      expect(metrics.totalTokens).toBe(0);
    });
  });

  describe('AC8: Task History Tracking', () => {
    test('should maintain task history', () => {
      collector.recordTaskRouting({
        executor: 'task-tool',
        complexity: 25,
        task: { type: 'explore', prompt: 'Find files' }
      });

      expect(collector.taskHistory.length).toBe(1);
      expect(collector.taskHistory[0]).toHaveProperty('timestamp');
      expect(collector.taskHistory[0]).toHaveProperty('type', 'routing');
    });

    test('should track both routing and execution in history', () => {
      collector.recordTaskRouting({ executor: 'task-tool' });
      collector.recordTaskExecution({ duration: 1000, success: true });

      expect(collector.taskHistory.length).toBe(2);
      expect(collector.taskHistory[0].type).toBe('routing');
      expect(collector.taskHistory[1].type).toBe('execution');
    });
  });
});
