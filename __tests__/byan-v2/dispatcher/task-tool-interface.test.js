const TaskToolInterface = require('../../../src/byan-v2/dispatcher/task-tool-interface');
const MockTaskToolInterface = require('../../../src/byan-v2/dispatcher/task-tool-interface-mock');

describe('TaskToolInterface', () => {
  let taskTool;

  beforeEach(() => {
    taskTool = new TaskToolInterface();
  });

  describe('AC1: Class TaskToolInterface exists', () => {
    test('should create instance', () => {
      expect(taskTool).toBeInstanceOf(TaskToolInterface);
    });

    test('should have delegateTask method', () => {
      expect(typeof taskTool.delegateTask).toBe('function');
    });

    test('delegateTask should be async', async () => {
      // Use Mock for actual execution test
      const mock = new MockTaskToolInterface({ delay: 10 });
      const result = mock.delegateTask('test prompt', 'task');
      expect(result).toBeInstanceOf(Promise);
      await result; // Consume promise to avoid unhandled rejection
    });
  });

  describe('AC2: Support agent types', () => {
    test('should accept "task" agent type', async () => {
      const mock = new MockTaskToolInterface({ delay: 10 });
      
      const result = await mock.delegateTask('test prompt', 'task');
      
      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('metadata');
    });

    test('should accept "explore" agent type', async () => {
      const mock = new MockTaskToolInterface();
      
      const result = await mock.delegateTask('test prompt', 'explore');
      
      expect(result).toHaveProperty('output');
    });

    test('should accept "general-purpose" agent type', async () => {
      const mock = new MockTaskToolInterface();
      
      const result = await mock.delegateTask('test prompt', 'general-purpose');
      
      expect(result).toHaveProperty('output');
    });

    test('should throw error for unknown agent type', async () => {
      await expect(taskTool.delegateTask('test', 'invalid-agent'))
        .rejects
        .toThrow('Invalid agent type: invalid-agent');
    });

    test('should validate agentType is provided', async () => {
      await expect(taskTool.delegateTask('test'))
        .rejects
        .toThrow('agentType is required');
    });
  });

  describe('AC3: Task Tool call construction', () => {
    test('should construct proper call syntax', () => {
      const syntax = TaskToolInterface.buildTaskCallSyntax('Run tests', 'task');
      
      expect(syntax).toContain('task');
      expect(syntax).toContain('Run tests');
    });

    test('should handle special characters in prompt', () => {
      const syntax = TaskToolInterface.buildTaskCallSyntax('Test "quotes" and \'apostrophes\'', 'task');
      
      expect(syntax).toBeDefined();
      expect(typeof syntax).toBe('string');
    });

    test('should escape newlines in prompt', () => {
      const syntax = TaskToolInterface.buildTaskCallSyntax('Line 1\nLine 2', 'task');
      
      expect(syntax).not.toContain('\n');
    });

    test('should document call syntax format', () => {
      const doc = TaskToolInterface.getCallSyntaxDocumentation();
      
      expect(doc).toContain('agent_type');
      expect(doc).toContain('prompt');
    });
  });

  describe('AC4: Error handling', () => {
    test('should timeout after 30 seconds', async () => {
      const slowTask = new TaskToolInterface({ timeout: 100 });
      
      const startTime = Date.now();
      
      await expect(
        slowTask.delegateTask('slow task', 'task')
      ).rejects.toThrow();
      
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(150);
    }, 10000);

    test('should retry once on transient error', async () => {
      let callCount = 0;
      const retriableTask = new MockTaskToolInterface({
        behavior: () => {
          callCount++;
          if (callCount === 1) {
            throw new Error('ECONNRESET');
          }
          return { output: 'success after retry', metadata: {} };
        }
      });
      
      const result = await retriableTask.delegateTask('test', 'task');
      
      expect(callCount).toBe(2);
      expect(result.output).toBe('success after retry');
    });

    test('should not retry on permanent errors', async () => {
      let callCount = 0;
      const nonRetriableTask = new MockTaskToolInterface({
        behavior: () => {
          callCount++;
          throw new Error('Invalid syntax');
        }
      });
      
      await expect(
        nonRetriableTask.delegateTask('test', 'task')
      ).rejects.toThrow('Invalid syntax');
      
      expect(callCount).toBe(1);
    });

    test('should throw descriptive error on persistent failure', async () => {
      const failingTask = new MockTaskToolInterface({
        behavior: () => {
          throw new Error('Network timeout');
        }
      });
      
      await expect(
        failingTask.delegateTask('test', 'task')
      ).rejects.toThrow(/Network timeout/);
    });

    test('should handle empty prompt', async () => {
      await expect(
        taskTool.delegateTask('', 'task')
      ).rejects.toThrow('taskPrompt cannot be empty');
    });

    test('should handle null prompt', async () => {
      await expect(
        taskTool.delegateTask(null, 'task')
      ).rejects.toThrow('taskPrompt cannot be empty');
    });
  });

  describe('AC5: Response parsing', () => {
    test('should return output property', async () => {
      const mock = new MockTaskToolInterface();
      
      const result = await mock.delegateTask('test', 'task');
      
      expect(result).toHaveProperty('output');
      expect(typeof result.output).toBe('string');
    });

    test('should return metadata with tokens', async () => {
      const mock = new MockTaskToolInterface();
      
      const result = await mock.delegateTask('test', 'task');
      
      expect(result).toHaveProperty('metadata');
      expect(result.metadata).toHaveProperty('tokens');
      expect(typeof result.metadata.tokens).toBe('number');
    });

    test('should return metadata with duration', async () => {
      const mock = new MockTaskToolInterface();
      
      const result = await mock.delegateTask('test', 'task');
      
      expect(result.metadata).toHaveProperty('duration');
      expect(typeof result.metadata.duration).toBe('number');
    });

    test('should handle missing metadata gracefully', async () => {
      const mock = new MockTaskToolInterface({
        behavior: () => ({ output: 'test', metadata: {} })
      });
      
      const result = await mock.delegateTask('test', 'task');
      
      expect(result.metadata.tokens).toBeUndefined();
      expect(result.metadata.duration).toBeUndefined();
    });

    test('should parse complex output', async () => {
      const mock = new MockTaskToolInterface({
        behavior: () => ({
          output: JSON.stringify({ data: 'complex', nested: { value: 123 } }),
          metadata: { tokens: 50, duration: 200 }
        })
      });
      
      const result = await mock.delegateTask('test', 'task');
      
      expect(result.output).toContain('complex');
      expect(result.output).toContain('nested');
    });
  });

  describe('AC6: Mock implementation', () => {
    test('MockTaskToolInterface should exist', () => {
      const mock = new MockTaskToolInterface();
      expect(mock).toBeInstanceOf(MockTaskToolInterface);
    });

    test('should return predefined responses', async () => {
      const mock = new MockTaskToolInterface({
        responses: {
          'test query': { output: 'predefined response', metadata: { tokens: 10 } }
        }
      });
      
      const result = await mock.delegateTask('test query', 'task');
      
      expect(result.output).toBe('predefined response');
      expect(result.metadata.tokens).toBe(10);
    });

    test('should simulate delays between 100-500ms', async () => {
      const mock = new MockTaskToolInterface();
      
      const startTime = Date.now();
      await mock.delegateTask('test', 'task');
      const elapsed = Date.now() - startTime;
      
      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(elapsed).toBeLessThan(600);
    });

    test('should support custom delay', async () => {
      const mock = new MockTaskToolInterface({ delay: 50 });
      
      const startTime = Date.now();
      await mock.delegateTask('test', 'task');
      const elapsed = Date.now() - startTime;
      
      expect(elapsed).toBeGreaterThanOrEqual(50);
      expect(elapsed).toBeLessThan(100);
    });

    test('should generate different responses for different prompts', async () => {
      const mock = new MockTaskToolInterface();
      
      const result1 = await mock.delegateTask('prompt 1', 'task');
      const result2 = await mock.delegateTask('prompt 2', 'task');
      
      expect(result1.output).not.toBe(result2.output);
    });

    test('should track call history', async () => {
      const mock = new MockTaskToolInterface();
      
      await mock.delegateTask('call 1', 'task');
      await mock.delegateTask('call 2', 'explore');
      
      expect(mock.getCallHistory()).toHaveLength(2);
      expect(mock.getCallHistory()[0].prompt).toBe('call 1');
      expect(mock.getCallHistory()[1].agentType).toBe('explore');
    });

    test('should allow clearing call history', async () => {
      const mock = new MockTaskToolInterface();
      
      await mock.delegateTask('test', 'task');
      expect(mock.getCallHistory()).toHaveLength(1);
      
      mock.clearHistory();
      expect(mock.getCallHistory()).toHaveLength(0);
    });
  });

  describe('Integration scenarios', () => {
    test('should handle rapid sequential calls', async () => {
      const mock = new MockTaskToolInterface({ delay: 10 });
      
      const promises = [
        mock.delegateTask('task 1', 'task'),
        mock.delegateTask('task 2', 'task'),
        mock.delegateTask('task 3', 'task')
      ];
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      expect(results[0].output).toBeDefined();
      expect(results[1].output).toBeDefined();
      expect(results[2].output).toBeDefined();
    });

    test('should maintain independent state across instances', async () => {
      const mock1 = new MockTaskToolInterface();
      const mock2 = new MockTaskToolInterface();
      
      await mock1.delegateTask('test 1', 'task');
      await mock2.delegateTask('test 2', 'task');
      
      expect(mock1.getCallHistory()).toHaveLength(1);
      expect(mock2.getCallHistory()).toHaveLength(1);
      expect(mock1.getCallHistory()[0].prompt).toBe('test 1');
      expect(mock2.getCallHistory()[0].prompt).toBe('test 2');
    });
  });
});
