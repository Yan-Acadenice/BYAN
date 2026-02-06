/**
 * StateMachine Core - Story 4.1
 * Manages workflow state transitions for BYAN v2 orchestrator
 * 
 * States: INTERVIEW → ANALYSIS → GENERATION → COMPLETED (+ ERROR from any state)
 */

const Logger = require('../observability/logger');
const ErrorTracker = require('../observability/error-tracker');

class StateMachine {
  constructor() {
    this.logger = new Logger();
    this.errorTracker = new ErrorTracker();

    // AC1: Define five states
    this.STATES = {
      INTERVIEW: 'INTERVIEW',
      ANALYSIS: 'ANALYSIS',
      GENERATION: 'GENERATION',
      COMPLETED: 'COMPLETED',
      ERROR: 'ERROR'
    };

    // AC2: Valid state transitions
    this.validTransitions = {
      INTERVIEW: ['ANALYSIS', 'ERROR'],
      ANALYSIS: ['GENERATION', 'ERROR'],
      GENERATION: ['COMPLETED', 'ERROR'],
      COMPLETED: [], // Terminal state
      ERROR: []      // Terminal state
    };

    // State metadata
    this.currentState = this.STATES.INTERVIEW;
    this.stateMetadata = {
      name: this.STATES.INTERVIEW,
      timestamp: Date.now(),
      attempts: 0
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
      this.errorTracker.track({
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
      this.errorTracker.track({
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

      // Update state
      this.currentState = newState;
      this.stateMetadata = {
        name: newState,
        timestamp: Date.now(),
        attempts: 0
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
      this.errorTracker.track({
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
   * @returns {Object} { name, timestamp, attempts }
   */
  getCurrentState() {
    return { ...this.stateMetadata };
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
        this.errorTracker.track({
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
