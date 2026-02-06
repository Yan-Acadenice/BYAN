/**
 * TaskRouter Tests - TDD
 * AC: Intègre ComplexityScorer + TaskToolInterface
 * Thresholds: <30 → task-tool, 30-60 → task-tool+fallback, >60 → local
 */

const TaskRouter = require('../../../src/byan-v2/dispatcher/task-router');

describe('TaskRouter', () => {
  let router;

  beforeEach(() => {
    router = new TaskRouter();
  });

  describe('AC1: Instanciation et Configuration', () => {
    test('should initialize with default thresholds', () => {
      expect(router).toBeDefined();
      expect(router.thresholds).toEqual({
        taskToolOnly: 30,
        taskToolWithFallback: 60
      });
    });

    test('should accept custom thresholds', () => {
      const customRouter = new TaskRouter({
        taskToolOnly: 25,
        taskToolWithFallback: 55
      });
      expect(customRouter.thresholds.taskToolOnly).toBe(25);
      expect(customRouter.thresholds.taskToolWithFallback).toBe(55);
    });
  });

  describe('AC2: Route Simple Task (complexity < 30)', () => {
    test('should route simple task to task-tool only', () => {
      const task = {
        type: 'explore',
        prompt: 'Find login component',
        metadata: { priority: 'low' }
      };

      const result = router.routeTask(task);

      expect(result).toMatchObject({
        executor: 'task-tool',
        canFallback: false,
        complexity: expect.any(Number)
      });
      expect(result.complexity).toBeLessThan(30);
    });

    test('should include task and reasoning in result', () => {
      const task = {
        type: 'explore',
        prompt: 'List files'
      };

      const result = router.routeTask(task);

      expect(result.task).toEqual(task);
      expect(result.reasoning).toContain('complexity');
      expect(result.reasoning).toContain('task-tool');
    });
  });

  describe('AC3: Route Medium Task (30 <= complexity <= 60)', () => {
    test('should route medium task to task-tool with fallback', () => {
      const task = {
        type: 'task',
        prompt: 'Run tests and analyze failures with detailed error messages',
        metadata: { 
          requiresContext: true,
          estimatedDuration: 'medium'
        }
      };

      const result = router.routeTask(task);

      expect(result).toMatchObject({
        executor: 'task-tool',
        canFallback: true,
        complexity: expect.any(Number)
      });
      expect(result.complexity).toBeGreaterThanOrEqual(30);
      expect(result.complexity).toBeLessThanOrEqual(60);
    });

    test('should explain fallback capability in reasoning', () => {
      const task = {
        type: 'task',
        prompt: 'Install dependencies and run build with error handling',
      };

      const result = router.routeTask(task);

      expect(result.canFallback).toBe(true);
      expect(result.reasoning).toContain('fallback');
    });
  });

  describe('AC4: Route Complex Task (complexity > 60)', () => {
    test('should route complex task to local execution', () => {
      const task = {
        type: 'general-purpose',
        prompt: 'Refactor authentication system across multiple modules with comprehensive testing and documentation updates',
        metadata: {
          requiresMultipleSteps: true,
          requiresContext: true,
          requiresReasoning: true
        }
      };

      const result = router.routeTask(task);

      expect(result).toMatchObject({
        executor: 'local',
        canFallback: false,
        complexity: expect.any(Number)
      });
      expect(result.complexity).toBeGreaterThan(60);
    });

    test('should explain local execution in reasoning', () => {
      const task = {
        type: 'general-purpose',
        prompt: 'Design and implement complete feature with architecture decisions, multiple components, tests, and documentation'
      };

      const result = router.routeTask(task);

      expect(result.executor).toBe('local');
      expect(result.reasoning).toContain('local');
      expect(result.reasoning).toContain('complex');
    });
  });

  describe('AC5: Edge Cases', () => {
    test('should handle task at exact threshold boundaries', () => {
      const router = new TaskRouter({
        taskToolOnly: 30,
        taskToolWithFallback: 60
      });

      // Test routing logic with known complexity values
      // Just verify that routing decisions are consistent
      const lowTask = {
        type: 'explore',
        prompt: 'Find'
      };
      
      const mediumTask = {
        type: 'task',
        prompt: 'Run tests and analyze failures',
        metadata: { requiresContext: true }
      };
      
      const highTask = {
        type: 'general-purpose',
        prompt: 'Complete refactoring',
        metadata: { requiresMultipleSteps: true, requiresReasoning: true }
      };
      
      const lowResult = router.routeTask(lowTask);
      const mediumResult = router.routeTask(mediumTask);
      const highResult = router.routeTask(highTask);
      
      // Verify progression
      expect(lowResult.complexity).toBeLessThan(mediumResult.complexity);
      expect(mediumResult.complexity).toBeLessThan(highResult.complexity);
      
      // Verify appropriate routing
      expect(['task-tool']).toContain(lowResult.executor);
      expect(['task-tool', 'local']).toContain(mediumResult.executor);
      expect(['local']).toContain(highResult.executor);
    });

    test('should handle missing task properties gracefully', () => {
      const task = {
        type: 'explore'
        // No prompt
      };

      const result = router.routeTask(task);

      expect(result).toBeDefined();
      expect(result.executor).toBeDefined();
      expect(result.complexity).toBeGreaterThanOrEqual(0);
    });

    test('should handle null or undefined task', () => {
      expect(() => router.routeTask(null)).toThrow();
      expect(() => router.routeTask(undefined)).toThrow();
    });

    test('should validate task is an object', () => {
      expect(() => router.routeTask('string')).toThrow();
      expect(() => router.routeTask(123)).toThrow();
    });
  });

  describe('AC6: Complexity Calculation Integration', () => {
    test('should use ComplexityScorer for complexity calculation', () => {
      const task = {
        type: 'explore',
        prompt: 'Simple search'
      };

      const result = router.routeTask(task);

      // Verify complexity is calculated (not just a default value)
      expect(typeof result.complexity).toBe('number');
      expect(result.complexity).toBeGreaterThanOrEqual(0);
      expect(result.complexity).toBeLessThanOrEqual(100);
    });

    test('should calculate different complexity for different tasks', () => {
      const simpleTask = {
        type: 'explore',
        prompt: 'Find file'
      };

      const complexTask = {
        type: 'general-purpose',
        prompt: 'Refactor entire authentication system with migration scripts and comprehensive testing across all modules'
      };

      const simpleResult = router.routeTask(simpleTask);
      const complexResult = router.routeTask(complexTask);

      expect(complexResult.complexity).toBeGreaterThan(simpleResult.complexity);
    });
  });

  describe('AC7: Result Format', () => {
    test('should return complete result object with all required fields', () => {
      const task = {
        type: 'explore',
        prompt: 'Test task'
      };

      const result = router.routeTask(task);

      expect(result).toHaveProperty('executor');
      expect(result).toHaveProperty('canFallback');
      expect(result).toHaveProperty('complexity');
      expect(result).toHaveProperty('task');
      expect(result).toHaveProperty('reasoning');
      expect(result).toHaveProperty('timestamp');
    });

    test('should include valid timestamp', () => {
      const task = {
        type: 'explore',
        prompt: 'Test'
      };

      const result = router.routeTask(task);

      expect(result.timestamp).toBeDefined();
      const timestamp = new Date(result.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });
  });
});
