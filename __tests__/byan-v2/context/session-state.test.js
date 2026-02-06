const SessionState = require('../../../src/byan-v2/context/session-state');

describe('SessionState Manager', () => {
  let sessionState;

  beforeEach(() => {
    sessionState = new SessionState();
  });

  describe('AC1: Class SessionState with properties', () => {
    test('should create instance with required properties', () => {
      expect(sessionState).toHaveProperty('sessionId');
      expect(sessionState).toHaveProperty('currentState');
      expect(sessionState).toHaveProperty('questionHistory');
      expect(sessionState).toHaveProperty('userResponses');
      expect(sessionState).toHaveProperty('analysisResults');
      expect(sessionState).toHaveProperty('agentProfileDraft');
    });

    test('should initialize with valid UUID sessionId', () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(sessionState.sessionId).toMatch(uuidRegex);
    });

    test('should start in INTERVIEW state', () => {
      expect(sessionState.currentState).toBe('INTERVIEW');
    });

    test('should initialize arrays as empty', () => {
      expect(sessionState.questionHistory).toEqual([]);
      expect(sessionState.userResponses).toEqual([]);
    });

    test('should initialize objects as empty', () => {
      expect(sessionState.analysisResults).toEqual({});
      expect(sessionState.agentProfileDraft).toEqual({});
    });
  });

  describe('AC2: CRUD Methods', () => {
    describe('addQuestion()', () => {
      test('should add question to history with timestamp', () => {
        const question = 'What is your project name?';
        const beforeTime = Date.now();
        
        sessionState.addQuestion(question);
        
        const afterTime = Date.now();
        expect(sessionState.questionHistory).toHaveLength(1);
        expect(sessionState.questionHistory[0].question).toBe(question);
        expect(sessionState.questionHistory[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(sessionState.questionHistory[0].timestamp).toBeLessThanOrEqual(afterTime);
      });

      test('should handle multiple questions', () => {
        sessionState.addQuestion('Question 1');
        sessionState.addQuestion('Question 2');
        sessionState.addQuestion('Question 3');
        
        expect(sessionState.questionHistory).toHaveLength(3);
        expect(sessionState.questionHistory[0].question).toBe('Question 1');
        expect(sessionState.questionHistory[2].question).toBe('Question 3');
      });
    });

    describe('addResponse()', () => {
      test('should record user response with timestamp', () => {
        const questionId = 'q1';
        const response = 'My project is BYAN';
        const beforeTime = Date.now();
        
        sessionState.addResponse(questionId, response);
        
        const afterTime = Date.now();
        expect(sessionState.userResponses).toHaveLength(1);
        expect(sessionState.userResponses[0].questionId).toBe(questionId);
        expect(sessionState.userResponses[0].response).toBe(response);
        expect(sessionState.userResponses[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(sessionState.userResponses[0].timestamp).toBeLessThanOrEqual(afterTime);
      });

      test('should handle multiple responses', () => {
        sessionState.addResponse('q1', 'Answer 1');
        sessionState.addResponse('q2', 'Answer 2');
        
        expect(sessionState.userResponses).toHaveLength(2);
      });
    });

    describe('setAnalysisResults()', () => {
      test('should store analysis results', () => {
        const results = {
          agentType: 'specialist',
          complexity: 'medium',
          estimatedTime: '4h'
        };
        
        sessionState.setAnalysisResults(results);
        
        expect(sessionState.analysisResults).toEqual(results);
      });

      test('should overwrite previous analysis results', () => {
        sessionState.setAnalysisResults({ version: 1 });
        sessionState.setAnalysisResults({ version: 2 });
        
        expect(sessionState.analysisResults).toEqual({ version: 2 });
      });
    });

    describe('getCurrentState()', () => {
      test('should return current state', () => {
        expect(sessionState.getCurrentState()).toBe('INTERVIEW');
      });
    });

    describe('transitionTo()', () => {
      test('should change state with valid transition', () => {
        // Prepare: add 5 responses for valid transition
        for (let i = 1; i <= 5; i++) {
          sessionState.addResponse(`q${i}`, `Answer ${i}`);
        }
        
        sessionState.transitionTo('ANALYSIS');
        
        expect(sessionState.getCurrentState()).toBe('ANALYSIS');
      });
    });
  });

  describe('AC3: Transition Validation', () => {
    test('INTERVIEW -> ANALYSIS: valid with >= 5 responses', () => {
      for (let i = 1; i <= 5; i++) {
        sessionState.addResponse(`q${i}`, `Answer ${i}`);
      }
      
      expect(() => {
        sessionState.transitionTo('ANALYSIS');
      }).not.toThrow();
      
      expect(sessionState.getCurrentState()).toBe('ANALYSIS');
    });

    test('INTERVIEW -> ANALYSIS: invalid with < 5 responses', () => {
      sessionState.addResponse('q1', 'Answer 1');
      sessionState.addResponse('q2', 'Answer 2');
      
      expect(() => {
        sessionState.transitionTo('ANALYSIS');
      }).toThrow('Cannot transition from INTERVIEW to ANALYSIS: requires at least 5 responses');
    });

    test('ANALYSIS -> GENERATION: valid with non-empty analysisResults', () => {
      // Setup: move to ANALYSIS state first
      for (let i = 1; i <= 5; i++) {
        sessionState.addResponse(`q${i}`, `Answer ${i}`);
      }
      sessionState.transitionTo('ANALYSIS');
      
      sessionState.setAnalysisResults({ agentType: 'specialist' });
      
      expect(() => {
        sessionState.transitionTo('GENERATION');
      }).not.toThrow();
      
      expect(sessionState.getCurrentState()).toBe('GENERATION');
    });

    test('ANALYSIS -> GENERATION: invalid with empty analysisResults', () => {
      // Setup: move to ANALYSIS state first
      for (let i = 1; i <= 5; i++) {
        sessionState.addResponse(`q${i}`, `Answer ${i}`);
      }
      sessionState.transitionTo('ANALYSIS');
      
      expect(() => {
        sessionState.transitionTo('GENERATION');
      }).toThrow('Cannot transition from ANALYSIS to GENERATION: analysisResults cannot be empty');
    });

    test('should throw error on invalid transition INTERVIEW -> GENERATION', () => {
      expect(() => {
        sessionState.transitionTo('GENERATION');
      }).toThrow('Invalid state transition from INTERVIEW to GENERATION');
    });

    test('should throw error on invalid transition GENERATION -> INTERVIEW', () => {
      // Setup: get to GENERATION state
      for (let i = 1; i <= 5; i++) {
        sessionState.addResponse(`q${i}`, `Answer ${i}`);
      }
      sessionState.transitionTo('ANALYSIS');
      sessionState.setAnalysisResults({ data: 'test' });
      sessionState.transitionTo('GENERATION');
      
      expect(() => {
        sessionState.transitionTo('INTERVIEW');
      }).toThrow('Invalid state transition from GENERATION to INTERVIEW');
    });

    test('should throw error on invalid transition ANALYSIS -> INTERVIEW', () => {
      // Setup: get to ANALYSIS state
      for (let i = 1; i <= 5; i++) {
        sessionState.addResponse(`q${i}`, `Answer ${i}`);
      }
      sessionState.transitionTo('ANALYSIS');
      
      expect(() => {
        sessionState.transitionTo('INTERVIEW');
      }).toThrow('Invalid state transition from ANALYSIS to INTERVIEW');
    });

    test('should throw error on unknown state', () => {
      expect(() => {
        sessionState.transitionTo('INVALID_STATE');
      }).toThrow();
    });
  });

  describe('AC4: Serialization', () => {
    test('toJSON() should serialize all properties', () => {
      sessionState.addQuestion('Q1');
      sessionState.addResponse('q1', 'A1');
      
      const json = sessionState.toJSON();
      
      expect(json).toHaveProperty('sessionId');
      expect(json).toHaveProperty('currentState', 'INTERVIEW');
      expect(json).toHaveProperty('questionHistory');
      expect(json).toHaveProperty('userResponses');
      expect(json).toHaveProperty('analysisResults');
      expect(json).toHaveProperty('agentProfileDraft');
      expect(json.questionHistory).toHaveLength(1);
      expect(json.userResponses).toHaveLength(1);
    });

    test('toJSON() should return plain object, not instance', () => {
      const json = sessionState.toJSON();
      
      expect(json).not.toBeInstanceOf(SessionState);
      expect(typeof json).toBe('object');
    });

    test('fromJSON() should restore state from JSON', () => {
      sessionState.addQuestion('Original Question');
      sessionState.addResponse('q1', 'Original Response');
      for (let i = 2; i <= 5; i++) {
        sessionState.addResponse(`q${i}`, `Response ${i}`);
      }
      sessionState.transitionTo('ANALYSIS');
      sessionState.setAnalysisResults({ test: 'data' });
      
      const json = sessionState.toJSON();
      const restored = SessionState.fromJSON(json);
      
      expect(restored.sessionId).toBe(sessionState.sessionId);
      expect(restored.currentState).toBe('ANALYSIS');
      expect(restored.questionHistory).toEqual(sessionState.questionHistory);
      expect(restored.userResponses).toEqual(sessionState.userResponses);
      expect(restored.analysisResults).toEqual({ test: 'data' });
    });

    test('fromJSON() should return SessionState instance', () => {
      const json = sessionState.toJSON();
      const restored = SessionState.fromJSON(json);
      
      expect(restored).toBeInstanceOf(SessionState);
      expect(typeof restored.addQuestion).toBe('function');
      expect(typeof restored.transitionTo).toBe('function');
    });

    test('fromJSON() should handle empty data', () => {
      const json = {
        sessionId: '12345678-1234-4234-8234-123456789012',
        currentState: 'INTERVIEW',
        questionHistory: [],
        userResponses: [],
        analysisResults: {},
        agentProfileDraft: {}
      };
      
      const restored = SessionState.fromJSON(json);
      
      expect(restored.sessionId).toBe(json.sessionId);
      expect(restored.currentState).toBe('INTERVIEW');
    });
  });

  describe('AC5: Edge Cases & Validation', () => {
    test('should handle empty question string', () => {
      sessionState.addQuestion('');
      
      expect(sessionState.questionHistory).toHaveLength(1);
      expect(sessionState.questionHistory[0].question).toBe('');
    });

    test('should handle null analysis results', () => {
      sessionState.setAnalysisResults(null);
      
      expect(sessionState.analysisResults).toBeNull();
    });

    test('should preserve order of questions and responses', () => {
      sessionState.addQuestion('Q1');
      sessionState.addQuestion('Q2');
      sessionState.addResponse('q1', 'A1');
      sessionState.addResponse('q2', 'A2');
      
      expect(sessionState.questionHistory[0].question).toBe('Q1');
      expect(sessionState.questionHistory[1].question).toBe('Q2');
      expect(sessionState.userResponses[0].response).toBe('A1');
      expect(sessionState.userResponses[1].response).toBe('A2');
    });

    test('should generate unique sessionId for each instance', () => {
      const state1 = new SessionState();
      const state2 = new SessionState();
      
      expect(state1.sessionId).not.toBe(state2.sessionId);
    });
  });
});
