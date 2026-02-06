/**
 * MockTaskToolInterface - Test double for TaskToolInterface
 * 
 * Simulates GitHub Copilot Task Tool behavior for testing:
 * - Predefined responses
 * - Configurable delays
 * - Call history tracking
 * - Error simulation
 */

const VALID_AGENT_TYPES = ['task', 'explore', 'general-purpose'];

class MockTaskToolInterface {
  constructor(options = {}) {
    this.delay = options.delay !== undefined ? options.delay : this._randomDelay();
    this.responses = options.responses || {};
    this.behavior = options.behavior || null;
    this.callHistory = [];
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : 1;
  }

  /**
   * Mock delegateTask - simulates Task Tool call
   */
  async delegateTask(taskPrompt, agentType) {
    // Validation (same as real implementation)
    if (!taskPrompt || taskPrompt.trim() === '') {
      throw new Error('taskPrompt cannot be empty');
    }

    if (!agentType) {
      throw new Error('agentType is required');
    }

    if (!VALID_AGENT_TYPES.includes(agentType)) {
      throw new Error(`Invalid agent type: ${agentType}. Valid types: ${VALID_AGENT_TYPES.join(', ')}`);
    }

    // Record call
    const call = {
      prompt: taskPrompt,
      agentType: agentType,
      timestamp: Date.now()
    };
    this.callHistory.push(call);

    // Simulate delay
    await this._sleep(this.delay);

    // Use custom behavior if provided (with retry logic for transient errors)
    if (this.behavior) {
      const TRANSIENT_ERRORS = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'];
      let lastError;
      
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          return this.behavior(taskPrompt, agentType);
        } catch (error) {
          lastError = error;
          
          // Only retry on transient errors and if we have retries left
          const isTransient = TRANSIENT_ERRORS.some(errCode => error.message.includes(errCode));
          if (isTransient && attempt < this.maxRetries) {
            await this._sleep(this.delay);
            continue;
          }
          
          // Non-transient error or out of retries - throw immediately
          break;
        }
      }
      
      throw lastError;
    }

    // Check for predefined response
    if (this.responses[taskPrompt]) {
      return this.responses[taskPrompt];
    }

    // Generate default response
    return this._generateDefaultResponse(taskPrompt, agentType);
  }

  /**
   * Generate realistic mock response
   */
  _generateDefaultResponse(taskPrompt, agentType) {
    const outputMap = {
      'task': `Task completed: ${taskPrompt}`,
      'explore': `Exploration results for: ${taskPrompt}`,
      'general-purpose': `General analysis: ${taskPrompt}`
    };

    return {
      output: outputMap[agentType] || `Response for: ${taskPrompt}`,
      metadata: {
        tokens: Math.floor(Math.random() * 1000) + 100,
        duration: Math.floor(Math.random() * 2000) + 500,
        agentType: agentType
      }
    };
  }

  /**
   * Random delay between 100-500ms
   */
  _randomDelay() {
    return Math.floor(Math.random() * 400) + 100;
  }

  /**
   * Sleep utility
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get call history
   */
  getCallHistory() {
    return [...this.callHistory];
  }

  /**
   * Clear call history
   */
  clearHistory() {
    this.callHistory = [];
  }
}

module.exports = MockTaskToolInterface;
