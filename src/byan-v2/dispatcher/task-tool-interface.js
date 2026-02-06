/**
 * TaskToolInterface - Interface to GitHub Copilot CLI Task Tool
 * 
 * IMPORTANT: GitHub Copilot CLI does NOT expose a programmatic API for Task Tool.
 * This is a conceptual interface for BYAN v2.0 architecture design.
 * 
 * In production, this would:
 * 1. Use future Copilot SDK when available
 * 2. Or shell out to `gh copilot` CLI commands
 * 3. Or use inter-process communication with Copilot CLI
 * 
 * For MVP, this is a stub with comprehensive tests using MockTaskToolInterface.
 */

const VALID_AGENT_TYPES = ['task', 'explore', 'general-purpose'];
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const TRANSIENT_ERRORS = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'];

class TaskToolInterface {
  constructor(options = {}) {
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.maxRetries = options.maxRetries || 1;
  }

  /**
   * Delegate task to GitHub Copilot agent via Task Tool
   * 
   * @param {string} taskPrompt - The task description for the agent
   * @param {string} agentType - Agent type: 'task', 'explore', or 'general-purpose'
   * @returns {Promise<{output: string, metadata: {tokens: number, duration: number}}>}
   */
  async delegateTask(taskPrompt, agentType) {
    // Validation
    if (!taskPrompt || taskPrompt.trim() === '') {
      throw new Error('taskPrompt cannot be empty');
    }

    if (!agentType) {
      throw new Error('agentType is required');
    }

    if (!VALID_AGENT_TYPES.includes(agentType)) {
      throw new Error(`Invalid agent type: ${agentType}. Valid types: ${VALID_AGENT_TYPES.join(', ')}`);
    }

    // Attempt execution with retry logic
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this._executeTaskWithTimeout(taskPrompt, agentType);
      } catch (error) {
        lastError = error;
        
        // Only retry on transient errors and if we have retries left
        const isTransient = TRANSIENT_ERRORS.some(errCode => error.message.includes(errCode));
        if (isTransient && attempt < this.maxRetries) {
          continue;
        }
        
        // Non-transient error or out of retries - throw immediately
        break;
      }
    }

    throw lastError;
  }

  async _executeTaskWithTimeout(taskPrompt, agentType) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Task execution timeout after ${this.timeout}ms`));
      }, this.timeout);

      // TODO: Actual implementation would call Copilot Task Tool here
      // For now, this is a stub that throws to force use of Mock in tests
      clearTimeout(timeoutId);
      reject(new Error('TaskToolInterface is a stub. Use MockTaskToolInterface for testing.'));
    });
  }

  /**
   * Build the call syntax for Task Tool (documentation)
   * Format: Uses GitHub Copilot CLI agent invocation syntax
   * 
   * @param {string} prompt - Task prompt
   * @param {string} agentType - Agent type
   * @returns {string} - Call syntax string
   */
  static buildTaskCallSyntax(prompt, agentType) {
    // Escape and sanitize prompt
    const sanitizedPrompt = prompt
      .replace(/\n/g, ' ')
      .replace(/"/g, '\\"');

    // Documented syntax format (conceptual - actual CLI syntax may vary)
    return `@${agentType} "${sanitizedPrompt}"`;
  }

  /**
   * Get documentation for Task Tool call syntax
   * @returns {string} - Documentation
   */
  static getCallSyntaxDocumentation() {
    return `
GitHub Copilot CLI Task Tool Syntax (Conceptual):

@<agent_type> "<prompt>"

Where:
- agent_type: 'task' | 'explore' | 'general-purpose'
- prompt: Natural language task description

Examples:
- @task "Run all unit tests and report results"
- @explore "Find all API endpoint definitions"
- @general-purpose "Refactor authentication logic"

Note: Actual implementation depends on Copilot CLI SDK availability.
    `.trim();
  }
}

module.exports = TaskToolInterface;
