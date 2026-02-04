const EconomicDispatcher = require('../src/core/dispatcher/dispatcher');

describe('EconomicDispatcher', () => {
  let dispatcher;

  beforeEach(() => {
    dispatcher = new EconomicDispatcher();
  });

  describe('dispatch', () => {
    describe('Haiku tasks (simple/fast)', () => {
      test('should route "explore" tasks to haiku', () => {
        expect(dispatcher.dispatch('explore codebase')).toBe('haiku');
        expect(dispatcher.dispatch('Explore the architecture')).toBe('haiku');
      });

      test('should route "simple" tasks to haiku', () => {
        expect(dispatcher.dispatch('simple search operation')).toBe('haiku');
        expect(dispatcher.dispatch('This is a simple task')).toBe('haiku');
      });

      test('should route "quick" tasks to haiku', () => {
        expect(dispatcher.dispatch('quick check of files')).toBe('haiku');
        expect(dispatcher.dispatch('QUICK validation needed')).toBe('haiku');
      });

      test('should route "search" and "find" tasks to haiku', () => {
        expect(dispatcher.dispatch('search for functions')).toBe('haiku');
        expect(dispatcher.dispatch('find all occurrences')).toBe('haiku');
        expect(dispatcher.dispatch('list all files')).toBe('haiku');
      });

      test('should route "read" and "view" tasks to haiku', () => {
        expect(dispatcher.dispatch('read the configuration')).toBe('haiku');
        expect(dispatcher.dispatch('view the logs')).toBe('haiku');
        expect(dispatcher.dispatch('show me the status')).toBe('haiku');
      });
    });

    describe('Sonnet tasks (standard/balanced)', () => {
      test('should route "implement" tasks to sonnet', () => {
        expect(dispatcher.dispatch('implement new feature')).toBe('sonnet');
        expect(dispatcher.dispatch('Implement the API endpoint')).toBe('sonnet');
      });

      test('should route "code" tasks to sonnet', () => {
        expect(dispatcher.dispatch('code the solution')).toBe('sonnet');
        expect(dispatcher.dispatch('write code for authentication')).toBe('sonnet');
      });

      test('should route "complex" tasks to sonnet', () => {
        expect(dispatcher.dispatch('complex algorithm needed')).toBe('sonnet');
        expect(dispatcher.dispatch('handle complex logic')).toBe('sonnet');
      });

      test('should route "develop" and "create" tasks to sonnet', () => {
        expect(dispatcher.dispatch('develop new module')).toBe('sonnet');
        expect(dispatcher.dispatch('create the component')).toBe('sonnet');
        expect(dispatcher.dispatch('build the service')).toBe('sonnet');
      });

      test('should route "fix" and "refactor" tasks to sonnet', () => {
        expect(dispatcher.dispatch('fix the bug in parser')).toBe('sonnet');
        expect(dispatcher.dispatch('refactor legacy code')).toBe('sonnet');
        expect(dispatcher.dispatch('optimize the algorithm')).toBe('sonnet');
      });
    });

    describe('Opus tasks (critical/complex)', () => {
      test('should route "architect" tasks to opus', () => {
        expect(dispatcher.dispatch('architect the system')).toBe('opus');
        expect(dispatcher.dispatch('Architect microservices design')).toBe('opus');
        expect(dispatcher.dispatch('architectural review needed')).toBe('opus');
      });

      test('should route "critical" tasks to opus', () => {
        expect(dispatcher.dispatch('critical security fix')).toBe('opus');
        expect(dispatcher.dispatch('mission-critical deployment')).toBe('opus');
      });

      test('should route "review" and "analyze" tasks to opus', () => {
        expect(dispatcher.dispatch('review the codebase')).toBe('opus');
        expect(dispatcher.dispatch('analyze performance bottlenecks')).toBe('opus');
        expect(dispatcher.dispatch('evaluate the design')).toBe('opus');
      });

      test('should route "security" and "performance" tasks to opus', () => {
        expect(dispatcher.dispatch('security audit required')).toBe('opus');
        expect(dispatcher.dispatch('performance optimization strategy')).toBe('opus');
        expect(dispatcher.dispatch('scalability assessment')).toBe('opus');
      });

      test('should route "system-design" tasks to opus', () => {
        expect(dispatcher.dispatch('system-design for new platform')).toBe('opus');
        expect(dispatcher.dispatch('production deployment plan')).toBe('opus');
      });
    });

    describe('edge cases', () => {
      test('should throw error for invalid task', () => {
        expect(() => dispatcher.dispatch('')).toThrow('Task must be a non-empty string');
        expect(() => dispatcher.dispatch(null)).toThrow('Task must be a non-empty string');
        expect(() => dispatcher.dispatch(123)).toThrow('Task must be a non-empty string');
      });

      test('should default to sonnet for unclassified tasks', () => {
        expect(dispatcher.dispatch('random unknown task')).toBe('sonnet');
        expect(dispatcher.dispatch('xyz abc def')).toBe('sonnet');
      });

      test('should be case-insensitive', () => {
        expect(dispatcher.dispatch('EXPLORE CODEBASE')).toBe('haiku');
        expect(dispatcher.dispatch('Implement Feature')).toBe('sonnet');
        expect(dispatcher.dispatch('ARCHITECT System')).toBe('opus');
      });

      test('should prioritize opus over sonnet when both match', () => {
        // "review" is opus, "code" is sonnet, but opus should win
        expect(dispatcher.dispatch('review the code')).toBe('opus');
        expect(dispatcher.dispatch('analyze the implementation')).toBe('opus');
      });

      test('should prioritize opus over haiku when both match', () => {
        // "critical" is opus, "quick" is haiku, but opus should win
        expect(dispatcher.dispatch('critical quick fix')).toBe('opus');
      });

      test('should handle long task descriptions', () => {
        const longTask = 'We need to explore the entire codebase and understand how everything works in detail';
        expect(dispatcher.dispatch(longTask)).toBe('haiku'); // Contains "explore"
      });
    });
  });

  describe('getModelCost', () => {
    test('should return correct costs for all models', () => {
      expect(dispatcher.getModelCost('haiku')).toBe(1);
      expect(dispatcher.getModelCost('sonnet')).toBe(5);
      expect(dispatcher.getModelCost('opus')).toBe(15);
    });

    test('should throw error for unknown model', () => {
      expect(() => dispatcher.getModelCost('unknown')).toThrow('Unknown model: unknown');
      expect(() => dispatcher.getModelCost('gpt4')).toThrow('Unknown model: gpt4');
    });
  });

  describe('compareCosts', () => {
    test('should compare model costs correctly', () => {
      expect(dispatcher.compareCosts('haiku', 'sonnet')).toBe(1 / 5);
      expect(dispatcher.compareCosts('sonnet', 'haiku')).toBe(5);
      expect(dispatcher.compareCosts('opus', 'haiku')).toBe(15);
      expect(dispatcher.compareCosts('haiku', 'haiku')).toBe(1);
    });

    test('should throw error for invalid models', () => {
      expect(() => dispatcher.compareCosts('invalid', 'haiku')).toThrow();
      expect(() => dispatcher.compareCosts('haiku', 'invalid')).toThrow();
    });
  });

  describe('getAllModels', () => {
    test('should return all models with costs', () => {
      const models = dispatcher.getAllModels();
      expect(models).toEqual({
        haiku: 1,
        sonnet: 5,
        opus: 15
      });
    });

    test('should return a copy, not the original', () => {
      const models = dispatcher.getAllModels();
      models.haiku = 999;
      expect(dispatcher.getModelCost('haiku')).toBe(1); // Original unchanged
    });
  });

  describe('estimateSavings', () => {
    test('should calculate savings when using cheaper model', () => {
      const result = dispatcher.estimateSavings('explore codebase', 'sonnet');
      expect(result.recommended).toBe('haiku');
      expect(result.recommendedCost).toBe(1);
      expect(result.defaultCost).toBe(5);
      expect(result.savingsPercent).toBe(80); // (5-1)/5 = 80%
      expect(result.shouldSwitch).toBe(true);
    });

    test('should calculate negative savings when using more expensive model', () => {
      const result = dispatcher.estimateSavings('architect system', 'sonnet');
      expect(result.recommended).toBe('opus');
      expect(result.recommendedCost).toBe(15);
      expect(result.defaultCost).toBe(5);
      expect(result.savingsPercent).toBe(-200); // (5-15)/5 = -200%
      expect(result.shouldSwitch).toBe(false);
    });

    test('should calculate zero savings for same model', () => {
      const result = dispatcher.estimateSavings('implement feature', 'sonnet');
      expect(result.recommended).toBe('sonnet');
      expect(result.recommendedCost).toBe(5);
      expect(result.defaultCost).toBe(5);
      expect(result.savingsPercent).toBe(0);
      expect(result.shouldSwitch).toBe(false);
    });

    test('should use sonnet as default comparison', () => {
      const result = dispatcher.estimateSavings('quick check');
      expect(result.defaultCost).toBe(5); // Sonnet
    });
  });

  describe('integration scenarios', () => {
    test('should handle typical workflow tasks', () => {
      const tasks = [
        { task: 'explore the codebase structure', expected: 'haiku' },
        { task: 'implement user authentication', expected: 'sonnet' },
        { task: 'review security vulnerabilities', expected: 'opus' },
        { task: 'find all TODO comments', expected: 'haiku' },
        { task: 'refactor legacy module', expected: 'sonnet' },
        { task: 'design scalability strategy', expected: 'opus' }
      ];

      tasks.forEach(({ task, expected }) => {
        expect(dispatcher.dispatch(task)).toBe(expected);
      });
    });

    test('should calculate cost savings for batch operations', () => {
      const tasks = [
        'explore files',
        'quick search',
        'simple list'
      ];

      let totalSavings = 0;
      tasks.forEach(task => {
        const result = dispatcher.estimateSavings(task, 'sonnet');
        totalSavings += result.savingsPercent;
      });

      expect(totalSavings).toBe(240); // 80% * 3 tasks
    });
  });
});
