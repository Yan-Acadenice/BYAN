const InterviewState = require('../../../src/byan-v2/orchestrator/interview-state');
const SessionState = require('../../../src/byan-v2/context/session-state');
const Logger = require('../../../src/byan-v2/observability/logger');

// Mock Logger
jest.mock('../../../src/byan-v2/observability/logger');

describe('InterviewState - Story 4.2', () => {
  let interviewState;
  let sessionState;
  let mockLogger;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    Logger.mockImplementation(() => mockLogger);

    sessionState = new SessionState();
    interviewState = new InterviewState(sessionState);
  });

  describe('AC1: InterviewState manages 4 phases', () => {
    test('should define 4 phases: Context, Business, Agent Needs, Validation', () => {
      expect(interviewState.PHASES).toEqual({
        CONTEXT: 'CONTEXT',
        BUSINESS: 'BUSINESS',
        AGENT_NEEDS: 'AGENT_NEEDS',
        VALIDATION: 'VALIDATION'
      });
    });

    test('should start in CONTEXT phase', () => {
      expect(interviewState.currentPhase).toBe('CONTEXT');
    });

    test('should have question banks for all phases', () => {
      expect(interviewState.questionBanks).toHaveProperty('CONTEXT');
      expect(interviewState.questionBanks).toHaveProperty('BUSINESS');
      expect(interviewState.questionBanks).toHaveProperty('AGENT_NEEDS');
      expect(interviewState.questionBanks).toHaveProperty('VALIDATION');
    });

    test('should have at least 3 questions per phase', () => {
      Object.values(interviewState.questionBanks).forEach(bank => {
        expect(bank.length).toBeGreaterThanOrEqual(3);
      });
    });

    test('should track current question index', () => {
      expect(interviewState.currentQuestionIndex).toBe(0);
    });

    test('should track phase responses', () => {
      expect(interviewState.phaseResponses).toEqual({
        CONTEXT: [],
        BUSINESS: [],
        AGENT_NEEDS: [],
        VALIDATION: []
      });
    });
  });

  describe('AC2: askNextQuestion() returns next question', () => {
    test('should return first question from CONTEXT phase', () => {
      const question = interviewState.askNextQuestion();
      
      expect(question).toBeDefined();
      expect(question).toHaveProperty('text');
      expect(question).toHaveProperty('phase', 'CONTEXT');
      expect(question).toHaveProperty('questionId');
    });

    test('should include question metadata', () => {
      const question = interviewState.askNextQuestion();
      
      expect(question).toHaveProperty('questionNumber');
      expect(question).toHaveProperty('totalInPhase');
    });

    test('should progress through questions in CONTEXT phase', () => {
      const q1 = interviewState.askNextQuestion();
      interviewState.processResponse('Answer 1');
      
      const q2 = interviewState.askNextQuestion();
      expect(q2.questionId).not.toBe(q1.questionId);
      expect(q2.phase).toBe('CONTEXT');
    });

    test('should transition to BUSINESS phase after CONTEXT complete', () => {
      // Complete CONTEXT phase (3 responses)
      for (let i = 0; i < 3; i++) {
        interviewState.askNextQuestion();
        interviewState.processResponse(`Context answer ${i + 1}`);
      }

      const question = interviewState.askNextQuestion();
      expect(question.phase).toBe('BUSINESS');
      expect(interviewState.currentPhase).toBe('BUSINESS');
    });

    test('should transition through all phases', () => {
      const phases = ['CONTEXT', 'BUSINESS', 'AGENT_NEEDS', 'VALIDATION'];
      
      phases.forEach((expectedPhase, phaseIndex) => {
        for (let i = 0; i < 3; i++) {
          const question = interviewState.askNextQuestion();
          expect(question.phase).toBe(expectedPhase);
          interviewState.processResponse(`${expectedPhase} answer ${i + 1}`);
        }
      });
    });

    test('should return null when interview complete', () => {
      // Complete all 4 phases
      for (let phase = 0; phase < 4; phase++) {
        for (let q = 0; q < 3; q++) {
          interviewState.askNextQuestion();
          interviewState.processResponse(`Answer ${phase}-${q}`);
        }
      }

      const question = interviewState.askNextQuestion();
      expect(question).toBeNull();
    });
  });

  describe('AC3: processResponse() stores and determines phase completion', () => {
    test('should store response in current phase', () => {
      interviewState.askNextQuestion();
      interviewState.processResponse('My project is about AI agents');

      expect(interviewState.phaseResponses.CONTEXT).toHaveLength(1);
      expect(interviewState.phaseResponses.CONTEXT[0].response).toBe('My project is about AI agents');
    });

    test('should store response metadata', () => {
      const question = interviewState.askNextQuestion();
      interviewState.processResponse('Test answer');

      const response = interviewState.phaseResponses.CONTEXT[0];
      expect(response).toHaveProperty('questionId', question.questionId);
      expect(response).toHaveProperty('timestamp');
    });

    test('should increment question index after response', () => {
      interviewState.askNextQuestion();
      const initialIndex = interviewState.currentQuestionIndex;
      
      interviewState.processResponse('Answer');
      
      expect(interviewState.currentQuestionIndex).toBe(initialIndex + 1);
    });

    test('should store responses in SessionState', () => {
      const question = interviewState.askNextQuestion();
      interviewState.processResponse('Test response');

      expect(sessionState.userResponses).toHaveLength(1);
      expect(sessionState.userResponses[0].response).toBe('Test response');
    });

    test('should determine phase completion after min responses', () => {
      // Answer 3 questions in CONTEXT
      for (let i = 0; i < 3; i++) {
        interviewState.askNextQuestion();
        interviewState.processResponse(`Answer ${i}`);
      }

      expect(interviewState.isPhaseComplete('CONTEXT')).toBe(true);
    });

    test('should handle empty responses', () => {
      interviewState.askNextQuestion();
      interviewState.processResponse('');

      expect(interviewState.phaseResponses.CONTEXT).toHaveLength(1);
    });
  });

  describe('AC4: isPhaseComplete() checks phase completeness', () => {
    test('should return false if phase has < 3 responses', () => {
      interviewState.askNextQuestion();
      interviewState.processResponse('Answer 1');

      expect(interviewState.isPhaseComplete('CONTEXT')).toBe(false);
    });

    test('should return false if phase has 2 responses', () => {
      interviewState.askNextQuestion();
      interviewState.processResponse('Answer 1');
      interviewState.askNextQuestion();
      interviewState.processResponse('Answer 2');

      expect(interviewState.isPhaseComplete('CONTEXT')).toBe(false);
    });

    test('should return true if phase has 3 responses (min)', () => {
      for (let i = 0; i < 3; i++) {
        interviewState.askNextQuestion();
        interviewState.processResponse(`Answer ${i + 1}`);
      }

      expect(interviewState.isPhaseComplete('CONTEXT')).toBe(true);
    });

    test('should return true if phase has > 3 responses', () => {
      for (let i = 0; i < 5; i++) {
        interviewState.askNextQuestion();
        interviewState.processResponse(`Answer ${i + 1}`);
      }

      expect(interviewState.isPhaseComplete('CONTEXT')).toBe(true);
    });

    test('should check each phase independently', () => {
      // Complete CONTEXT
      for (let i = 0; i < 3; i++) {
        interviewState.askNextQuestion();
        interviewState.processResponse(`Context ${i}`);
      }

      expect(interviewState.isPhaseComplete('CONTEXT')).toBe(true);
      expect(interviewState.isPhaseComplete('BUSINESS')).toBe(false);
    });
  });

  describe('AC5: canTransitionToAnalysis() validates interview completeness', () => {
    test('should return false if not all phases complete', () => {
      // Only complete CONTEXT
      for (let i = 0; i < 3; i++) {
        interviewState.askNextQuestion();
        interviewState.processResponse(`Answer ${i}`);
      }

      expect(interviewState.canTransitionToAnalysis()).toBe(false);
    });

    test('should return false if 3 phases complete but not all', () => {
      // Complete CONTEXT, BUSINESS, AGENT_NEEDS
      for (let phase = 0; phase < 3; phase++) {
        for (let q = 0; q < 3; q++) {
          interviewState.askNextQuestion();
          interviewState.processResponse(`Answer ${phase}-${q}`);
        }
      }

      expect(interviewState.canTransitionToAnalysis()).toBe(false);
    });

    test('should return true when all 4 phases complete', () => {
      // Complete all phases
      for (let phase = 0; phase < 4; phase++) {
        for (let q = 0; q < 3; q++) {
          interviewState.askNextQuestion();
          interviewState.processResponse(`Answer ${phase}-${q}`);
        }
      }

      expect(interviewState.canTransitionToAnalysis()).toBe(true);
    });

    test('should check minimum responses per phase (3)', () => {
      // Try with 2 responses per phase (insufficient)
      for (let phase = 0; phase < 4; phase++) {
        for (let q = 0; q < 2; q++) {
          interviewState.askNextQuestion();
          interviewState.processResponse(`Answer ${phase}-${q}`);
        }
      }

      expect(interviewState.canTransitionToAnalysis()).toBe(false);
    });
  });

  describe('AC6: Integration with SessionState', () => {
    test('should store questions in SessionState', () => {
      interviewState.askNextQuestion();

      expect(sessionState.questionHistory).toHaveLength(1);
    });

    test('should store responses in SessionState', () => {
      interviewState.askNextQuestion();
      interviewState.processResponse('Test response');

      expect(sessionState.userResponses).toHaveLength(1);
    });

    test('should link responses to questions', () => {
      const question = interviewState.askNextQuestion();
      interviewState.processResponse('My answer');

      const response = sessionState.userResponses[0];
      expect(response.questionId).toBe(question.questionId);
    });

    test('should maintain complete interview history', () => {
      // Complete CONTEXT phase
      for (let i = 0; i < 3; i++) {
        interviewState.askNextQuestion();
        interviewState.processResponse(`Answer ${i}`);
      }

      expect(sessionState.questionHistory).toHaveLength(3);
      expect(sessionState.userResponses).toHaveLength(3);
    });

    test('should preserve SessionState data across operations', () => {
      const initialSessionId = sessionState.sessionId;
      
      interviewState.askNextQuestion();
      interviewState.processResponse('Answer');
      
      expect(sessionState.sessionId).toBe(initialSessionId);
    });
  });

  describe('AC7: Tests validate question flow and phase transitions', () => {
    test('should validate complete interview flow', () => {
      const phases = ['CONTEXT', 'BUSINESS', 'AGENT_NEEDS', 'VALIDATION'];
      let totalQuestions = 0;

      phases.forEach(expectedPhase => {
        for (let i = 0; i < 3; i++) {
          const question = interviewState.askNextQuestion();
          expect(question.phase).toBe(expectedPhase);
          interviewState.processResponse(`${expectedPhase} answer ${i}`);
          totalQuestions++;
        }
      });

      expect(totalQuestions).toBe(12); // 4 phases * 3 questions
      expect(interviewState.canTransitionToAnalysis()).toBe(true);
    });

    test('should prevent premature phase transitions', () => {
      // Only 2 responses in CONTEXT
      for (let i = 0; i < 2; i++) {
        interviewState.askNextQuestion();
        interviewState.processResponse(`Answer ${i}`);
      }

      // Next question should still be CONTEXT
      const question = interviewState.askNextQuestion();
      expect(question.phase).toBe('CONTEXT');
    });

    test('should track phase progression correctly', () => {
      const progressions = [];

      for (let phase = 0; phase < 4; phase++) {
        for (let q = 0; q < 3; q++) {
          const question = interviewState.askNextQuestion();
          progressions.push(question.phase);
          interviewState.processResponse('Answer');
        }
      }

      // Verify phase order
      expect(progressions.slice(0, 3)).toEqual(['CONTEXT', 'CONTEXT', 'CONTEXT']);
      expect(progressions.slice(3, 6)).toEqual(['BUSINESS', 'BUSINESS', 'BUSINESS']);
      expect(progressions.slice(6, 9)).toEqual(['AGENT_NEEDS', 'AGENT_NEEDS', 'AGENT_NEEDS']);
      expect(progressions.slice(9, 12)).toEqual(['VALIDATION', 'VALIDATION', 'VALIDATION']);
    });

    test('should handle interview completion correctly', () => {
      // Complete interview
      for (let phase = 0; phase < 4; phase++) {
        for (let q = 0; q < 3; q++) {
          interviewState.askNextQuestion();
          interviewState.processResponse('Answer');
        }
      }

      expect(interviewState.isInterviewComplete()).toBe(true);
      expect(interviewState.askNextQuestion()).toBeNull();
    });

    test('should maintain question count consistency', () => {
      let questionCount = 0;

      while (interviewState.askNextQuestion()) {
        questionCount++;
        interviewState.processResponse('Answer');
        
        if (questionCount > 50) break; // Safety
      }

      expect(questionCount).toBe(12); // Exactly 4 phases * 3 questions
    });
  });

  describe('Integration: Logger', () => {
    test('should log phase transitions', () => {
      // Complete CONTEXT to trigger transition
      for (let i = 0; i < 3; i++) {
        interviewState.askNextQuestion();
        interviewState.processResponse(`Answer ${i}`);
      }

      // Next question triggers transition to BUSINESS
      interviewState.askNextQuestion();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('phase transition'),
        expect.any(Object)
      );
    });

    test('should log question asks', () => {
      interviewState.askNextQuestion();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('should log response processing', () => {
      interviewState.askNextQuestion();
      interviewState.processResponse('Test');
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Response'),
        expect.any(Object)
      );
    });
  });

  describe('Edge Cases', () => {
    test('should handle null response', () => {
      interviewState.askNextQuestion();
      interviewState.processResponse(null);

      expect(interviewState.phaseResponses.CONTEXT).toHaveLength(1);
    });

    test('should handle undefined response', () => {
      interviewState.askNextQuestion();
      interviewState.processResponse(undefined);

      expect(interviewState.phaseResponses.CONTEXT).toHaveLength(1);
    });

    test('should handle very long responses', () => {
      interviewState.askNextQuestion();
      const longResponse = 'A'.repeat(10000);
      interviewState.processResponse(longResponse);

      expect(interviewState.phaseResponses.CONTEXT[0].response).toBe(longResponse);
    });

    test('should handle special characters in responses', () => {
      interviewState.askNextQuestion();
      interviewState.processResponse('Test <xml> & "quotes" and \'apostrophes\'');

      expect(interviewState.phaseResponses.CONTEXT).toHaveLength(1);
    });

    test('should not allow askNextQuestion without processing previous response', () => {
      const q1 = interviewState.askNextQuestion();
      const q2 = interviewState.askNextQuestion();

      // Should return same question (waiting for response)
      expect(q2.questionId).toBe(q1.questionId);
    });
  });
});
