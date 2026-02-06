const SessionState = require('./context/session-state');
const TaskRouter = require('./dispatcher/task-router');
const StateMachine = require('./orchestrator/state-machine');
const InterviewState = require('./orchestrator/interview-state');
const AnalysisState = require('./orchestrator/analysis-state');
const GenerationState = require('./orchestrator/generation-state');
const Logger = require('./observability/logger');
const MetricsCollector = require('./observability/metrics-collector');
const crypto = require('crypto');

class ByanV2 {
  constructor(config = {}) {
    this.config = this._loadConfig(config);
    
    if (config.sessionState) {
      this.sessionState = config.sessionState;
    } else {
      const sessionId = this.config.sessionId || crypto.randomUUID();
      this.sessionState = new SessionState(sessionId);
    }
    
    if (config.logger) {
      this.logger = config.logger;
    } else {
      this.logger = new Logger();
    }
    
    this.metrics = new MetricsCollector();
    this.dispatcher = new TaskRouter();
    
    const ErrorTracker = require('./observability/error-tracker');
    this.errorTracker = new ErrorTracker();
    
    if (config.stateMachine) {
      this.stateMachine = config.stateMachine;
    } else {
      this.stateMachine = new StateMachine({
        logger: this.logger,
        errorTracker: this.errorTracker
      });
      
      this.interviewState = new InterviewState(this.sessionState);
      this.analysisState = new AnalysisState(this.sessionState);
      this.generationState = new GenerationState(this.sessionState);
    }
  }

  _loadConfig(customConfig) {
    const defaults = {
      maxQuestions: 12,
      complexityThresholds: {
        low: 30,
        medium: 60
      },
      outputDir: './_bmad-output/bmb-creations',
      env: customConfig.env || (process.env.GITHUB_COPILOT ? 'copilot' : 'standalone')
    };

    return { ...defaults, ...customConfig };
  }

  isCopilotContext() {
    return this.config.env === 'copilot' || process.env.GITHUB_COPILOT === 'true';
  }

  async startSession() {
    this.logger.info('Starting BYAN session', {
      event: 'session_start',
      sessionId: this.sessionState.sessionId
    });

    this.metrics.increment('sessionsStarted');

    await this.stateMachine.transition('INTERVIEW');

    this.logger.info('State transition', {
      event: 'state_transition',
      from: 'INIT',
      to: 'INTERVIEW'
    });

    return this.sessionState.sessionId;
  }

  async getNextQuestion() {
    const currentState = this.stateMachine.getCurrentState();
    
    if (currentState.name !== 'INTERVIEW') {
      throw new Error('Not in INTERVIEW state');
    }

    const question = await this.interviewState.getNextQuestion();
    
    this.metrics.increment('questionsAsked');

    return question;
  }

  async submitResponse(response) {
    if (!response || response.trim().length === 0) {
      this.metrics.increment('errors');
      throw new Error('Response cannot be empty');
    }

    const sanitized = response.substring(0, 100);
    this.logger.info('User response received', {
      event: 'response_submitted',
      response: sanitized
    });

    this.sessionState.addResponse(response);

    const currentState = this.stateMachine.getCurrentState();
    
    if (currentState.name === 'INTERVIEW') {
      const isComplete = await this.interviewState.processResponse(response);
      
      if (isComplete) {
        await this.stateMachine.transition('ANALYSIS');
        
        this.logger.info('State transition', {
          event: 'state_transition',
          from: 'INTERVIEW',
          to: 'ANALYSIS'
        });
      }
    }

    return { success: true };
  }

  async generateProfile() {
    const currentState = this.stateMachine.getCurrentState();
    
    if (currentState.name === 'INTERVIEW') {
      await this.stateMachine.transition('ANALYSIS');
      await this.stateMachine.transition('GENERATION');
    } else if (currentState.name === 'ANALYSIS') {
      await this.stateMachine.transition('GENERATION');
    } else if (currentState.name !== 'GENERATION') {
      this.metrics.increment('errors');
      throw new Error('Cannot generate profile in current state');
    }

    this.logger.info('Generating agent profile', {
      event: 'profile_generation_start'
    });

    const profile = await this.generationState.generateProfile();

    this.metrics.increment('profilesGenerated');

    await this.stateMachine.transition('COMPLETED');

    this.logger.info('Profile generation complete', {
      event: 'profile_generation_complete'
    });

    return profile;
  }

  async endSession() {
    const currentState = this.stateMachine.getCurrentState();
    
    if (currentState.name !== 'COMPLETED') {
      await this.stateMachine.transition('COMPLETED');
    }

    this.logger.info('Session ended', {
      event: 'session_end',
      sessionId: this.sessionState.sessionId
    });

    return { success: true };
  }

  getMetricsSummary() {
    return this.metrics.getSummary();
  }

  async getSessionSummary() {
    return {
      sessionId: this.sessionState.sessionId,
      questionsAsked: this.sessionState.userResponses.length,
      state: this.stateMachine.getCurrentState().name,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = ByanV2;
