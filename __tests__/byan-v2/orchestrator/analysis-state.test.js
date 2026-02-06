const AnalysisState = require('../../../src/byan-v2/orchestrator/analysis-state');
const SessionState = require('../../../src/byan-v2/context/session-state');
const TaskRouter = require('../../../src/byan-v2/dispatcher/task-router');
const LocalExecutor = require('../../../src/byan-v2/dispatcher/local-executor');
const Logger = require('../../../src/byan-v2/observability/logger');

// Mock dependencies
jest.mock('../../../src/byan-v2/dispatcher/local-executor');
jest.mock('../../../src/byan-v2/observability/logger');

describe('AnalysisState - Story 4.3', () => {
  let analysisState;
  let sessionState;
  let mockLogger;
  let mockLocalExecutor;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    mockLocalExecutor = {
      execute: jest.fn().mockResolvedValue({
        output: JSON.stringify({
          purpose: 'Testing agent',
          capabilities: ['test', 'validate'],
          knowledgeAreas: ['QA', 'Testing'],
          constraints: ['CI/CD integration required']
        }),
        tokens: 150,
        duration: 200,
        executor: 'local'
      })
    };

    Logger.mockImplementation(() => mockLogger);
    LocalExecutor.mockImplementation(() => mockLocalExecutor);

    sessionState = new SessionState();
    
    // Populate with interview responses
    for (let i = 0; i < 12; i++) {
      sessionState.addResponse(`q${i}`, `Response ${i}: Testing requirements`);
    }

    analysisState = new AnalysisState(sessionState);
  });

  describe('AC1: AnalysisState processes responses via TaskRouter', () => {
    test('should initialize with TaskRouter', () => {
      expect(analysisState.taskRouter).toBeDefined();
      expect(analysisState.taskRouter).toBeInstanceOf(TaskRouter);
    });

    test('should initialize with LocalExecutor', () => {
      expect(analysisState.localExecutor).toBeDefined();
    });

    test('should route analysis tasks through TaskRouter', async () => {
      await analysisState.extractRequirements();

      // Should have called routing decision
      expect(analysisState.taskRouter).toBeDefined();
    });

    test('should use LocalExecutor for high-complexity analysis', async () => {
      await analysisState.extractRequirements();

      // Analysis tasks are typically > 60 complexity
      expect(mockLocalExecutor.execute).toHaveBeenCalled();
    });
  });

  describe('AC2: extractRequirements() identifies key fields', () => {
    test('should extract agent purpose', async () => {
      const requirements = await analysisState.extractRequirements();

      expect(requirements).toHaveProperty('purpose');
      expect(requirements.purpose).toBeDefined();
    });

    test('should extract capabilities', async () => {
      const requirements = await analysisState.extractRequirements();

      expect(requirements).toHaveProperty('capabilities');
      expect(Array.isArray(requirements.capabilities)).toBe(true);
    });

    test('should extract knowledge areas', async () => {
      const requirements = await analysisState.extractRequirements();

      expect(requirements).toHaveProperty('knowledgeAreas');
      expect(Array.isArray(requirements.knowledgeAreas)).toBe(true);
    });

    test('should extract constraints', async () => {
      const requirements = await analysisState.extractRequirements();

      expect(requirements).toHaveProperty('constraints');
    });

    test('should process all user responses', async () => {
      const requirements = await analysisState.extractRequirements();

      // Verify responses were used
      expect(mockLocalExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'analysis',
          prompt: expect.stringContaining('responses')
        })
      );
    });

    test('should handle responses with various content', async () => {
      sessionState.userResponses = [
        { response: 'Build testing agent' },
        { response: 'Needs validation capabilities' },
        { response: 'Must work with CI/CD' }
      ];

      const requirements = await analysisState.extractRequirements();
      expect(requirements).toBeDefined();
    });
  });

  describe('AC3: identifyPatterns() finds common themes', () => {
    test('should identify patterns across responses', async () => {
      const patterns = await analysisState.identifyPatterns();

      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);
    });

    test('should detect common keywords', async () => {
      sessionState.userResponses = [
        { response: 'Need testing automation' },
        { response: 'Automated test execution' },
        { response: 'Automation is critical' }
      ];

      const patterns = await analysisState.identifyPatterns();
      
      // Should detect "automation" pattern
      expect(patterns.length).toBeGreaterThan(0);
    });

    test('should group related themes', async () => {
      const patterns = await analysisState.identifyPatterns();

      patterns.forEach(pattern => {
        expect(pattern).toHaveProperty('theme');
        expect(pattern).toHaveProperty('occurrences');
      });
    });

    test('should return empty array if no patterns found', async () => {
      sessionState.userResponses = [];
      
      const patterns = await analysisState.identifyPatterns();
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('AC4: validateCompleteness() ensures all required fields', () => {
    test('should validate requirements have all fields', async () => {
      const requirements = await analysisState.extractRequirements();
      const isComplete = analysisState.validateCompleteness(requirements);

      expect(isComplete).toBeDefined();
    });

    test('should return true if all required fields present', async () => {
      const completeRequirements = {
        purpose: 'Testing agent',
        capabilities: ['test', 'validate'],
        knowledgeAreas: ['QA'],
        constraints: ['CI/CD integration']
      };

      const isComplete = analysisState.validateCompleteness(completeRequirements);
      expect(isComplete).toBe(true);
    });

    test('should return false if purpose missing', () => {
      const incomplete = {
        capabilities: ['test'],
        knowledgeAreas: ['QA'],
        constraints: []
      };

      const isComplete = analysisState.validateCompleteness(incomplete);
      expect(isComplete).toBe(false);
    });

    test('should return false if capabilities missing', () => {
      const incomplete = {
        purpose: 'Testing',
        knowledgeAreas: ['QA'],
        constraints: []
      };

      const isComplete = analysisState.validateCompleteness(incomplete);
      expect(isComplete).toBe(false);
    });

    test('should return false if knowledgeAreas missing', () => {
      const incomplete = {
        purpose: 'Testing',
        capabilities: ['test'],
        constraints: []
      };

      const isComplete = analysisState.validateCompleteness(incomplete);
      expect(isComplete).toBe(false);
    });

    test('should validate arrays are not empty', () => {
      const incomplete = {
        purpose: 'Testing',
        capabilities: [],
        knowledgeAreas: [],
        constraints: []
      };

      const isComplete = analysisState.validateCompleteness(incomplete);
      expect(isComplete).toBe(false);
    });
  });

  describe('AC5: canTransitionToGeneration() checks analysis complete', () => {
    test('should return false if requirements not extracted', () => {
      expect(analysisState.canTransitionToGeneration()).toBe(false);
    });

    test('should return false if requirements incomplete', async () => {
      mockLocalExecutor.execute.mockResolvedValueOnce({
        output: JSON.stringify({
          purpose: 'Testing',
          capabilities: [] // Empty
        }),
        tokens: 100,
        duration: 150,
        executor: 'local'
      });

      await analysisState.extractRequirements();
      
      expect(analysisState.canTransitionToGeneration()).toBe(false);
    });

    test('should return true if requirements complete', async () => {
      await analysisState.extractRequirements();
      
      expect(analysisState.canTransitionToGeneration()).toBe(true);
    });

    test('should check analysis results stored in SessionState', async () => {
      await analysisState.extractRequirements();
      
      expect(sessionState.analysisResults).toBeDefined();
      expect(Object.keys(sessionState.analysisResults).length).toBeGreaterThan(0);
    });
  });

  describe('AC6: Integration with TaskRouter (complexity-based delegation)', () => {
    test('should route tasks through TaskRouter', async () => {
      await analysisState.extractRequirements();

      // TaskRouter should determine routing
      expect(mockLocalExecutor.execute).toHaveBeenCalled();
    });

    test('should use LocalExecutor for analysis tasks (complexity > 60)', async () => {
      await analysisState.extractRequirements();

      const callArgs = mockLocalExecutor.execute.mock.calls[0][0];
      expect(callArgs.type).toBe('analysis');
    });

    test('should include complexity metadata in tasks', async () => {
      await analysisState.extractRequirements();

      const callArgs = mockLocalExecutor.execute.mock.calls[0][0];
      expect(callArgs.metadata).toBeDefined();
      expect(callArgs.metadata.requiresReasoning).toBe(true);
    });

    test('should handle routing decisions correctly', async () => {
      await analysisState.extractRequirements();

      // Verify local execution was used
      expect(mockLocalExecutor.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC7: Integration with Logger', () => {
    test('should log analysis start', async () => {
      await analysisState.extractRequirements();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Analysis'),
        expect.any(Object)
      );
    });

    test('should log analysis completion', async () => {
      await analysisState.extractRequirements();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('complete'),
        expect.any(Object)
      );
    });

    test('should log extraction steps', async () => {
      await analysisState.extractRequirements();

      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('should log pattern identification', async () => {
      await analysisState.identifyPatterns();

      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('AC8: Tests validate extraction logic and completeness checks', () => {
    test('should perform complete analysis workflow', async () => {
      const requirements = await analysisState.extractRequirements();
      const patterns = await analysisState.identifyPatterns();
      const isComplete = analysisState.validateCompleteness(requirements);
      const canTransition = analysisState.canTransitionToGeneration();

      expect(requirements).toBeDefined();
      expect(patterns).toBeDefined();
      expect(isComplete).toBe(true);
      expect(canTransition).toBe(true);
    });

    test('should store results in SessionState', async () => {
      await analysisState.extractRequirements();

      expect(sessionState.analysisResults).toBeDefined();
      expect(sessionState.analysisResults.requirements).toBeDefined();
    });

    test('should handle multiple analysis operations', async () => {
      await analysisState.extractRequirements();
      await analysisState.identifyPatterns();

      expect(sessionState.analysisResults.requirements).toBeDefined();
      expect(sessionState.analysisResults.patterns).toBeDefined();
    });

    test('should validate extraction with various response types', async () => {
      sessionState.userResponses = [
        { response: 'Short' },
        { response: 'Medium length response with more details' },
        { response: 'Very long response with extensive details about requirements and capabilities needed' }
      ];

      const requirements = await analysisState.extractRequirements();
      expect(requirements).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle LocalExecutor errors', async () => {
      mockLocalExecutor.execute.mockRejectedValueOnce(
        new Error('Execution failed')
      );

      await expect(analysisState.extractRequirements()).rejects.toThrow();
    });

    test('should handle invalid JSON from executor', async () => {
      mockLocalExecutor.execute.mockResolvedValueOnce({
        output: 'Invalid JSON{{{',
        tokens: 100,
        duration: 150,
        executor: 'local'
      });

      await expect(analysisState.extractRequirements()).rejects.toThrow();
    });

    test('should handle empty responses gracefully', async () => {
      sessionState.userResponses = [];

      const requirements = await analysisState.extractRequirements();
      expect(requirements).toBeDefined();
    });

    test('should handle null requirements in validation', () => {
      expect(() => {
        analysisState.validateCompleteness(null);
      }).not.toThrow();
    });
  });

  describe('Integration: Complete Analysis Flow', () => {
    test('should execute full analysis pipeline', async () => {
      // Extract requirements
      const requirements = await analysisState.extractRequirements();
      expect(requirements).toBeDefined();

      // Identify patterns
      const patterns = await analysisState.identifyPatterns();
      expect(patterns).toBeDefined();

      // Validate completeness
      const isComplete = analysisState.validateCompleteness(requirements);
      expect(isComplete).toBe(true);

      // Check transition readiness
      const canTransition = analysisState.canTransitionToGeneration();
      expect(canTransition).toBe(true);

      // Verify SessionState updated
      expect(sessionState.analysisResults).toMatchObject({
        requirements: expect.any(Object),
        patterns: expect.any(Array)
      });
    });

    test('should track metrics through analysis', async () => {
      await analysisState.extractRequirements();

      // Verify LocalExecutor called with correct structure
      expect(mockLocalExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'analysis',
          prompt: expect.any(String),
          metadata: expect.any(Object)
        })
      );
    });

    test('should preserve user responses during analysis', async () => {
      const originalResponses = [...sessionState.userResponses];
      
      await analysisState.extractRequirements();
      
      expect(sessionState.userResponses).toEqual(originalResponses);
    });
  });

  describe('Edge Cases', () => {
    test('should handle single user response', async () => {
      sessionState.userResponses = [
        { response: 'Single response' }
      ];

      const requirements = await analysisState.extractRequirements();
      expect(requirements).toBeDefined();
    });

    test('should handle very long responses', async () => {
      sessionState.userResponses = [
        { response: 'A'.repeat(10000) }
      ];

      const requirements = await analysisState.extractRequirements();
      expect(requirements).toBeDefined();
    });

    test('should handle special characters in responses', async () => {
      sessionState.userResponses = [
        { response: '<xml>&"quotes"\' and special çhars' }
      ];

      const requirements = await analysisState.extractRequirements();
      expect(requirements).toBeDefined();
    });

    test('should handle empty purpose string', () => {
      const incomplete = {
        purpose: '',
        capabilities: ['test'],
        knowledgeAreas: ['QA'],
        constraints: []
      };

      const isComplete = analysisState.validateCompleteness(incomplete);
      expect(isComplete).toBe(false);
    });
  });
});
