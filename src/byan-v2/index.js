const SessionState = require('./context/session-state');
const TaskRouter = require('./dispatcher/task-router');
const StateMachine = require('./orchestrator/state-machine');
const InterviewState = require('./orchestrator/interview-state');
const AnalysisState = require('./orchestrator/analysis-state');
const GenerationState = require('./orchestrator/generation-state');
const Logger = require('./observability/logger');
const MetricsCollector = require('./observability/metrics-collector');

// v2.1.0: BMAD modules integration
const GlossaryBuilder = require('./orchestrator/glossary-builder');
const FiveWhysAnalyzer = require('./dispatcher/five-whys-analyzer');
const ActiveListener = require('./orchestrator/active-listener');
const MantraValidator = require('./generation/mantra-validator');
const VoiceIntegration = require('./integration/voice-integration');

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

    // v2.1.0: Initialize BMAD modules
    this._initializeBMADModules(config);
  }

  /**
   * v2.1.0: Initialize BMAD feature modules
   * @private
   */
  _initializeBMADModules(config) {
    const bmadConfig = this.config.bmad_features || {};

    // GlossaryBuilder
    if (bmadConfig.glossary?.enabled !== false) {
      this.glossaryBuilder = new GlossaryBuilder(this.sessionState, this.logger);
      if (bmadConfig.glossary?.min_concepts) {
        this.glossaryBuilder.minConcepts = bmadConfig.glossary.min_concepts;
      }
      if (bmadConfig.glossary?.validation?.min_definition_length) {
        this.glossaryBuilder.minDefinitionLength = bmadConfig.glossary.validation.min_definition_length;
      }
      if (bmadConfig.glossary?.validation?.clarity_threshold) {
        this.glossaryBuilder.clarityThreshold = bmadConfig.glossary.validation.clarity_threshold;
      }
    }

    // FiveWhysAnalyzer
    if (bmadConfig.five_whys?.enabled !== false) {
      this.fiveWhysAnalyzer = new FiveWhysAnalyzer(this.sessionState, this.logger);
      if (bmadConfig.five_whys?.max_depth) {
        this.fiveWhysAnalyzer.maxDepth = bmadConfig.five_whys.max_depth;
      }
      if (bmadConfig.five_whys?.pain_keywords) {
        this.fiveWhysAnalyzer.painKeywords = bmadConfig.five_whys.pain_keywords;
      }
    }

    // ActiveListener
    if (bmadConfig.active_listening?.enabled !== false) {
      this.activeListener = new ActiveListener(this.sessionState, this.logger);
      if (bmadConfig.active_listening?.reformulate_every) {
        this.activeListener.validationFrequency = bmadConfig.active_listening.reformulate_every;
      }
    }

    // MantraValidator
    if (bmadConfig.mantras?.validate !== false) {
      try {
        const mantrasPath = config.mantrasPath || path.join(__dirname, 'data/mantras.json');
        if (fs.existsSync(mantrasPath)) {
          const mantrasData = JSON.parse(fs.readFileSync(mantrasPath, 'utf8'));
          this.mantraValidator = new MantraValidator(mantrasData);
        } else {
          this.mantraValidator = new MantraValidator();
        }
        
        this.mantraValidatorConfig = {
          minScore: bmadConfig.mantras?.min_score || 80,
          enforceOnGeneration: bmadConfig.mantras?.enforce_on_generation !== false,
          failOnLowScore: bmadConfig.mantras?.fail_on_low_score || false
        };
      } catch (error) {
        this.logger.warn('Failed to initialize MantraValidator', { error: error.message });
      }
    }

    // VoiceIntegration
    if (bmadConfig.voice_integration?.enabled !== false) {
      this.voiceIntegration = new VoiceIntegration(this.sessionState, this.logger);
      
      // Initialize asynchronously (non-blocking)
      this.voiceIntegration.initialize().then(success => {
        if (success) {
          this.logger.info('[ByanV2] Voice integration enabled');
        } else {
          this.logger.debug('[ByanV2] Voice integration not available');
        }
      }).catch(error => {
        this.logger.warn('[ByanV2] Voice integration init failed', { error: error.message });
      });
    }

    this.logger.info('BMAD modules initialized', {
      glossary: !!this.glossaryBuilder,
      fiveWhys: !!this.fiveWhysAnalyzer,
      activeListener: !!this.activeListener,
      mantraValidator: !!this.mantraValidator,
      voiceIntegration: !!this.voiceIntegration
    });
  }

  _loadConfig(customConfig) {
    const defaults = {
      maxQuestions: 12,
      complexityThresholds: {
        low: 30,
        medium: 60
      },
      outputDir: './_byan-output',
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

    const question = this.interviewState.askNextQuestion();
    
    this.metrics.increment('questionsAsked');

    return typeof question === 'string' ? question : question?.text || question;
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

    // v2.1.0: Active listening integration
    let processedResponse = response;
    if (this.activeListener) {
      const listenResult = await this.listen(response);
      if (listenResult.valid) {
        processedResponse = listenResult.reformulated || response;
        
        // Check if Five Whys should be triggered
        if (this.fiveWhysAnalyzer && this.config.bmad_features?.five_whys?.auto_trigger) {
          const painCheck = await this.detectPainPoints(response);
          if (painCheck.hasPainPoints) {
            const whysResult = await this.startFiveWhys(response);
            // Store Five Whys context for later use
            this.sessionState.context.fiveWhysActive = whysResult.needsWhys;
          }
        }
      }
    }

    const currentState = this.stateMachine.getCurrentState();
    
    if (currentState.name === 'INTERVIEW') {
      const isComplete = this.interviewState.processResponse(processedResponse);
      
      if (isComplete) {
        // v2.1.0: Check if glossary should be triggered
        const shouldTriggerGlossary = this._shouldTriggerGlossary();
        
        if (shouldTriggerGlossary && this.glossaryBuilder) {
          await this.stateMachine.transition('GLOSSARY');
          this.logger.info('Glossary triggered for domain', { 
            domain: this.sessionState.context.domain || 'unknown'
          });
        } else {
          await this.stateMachine.transition('ANALYSIS');
        }
        
        this.logger.info('State transition', {
          event: 'state_transition',
          from: 'INTERVIEW',
          to: shouldTriggerGlossary ? 'GLOSSARY' : 'ANALYSIS'
        });
      }
    }

    return { success: true };
  }

  /**
   * v2.1.0: Determine if glossary should be triggered
   * @private
   */
  _shouldTriggerGlossary() {
    const glossaryConfig = this.config.bmad_features?.glossary;
    if (!glossaryConfig || !glossaryConfig.enabled) {
      return false;
    }

    const domain = this.sessionState.context.domain || '';
    const autoTriggerDomains = glossaryConfig.auto_trigger_domains || [];
    
    return autoTriggerDomains.some(triggerDomain => 
      domain.toLowerCase().includes(triggerDomain.toLowerCase())
    );
  }

  async generateProfile() {
    const currentState = this.stateMachine.getCurrentState();
    
    // Transition to GENERATION state if not already there
    if (currentState.name === 'INTERVIEW') {
      await this.stateMachine.transition('ANALYSIS');
      await this.stateMachine.transition('GENERATION');
    } else if (currentState.name === 'ANALYSIS') {
      await this.stateMachine.transition('GENERATION');
    } else if (currentState.name === 'GLOSSARY') {
      await this.stateMachine.transition('ANALYSIS');
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

    // v2.1.0: Mantra validation integration
    const shouldValidate = this.mantraValidator && 
                          this.mantraValidatorConfig?.enforceOnGeneration;
    
    if (shouldValidate) {
      await this.stateMachine.transition('VALIDATION');
      
      this.logger.info('Validating agent profile', {
        event: 'validation_start'
      });

      const validationResults = await this.validateAgent(profile);
      
      // Store validation results
      // If profile is string, create metadata object; if object, add to it
      const validationMetadata = {
        timestamp: validationResults.timestamp,
        score: validationResults.score,
        compliant: validationResults.compliant.length,
        nonCompliant: validationResults.nonCompliant.length,
        errors: validationResults.errors,
        warnings: validationResults.warnings
      };

      // Only add validation to profile if it's an object
      if (typeof profile === 'object' && profile !== null) {
        profile.validation = validationMetadata;
      } else {
        // Store in session state context for later retrieval
        this.sessionState.context.profileValidation = validationMetadata;
      }

      // Check if validation passes threshold
      if (validationResults.score < this.mantraValidatorConfig.minScore) {
        this.logger.warn('Agent validation below threshold', { 
          score: validationResults.score,
          threshold: this.mantraValidatorConfig.minScore 
        });

        if (this.mantraValidatorConfig.failOnLowScore) {
          await this.stateMachine.transition('ERROR');
          throw new Error(
            `Agent validation failed: score ${validationResults.score} < ${this.mantraValidatorConfig.minScore}`
          );
        }
      }

      this.logger.info('Validation complete', {
        event: 'validation_complete',
        score: validationResults.score
      });
    }

    await this.stateMachine.transition('COMPLETED');

    this.logger.info('Profile generation complete', {
      event: 'profile_generation_complete'
    });

    return profile;
  }

  async endSession() {
    const currentState = this.stateMachine.getCurrentState();
    
    if (currentState.name !== 'COMPLETED' && currentState.name !== 'ERROR') {
      // Force transition through states if needed
      if (currentState.name === 'INTERVIEW') {
        await this.stateMachine.transition('ANALYSIS');
        await this.stateMachine.transition('GENERATION');
      } else if (currentState.name === 'ANALYSIS') {
        await this.stateMachine.transition('GENERATION');
      }
      
      if (this.stateMachine.getCurrentState().name === 'GENERATION') {
        await this.stateMachine.transition('COMPLETED');
      }
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

  // ========================================
  // v2.1.0: BMAD Module Public Methods
  // ========================================

  // --- GlossaryBuilder Methods ---
  
  /**
   * Start glossary building session
   * @returns {Object} Prompt and instructions
   */
  async startGlossary() {
    if (!this.glossaryBuilder) {
      throw new Error('GlossaryBuilder not initialized');
    }

    const result = this.glossaryBuilder.start();
    this.logger.info('Glossary session started');
    
    // Transition to GLOSSARY state if in INTERVIEW
    const currentState = this.stateMachine.getCurrentState();
    if (currentState.name === 'INTERVIEW') {
      await this.stateMachine.transition('GLOSSARY');
    }

    return result;
  }

  /**
   * Add concept to glossary
   * @param {string} name - Concept name
   * @param {string} definition - Concept definition
   * @returns {Object} Validation result with suggestions
   */
  async addConcept(name, definition) {
    if (!this.glossaryBuilder) {
      throw new Error('GlossaryBuilder not initialized');
    }

    return this.glossaryBuilder.addConcept(name, definition);
  }

  /**
   * Check if glossary is complete
   * @returns {boolean} True if minimum concepts met
   */
  async isGlossaryComplete() {
    if (!this.glossaryBuilder) {
      return true; // If not enabled, consider complete
    }

    return this.glossaryBuilder.isComplete();
  }

  /**
   * Export glossary data
   * @returns {Object} Complete glossary with metadata
   */
  async exportGlossary() {
    if (!this.glossaryBuilder) {
      throw new Error('GlossaryBuilder not initialized');
    }

    return this.glossaryBuilder.export();
  }

  // --- FiveWhysAnalyzer Methods ---

  /**
   * Detect pain points in user response
   * @param {string} response - User response text
   * @returns {Object} Detection result with pain points
   */
  async detectPainPoints(response) {
    if (!this.fiveWhysAnalyzer) {
      return { hasPainPoints: false, reason: 'FiveWhysAnalyzer not initialized' };
    }

    return this.fiveWhysAnalyzer._detectPainPoints(response);
  }

  /**
   * Start Five Whys analysis
   * @param {string} response - Initial response with pain point
   * @returns {Object} Analysis start result with first question
   */
  async startFiveWhys(response) {
    if (!this.fiveWhysAnalyzer) {
      throw new Error('FiveWhysAnalyzer not initialized');
    }

    const result = this.fiveWhysAnalyzer.start(response);
    
    if (result.needsWhys) {
      this.logger.info('Five Whys analysis started', { 
        painPoints: result.painPoints.length 
      });
    }

    return result;
  }

  /**
   * Process answer to WHY question
   * @param {string} answer - User's answer
   * @returns {Object} Next question or completion
   */
  async processWhyAnswer(answer) {
    if (!this.fiveWhysAnalyzer) {
      throw new Error('FiveWhysAnalyzer not initialized');
    }

    const result = this.fiveWhysAnalyzer.answer(answer);
    
    if (result.complete) {
      this.logger.info('Five Whys analysis complete', { 
        depth: result.depth,
        rootCause: result.rootCause 
      });
    }

    return result;
  }

  /**
   * Get root cause from analysis
   * @returns {Object|null} Root cause or null if not complete
   */
  async getRootCause() {
    if (!this.fiveWhysAnalyzer) {
      return null;
    }

    return this.fiveWhysAnalyzer.getRootCause();
  }

  // --- ActiveListener Methods ---

  /**
   * Process response through active listening
   * @param {string} userResponse - Raw user input
   * @returns {Object} Listening result with reformulation
   */
  async listen(userResponse) {
    if (!this.activeListener) {
      return { valid: true, original: userResponse }; // Pass-through if disabled
    }

    const result = this.activeListener.listen(userResponse);
    
    if (result.valid) {
      this.logger.info('Active listening processed', { 
        clarityScore: result.clarityScore,
        needsValidation: result.needsValidation 
      });
    }

    return result;
  }

  /**
   * Reformulate text for clarity
   * @param {string} text - Text to reformulate
   * @returns {Object} Reformulated text with clarity score
   */
  async reformulate(text) {
    if (!this.activeListener) {
      return { text, clarityScore: 1.0 };
    }

    return this.activeListener.reformulate(text);
  }

  /**
   * Check if validation needed
   * @returns {boolean} True if validation should occur
   */
  async needsValidation() {
    if (!this.activeListener) {
      return false;
    }

    return this.activeListener.needsValidation();
  }

  /**
   * Validate understanding with user
   * @param {boolean} confirmation - User confirmation
   * @returns {Object} Validation result
   */
  async validateUnderstanding(confirmation) {
    if (!this.activeListener) {
      return { validated: true };
    }

    const summary = this.activeListener.getSummary();
    
    return {
      validated: confirmation,
      summary: summary,
      needsCorrection: !confirmation
    };
  }

  // --- MantraValidator Methods ---

  /**
   * Validate agent definition against mantras
   * @param {Object|string} agentDefinition - Agent to validate
   * @returns {Object} Validation results with compliance score
   */
  async validateAgent(agentDefinition) {
    if (!this.mantraValidator) {
      throw new Error('MantraValidator not initialized');
    }

    const results = this.mantraValidator.validate(agentDefinition);
    
    this.logger.info('Agent validated', { 
      score: results.score,
      compliant: results.compliant.length,
      nonCompliant: results.nonCompliant.length 
    });

    return results;
  }

  /**
   * Get compliance score from last validation
   * @returns {number|null} Compliance score (0-100) or null
   */
  async getComplianceScore() {
    if (!this.mantraValidator || !this.mantraValidator.results) {
      return null;
    }

    return this.mantraValidator.results.score;
  }

  /**
   * Get detailed compliance report
   * @returns {Object} Full validation report
   */
  async getComplianceReport() {
    if (!this.mantraValidator || !this.mantraValidator.results) {
      return null;
    }

    return this.mantraValidator.getReport();
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
