/**
 * StateMachine Core - Story 4.1
 * Manages workflow state transitions for BYAN v2 orchestrator
 * 
 * States: INTERVIEW → ANALYSIS → GENERATION → COMPLETED (+ ERROR from any state)
 */

const Logger = require('../observability/logger');
const ErrorTracker = require('../observability/error-tracker');

class StateMachine {
  constructor(options = {}) {
    this.logger = options.logger || new Logger();
    this.errorTracker = options.errorTracker || new ErrorTracker();

    // AC1: Define states (v2.1.0: added GLOSSARY, VALIDATION)
    this.STATES = {
      INTERVIEW: 'INTERVIEW',
      GLOSSARY: 'GLOSSARY',      // Optional: Business glossary creation (v2.1.0)
      ANALYSIS: 'ANALYSIS',
      GENERATION: 'GENERATION',
      VALIDATION: 'VALIDATION',  // Optional: Agent validation (v2.1.0)
      COMPLETED: 'COMPLETED',
      ERROR: 'ERROR'
    };

    // AC2: Valid state transitions (v2.1.0: added optional states)
    // Backwards compatible: INTERVIEW -> ANALYSIS still valid
    this.validTransitions = {
      INTERVIEW: ['GLOSSARY', 'ANALYSIS', 'ERROR'],
      GLOSSARY: ['ANALYSIS', 'ERROR'],
      ANALYSIS: ['GENERATION', 'ERROR'],
      GENERATION: ['VALIDATION', 'COMPLETED', 'ERROR'],
      VALIDATION: ['COMPLETED', 'ERROR'],
      COMPLETED: [], // Terminal state
      ERROR: []      // Terminal state
    };

    // State metadata (v2.1.0: enhanced with optional state info)
    this.currentState = this.STATES.INTERVIEW;
    this.stateMetadata = {
      name: this.STATES.INTERVIEW,
      timestamp: Date.now(),
      attempts: 0,
      optional: false,  // Track if current state is optional
      skippable: false,  // Track if state can be skipped
      description: 'Collecting user requirements through structured interview'
    };

    // v2.1.0: Optional states configuration
    this.optionalStates = ['GLOSSARY', 'VALIDATION'];
    this.stateDescriptions = {
      INTERVIEW: 'Collecting user requirements through structured interview',
      GLOSSARY: 'Building business glossary for domain clarity (optional)',
      ANALYSIS: 'Analyzing requirements and extracting insights',
      GENERATION: 'Generating agent profile from analysis',
      VALIDATION: 'Validating agent against mantras (optional)',
      COMPLETED: 'Session completed successfully',
      ERROR: 'Session terminated with error'
    };

    // AC5: Hooks for state enter/exit
    this.enterHooks = {}; // { stateName: [callbacks] }
    this.exitHooks = {};  // { stateName: [callbacks] }
  }

  /**
   * AC3: Validate and execute state transition
   * @param {string} newState - Target state
   * @returns {Object} { success, previousState, newState, error? }
   */
  transition(newState) {
    const previousState = this.currentState;

    // Validate newState exists
    if (!newState || !this.STATES[newState]) {
      const error = new Error(`Unknown state: ${newState}`);
      this.errorTracker.trackError({
        error,
        component: 'StateMachine',
        operation: 'transition',
        currentState: this.currentState,
        attemptedState: newState
      });
      return {
        success: false,
        error: error.message
      };
    }

    // Validate transition is allowed
    if (!this.validTransitions[this.currentState].includes(newState)) {
      const error = new Error(
        `Invalid transition from ${this.currentState} to ${newState}`
      );
      this.errorTracker.trackError({
        error,
        component: 'StateMachine',
        operation: 'transition',
        currentState: this.currentState,
        attemptedState: newState
      });
      return {
        success: false,
        error: error.message
      };
    }

    // Execute transition with hooks
    try {
      // AC5: Call exit hooks
      this._executeHooks(this.exitHooks[this.currentState], {
        from: this.currentState,
        to: newState
      });

      // Update state (v2.1.0: enhanced metadata)
      this.currentState = newState;
      this.stateMetadata = {
        name: newState,
        timestamp: Date.now(),
        attempts: 0,
        optional: this.optionalStates.includes(newState),
        skippable: this.optionalStates.includes(newState),
        description: this.stateDescriptions[newState] || ''
      };

      // AC5: Call enter hooks
      this._executeHooks(this.enterHooks[newState], {
        from: previousState,
        to: newState
      });

      // Log successful transition
      this.logger.info('State transition', {
        from: previousState,
        to: newState,
        timestamp: this.stateMetadata.timestamp
      });

      return {
        success: true,
        previousState,
        newState
      };
    } catch (error) {
      // If hooks fail, track but complete transition
      this.errorTracker.trackError({
        error,
        component: 'StateMachine',
        operation: 'transition-hooks',
        state: newState
      });

      return {
        success: true,
        previousState,
        newState,
        hookError: error.message
      };
    }
  }

  /**
   * AC4: Get current state with metadata
   * @returns {Object} { name, timestamp, attempts, optional, skippable, description }
   */
  getCurrentState() {
    return { ...this.stateMetadata };
  }

  /**
   * v2.1.0: Check if current state is optional
   * @returns {boolean} True if state is optional
   */
  isCurrentStateOptional() {
    return this.optionalStates.includes(this.currentState);
  }

  /**
   * v2.1.0: Check if a specific state is optional
   * @param {string} stateName - State to check
   * @returns {boolean} True if state is optional
   */
  isStateOptional(stateName) {
    return this.optionalStates.includes(stateName);
  }

  /**
   * v2.1.0: Get state description
   * @param {string} stateName - State name
   * @returns {string} State description
   */
  getStateDescription(stateName) {
    return this.stateDescriptions[stateName] || 'Unknown state';
  }

  /**
   * Increment retry attempts for current state
   */
  incrementAttempts() {
    this.stateMetadata.attempts++;
  }

  /**
   * AC5: Register state enter hook
   * @param {string} stateName - State to hook into
   * @param {Function} callback - Hook function
   */
  onStateEnter(stateName, callback) {
    if (!this.enterHooks[stateName]) {
      this.enterHooks[stateName] = [];
    }
    this.enterHooks[stateName].push(callback);
  }

  /**
   * AC5: Register state exit hook
   * @param {string} stateName - State to hook into
   * @param {Function} callback - Hook function
   */
  onStateExit(stateName, callback) {
    if (!this.exitHooks[stateName]) {
      this.exitHooks[stateName] = [];
    }
    this.exitHooks[stateName].push(callback);
  }

  /**
   * Execute all hooks for a state
   * @private
   */
  _executeHooks(hooks, context) {
    if (!hooks || hooks.length === 0) return;

    hooks.forEach(hook => {
      try {
        hook(context);
      } catch (error) {
        // Track hook error but don't block transition
        this.errorTracker.trackError({
          error,
          component: 'StateMachine',
          operation: 'hook-execution',
          context
        });
        throw error; // Re-throw to be caught by transition()
      }
    });
  }
}

module.exports = StateMachine;
