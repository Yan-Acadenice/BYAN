const ByanV2 = require('../../../src/byan-v2');
const SessionState = require('../../../src/byan-v2/context/session-state');
const StateMachine = require('../../../src/byan-v2/orchestrator/state-machine');

describe('System Integration', () => {
  describe('ByanV2 initialization', () => {
    it('should create ByanV2 instance with default config', () => {
      const byan = new ByanV2();

      expect(byan).toBeDefined();
      expect(byan.sessionState).toBeInstanceOf(SessionState);
      expect(byan.stateMachine).toBeInstanceOf(StateMachine);
    });

    it('should initialize with custom config', () => {
      const config = {
        sessionId: 'test-session',
        maxQuestions: 10,
        outputDir: '/tmp/test'
      };

      const byan = new ByanV2(config);

      expect(byan.config.sessionId).toBe('test-session');
      expect(byan.config.maxQuestions).toBe(10);
    });

    it('should have all required components', () => {
      const byan = new ByanV2();

      expect(byan.sessionState).toBeDefined();
      expect(byan.dispatcher).toBeDefined();
      expect(byan.stateMachine).toBeDefined();
      expect(byan.logger).toBeDefined();
      expect(byan.metrics).toBeDefined();
    });

    it('should support dependency injection', () => {
      const mockSessionState = { sessionId: 'mock' };
      const mockStateMachine = { currentState: 'MOCK' };

      const byan = new ByanV2({
        sessionState: mockSessionState,
        stateMachine: mockStateMachine
      });

      expect(byan.sessionState).toBe(mockSessionState);
      expect(byan.stateMachine).toBe(mockStateMachine);
    });
  });

  describe('Configuration loading', () => {
    it('should load default configuration', () => {
      const byan = new ByanV2();

      expect(byan.config).toBeDefined();
      expect(byan.config.maxQuestions).toBe(12);
      expect(byan.config.complexityThresholds).toBeDefined();
    });

    it('should merge custom config with defaults', () => {
      const byan = new ByanV2({ maxQuestions: 20 });

      expect(byan.config.maxQuestions).toBe(20);
      expect(byan.config.complexityThresholds).toBeDefined();
    });

    it('should have valid default thresholds', () => {
      const byan = new ByanV2();

      expect(byan.config.complexityThresholds.low).toBe(30);
      expect(byan.config.complexityThresholds.medium).toBe(60);
    });
  });

  describe('Environment detection', () => {
    it('should detect Copilot CLI context', () => {
      process.env.GITHUB_COPILOT = 'true';

      const byan = new ByanV2();

      expect(byan.isCopilotContext()).toBe(true);

      delete process.env.GITHUB_COPILOT;
    });

    it('should fallback to standalone mode', () => {
      delete process.env.GITHUB_COPILOT;

      const byan = new ByanV2();

      expect(byan.isCopilotContext()).toBe(false);
    });

    it('should adapt behavior based on environment', () => {
      const copilotByan = new ByanV2({ env: 'copilot' });
      const standaloneByan = new ByanV2({ env: 'standalone' });

      expect(copilotByan.config.env).toBe('copilot');
      expect(standaloneByan.config.env).toBe('standalone');
    });
  });

  describe('Complete workflow integration', () => {
    it('should start new session', async () => {
      const byan = new ByanV2();

      await byan.startSession();

      expect(byan.sessionState.sessionId).toBeDefined();
      expect(byan.stateMachine.getCurrentState().name).toBe('INTERVIEW');
    });

    it('should process user response', async () => {
      const byan = new ByanV2();
      await byan.startSession();

      const question = await byan.getNextQuestion();
      expect(question).toBeDefined();

      await byan.submitResponse('Test response');

      expect(byan.sessionState.questionHistory.length).toBe(1);
      expect(byan.sessionState.userResponses.length).toBe(1);
    });

    it('should transition through states', async () => {
      const byan = new ByanV2();
      await byan.startSession();

      expect(byan.stateMachine.getCurrentState().name).toBe('INTERVIEW');

      for (let i = 0; i < 12; i++) {
        await byan.submitResponse(`Response ${i + 1}`);
      }

      const state = byan.stateMachine.getCurrentState().name;
      expect(['ANALYSIS', 'GENERATION', 'COMPLETED']).toContain(state);
    });

    it('should generate agent profile', async () => {
      const byan = new ByanV2();
      await byan.startSession();

      for (let i = 0; i < 12; i++) {
        await byan.submitResponse(`Response ${i + 1}`);
      }

      const profile = await byan.generateProfile();

      expect(profile).toBeDefined();
      expect(profile).toContain('name:');
      expect(profile).toContain('description:');
    });

    it('should complete full workflow in under 60s', async () => {
      const startTime = Date.now();
      const byan = new ByanV2();

      await byan.startSession();

      for (let i = 0; i < 12; i++) {
        await byan.submitResponse(`Response ${i + 1}`);
      }

      await byan.generateProfile();

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(60000);
    }, 65000);
  });

  describe('Error handling', () => {
    it('should handle invalid state transitions', async () => {
      const byan = new ByanV2();

      await expect(byan.generateProfile()).rejects.toThrow();
    });

    it('should validate responses', async () => {
      const byan = new ByanV2();
      await byan.startSession();

      await expect(byan.submitResponse('')).rejects.toThrow('Response cannot be empty');
    });

    it('should track errors in metrics', async () => {
      const byan = new ByanV2();

      try {
        await byan.generateProfile();
      } catch (e) {
        // Expected error
      }

      expect(byan.metrics.counters.errors).toBeGreaterThan(0);
    });
  });

  describe('Metrics tracking', () => {
    it('should track session metrics', async () => {
      const byan = new ByanV2();
      await byan.startSession();

      expect(byan.metrics.counters.sessionsStarted).toBe(1);
    });

    it('should track questions asked', async () => {
      const byan = new ByanV2();
      await byan.startSession();

      await byan.getNextQuestion();
      await byan.submitResponse('Test');

      expect(byan.metrics.counters.questionsAsked).toBeGreaterThan(0);
    });

    it('should provide metrics summary', async () => {
      const byan = new ByanV2();
      await byan.startSession();

      const summary = byan.getMetricsSummary();

      expect(summary).toHaveProperty('totalSessions');
      expect(summary).toHaveProperty('avgQuestionsPerSession');
    });
  });

  describe('Logging', () => {
    it('should log state transitions', async () => {
      const logs = [];
      const mockLogger = {
        info: (msg, data) => logs.push({ level: 'info', msg, data })
      };

      const byan = new ByanV2({ logger: mockLogger });
      await byan.startSession();

      const stateTransitionLog = logs.find(log => 
        log.data && log.data.event === 'state_transition'
      );

      expect(stateTransitionLog).toBeDefined();
    });

    it('should sanitize sensitive data in logs', async () => {
      const logs = [];
      const mockLogger = {
        info: (msg, data) => logs.push({ level: 'info', msg, data })
      };

      const byan = new ByanV2({ logger: mockLogger });
      await byan.startSession();

      const longResponse = 'A'.repeat(200);
      await byan.submitResponse(longResponse);

      logs.forEach(log => {
        if (log.data && log.data.response) {
          expect(log.data.response.length).toBeLessThanOrEqual(100);
        }
      });
    });
  });

  describe('Cleanup', () => {
    it('should cleanup on session end', async () => {
      const byan = new ByanV2();
      await byan.startSession();

      await byan.endSession();

      expect(byan.stateMachine.getCurrentState().name).toBe('COMPLETED');
    });

    it('should provide session summary', async () => {
      const byan = new ByanV2();
      await byan.startSession();

      for (let i = 0; i < 5; i++) {
        await byan.submitResponse(`Response ${i + 1}`);
      }

      const summary = await byan.getSessionSummary();

      expect(summary.questionsAsked).toBe(5);
      expect(summary.state).toBeDefined();
    });
  });
});
