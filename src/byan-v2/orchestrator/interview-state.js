/**
 * InterviewState - Story 4.2
 * Manages structured interview flow through 4 phases
 * 
 * Phases:
 * 1. CONTEXT: Project context, domain, users
 * 2. BUSINESS: Goals, problems, success criteria
 * 3. AGENT_NEEDS: Agent capabilities, behavior, constraints
 * 4. VALIDATION: Confirm understanding, clarifications
 * 
 * Integrates with SessionState to persist interview data
 */

const Logger = require('../observability/logger');
const crypto = require('crypto');

class InterviewState {
  constructor(sessionState) {
    this.sessionState = sessionState;
    this.logger = new Logger();

    // AC1: Define 4 phases
    this.PHASES = {
      CONTEXT: 'CONTEXT',
      BUSINESS: 'BUSINESS',
      AGENT_NEEDS: 'AGENT_NEEDS',
      VALIDATION: 'VALIDATION'
    };

    // Current interview state
    this.currentPhase = this.PHASES.CONTEXT;
    this.currentQuestionIndex = 0;
    this.awaitingResponse = false;
    this.lastAskedQuestion = null;

    // AC4: Track responses per phase
    this.phaseResponses = {
      CONTEXT: [],
      BUSINESS: [],
      AGENT_NEEDS: [],
      VALIDATION: []
    };

    // AC1: Question banks for each phase (min 3 per phase)
    this.questionBanks = {
      CONTEXT: [
        'What is the main purpose or domain of your project?',
        'Who are the primary users or stakeholders?',
        'What is the current workflow or process this agent will support?',
        'What technologies or platforms are you using?',
        'What is the scale or scope of your project?'
      ],
      BUSINESS: [
        'What specific problem or challenge does this agent need to solve?',
        'What are the key goals or objectives for this agent?',
        'How will you measure the success of this agent?',
        'What are the most time-consuming or error-prone tasks currently?',
        'What business value or ROI do you expect?'
      ],
      AGENT_NEEDS: [
        'What specific capabilities should this agent have?',
        'What knowledge or expertise should the agent possess?',
        'How should the agent interact with users (tone, style, format)?',
        'What are the critical constraints or limitations for the agent?',
        'What level of autonomy should the agent have in decision-making?'
      ],
      VALIDATION: [
        'Let me confirm: The agent will help with [SUMMARY]. Is this correct?',
        'Are there any critical requirements or edge cases we haven\'t covered?',
        'What would make this agent a complete failure in your eyes?',
        'Is there anything else important I should know about this agent?'
      ]
    };

    this.phaseOrder = ['CONTEXT', 'BUSINESS', 'AGENT_NEEDS', 'VALIDATION'];
    this.minResponsesPerPhase = 3;
  }

  /**
   * AC2: Ask next question based on phase and responses
   * @returns {Object|null} Question object or null if complete
   */
  askNextQuestion() {
    // Check if waiting for response to last question
    if (this.awaitingResponse && this.lastAskedQuestion) {
      this.logger.warn('Awaiting response to previous question');
      return this.lastAskedQuestion;
    }

    // Check if interview complete
    if (this.isInterviewComplete()) {
      this.logger.info('Interview complete - no more questions');
      return null;
    }

    // Check if current phase needs transition
    if (this.isPhaseComplete(this.currentPhase)) {
      this._transitionToNextPhase();
    }

    // Get question from current phase
    const phaseQuestions = this.questionBanks[this.currentPhase];
    const phaseResponseCount = this.phaseResponses[this.currentPhase].length;
    
    // Use response count as index (allows revisiting questions)
    const questionIndex = Math.min(phaseResponseCount, phaseQuestions.length - 1);
    const questionText = phaseQuestions[questionIndex];

    // Build question object
    const question = {
      questionId: crypto.randomUUID(),
      text: questionText,
      phase: this.currentPhase,
      questionNumber: this.currentQuestionIndex + 1,
      totalInPhase: phaseQuestions.length,
      phaseProgress: `${phaseResponseCount + 1}/${this.minResponsesPerPhase} (min)`
    };

    // Store in SessionState
    this.sessionState.addQuestion(questionText);

    // Mark as awaiting response
    this.awaitingResponse = true;
    this.lastAskedQuestion = question;

    this.logger.info('Question asked', {
      phase: this.currentPhase,
      questionNumber: question.questionNumber,
      phaseProgress: question.phaseProgress
    });

    return question;
  }

  /**
   * AC3: Process user response and store
   * @param {string} response - User's response
   */
  processResponse(response) {
    if (!this.awaitingResponse) {
      this.logger.warn('No question pending - ignoring response');
      return;
    }

    // Store response in current phase
    const responseData = {
      questionId: this.lastAskedQuestion.questionId,
      response: response || '',
      timestamp: Date.now(),
      phase: this.currentPhase
    };

    this.phaseResponses[this.currentPhase].push(responseData);

    // Store in SessionState
    this.sessionState.addResponse(this.lastAskedQuestion.questionId, response);

    // Update state
    this.currentQuestionIndex++;
    this.awaitingResponse = false;
    this.lastAskedQuestion = null;

    this.logger.info('Response processed', {
      phase: this.currentPhase,
      responseCount: this.phaseResponses[this.currentPhase].length,
      phaseComplete: this.isPhaseComplete(this.currentPhase)
    });
  }

  /**
   * AC4: Check if phase has minimum responses
   * @param {string} phase - Phase name
   * @returns {boolean} True if phase complete
   */
  isPhaseComplete(phase) {
    return this.phaseResponses[phase].length >= this.minResponsesPerPhase;
  }

  /**
   * AC5: Check if all phases complete and can transition to ANALYSIS
   * @returns {boolean} True if interview complete
   */
  canTransitionToAnalysis() {
    return this.phaseOrder.every(phase => this.isPhaseComplete(phase));
  }

  /**
   * Check if interview is complete
   * @returns {boolean} True if all phases done
   */
  isInterviewComplete() {
    return this.canTransitionToAnalysis();
  }

  /**
   * Get all collected responses
   * @returns {Object} All phase responses
   */
  getAllResponses() {
    return { ...this.phaseResponses };
  }

  /**
   * Get responses for specific phase
   * @param {string} phase - Phase name
   * @returns {Array} Phase responses
   */
  getPhaseResponses(phase) {
    return [...this.phaseResponses[phase]];
  }

  /**
   * Get interview progress summary
   * @returns {Object} Progress data
   */
  getProgress() {
    const phaseProgress = {};
    
    this.phaseOrder.forEach(phase => {
      const count = this.phaseResponses[phase].length;
      phaseProgress[phase] = {
        responses: count,
        complete: this.isPhaseComplete(phase),
        progress: `${count}/${this.minResponsesPerPhase}`
      };
    });

    return {
      currentPhase: this.currentPhase,
      totalQuestions: this.currentQuestionIndex,
      phases: phaseProgress,
      canTransitionToAnalysis: this.canTransitionToAnalysis()
    };
  }

  /**
   * Transition to next phase
   * @private
   */
  _transitionToNextPhase() {
    const currentIndex = this.phaseOrder.indexOf(this.currentPhase);
    
    if (currentIndex === -1 || currentIndex >= this.phaseOrder.length - 1) {
      // Already at last phase or invalid
      return;
    }

    const nextPhase = this.phaseOrder[currentIndex + 1];
    const previousPhase = this.currentPhase;
    
    this.currentPhase = nextPhase;

    this.logger.info('Interview phase transition', {
      from: previousPhase,
      to: nextPhase,
      previousPhaseResponses: this.phaseResponses[previousPhase].length
    });
  }
}

module.exports = InterviewState;
