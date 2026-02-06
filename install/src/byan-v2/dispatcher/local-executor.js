/**
 * LocalExecutor - Story 3.1
 * Handles high-complexity tasks (>60) locally without delegation
 * 
 * Integrates:
 * - Logger: Log execution start/completion
 * - MetricsCollector: Track execution metrics
 * - ErrorTracker: Track errors
 */

const Logger = require('../observability/logger');
const ErrorTracker = require('../observability/error-tracker');
const MetricsCollector = require('../observability/metrics-collector');

class LocalExecutor {
  constructor() {
    this.logger = new Logger();
    this.errorTracker = new ErrorTracker();
    this.metricsCollector = new MetricsCollector();
  }

  /**
   * AC2: Execute task locally without delegation
   * AC3: Returns { output, tokens, duration, executor: 'local' }
   * 
   * @param {Object} task - Task object { type, prompt, complexity, metadata? }
   * @returns {Promise<Object>} Execution result
   */
  async execute(task) {
    const startTime = Date.now();

    try {
      // AC6: Validate task
      if (!task || typeof task !== 'object') {
        const error = new Error('Task must be a valid object');
        this.errorTracker.track({
          error,
          component: 'LocalExecutor',
          operation: 'execute',
          task
        });
        throw error;
      }

      // AC5: Log execution start
      this.logger.info('Local execution started', {
        type: task.type,
        complexity: task.complexity,
        promptLength: task.prompt?.length || 0
      });

      // AC2: Process task locally (no delegation)
      const output = await this._processTaskLocally(task);

      // Calculate metrics
      const duration = Date.now() - startTime;
      const tokens = this._estimateTokens(task.prompt, output);

      // AC3: Build result object
      const result = {
        output,
        tokens,
        duration,
        executor: 'local'
      };

      // AC4: Record metrics
      this.metricsCollector.recordTaskExecution({
        executor: 'local',
        duration,
        tokens,
        success: true,
        taskType: task.type,
        complexity: task.complexity
      });

      // AC5: Log completion
      this.logger.info('Local execution completed', {
        duration,
        tokens,
        outputLength: output.length
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      // AC6: Track error
      this.errorTracker.track({
        error,
        component: 'LocalExecutor',
        operation: 'execute',
        task,
        duration
      });

      // Record failed execution
      this.metricsCollector.recordTaskExecution({
        executor: 'local',
        duration,
        tokens: 0,
        success: false,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Process task using BYAN's expertise
   * Simulates local processing for analysis/generation tasks
   * @private
   */
  async _processTaskLocally(task) {
    const { type, prompt, metadata = {} } = task;

    // Simulate processing based on task type
    switch (type) {
      case 'analysis':
        return this._processAnalysisTask(prompt, metadata);
      
      case 'generation':
        return this._processGenerationTask(prompt, metadata);
      
      case 'task':
      case 'general-purpose':
        return this._processGeneralTask(prompt, metadata);
      
      default:
        return this._processGenericTask(prompt, metadata);
    }
  }

  /**
   * Process analysis tasks (extract requirements, patterns)
   * @private
   */
  _processAnalysisTask(prompt, metadata) {
    // Simulated analysis output
    const analysis = {
      type: 'analysis',
      input: prompt,
      findings: [
        'Identified key requirements from prompt',
        'Detected patterns and themes',
        'Extracted structured information'
      ],
      context: metadata.context || {},
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(analysis, null, 2);
  }

  /**
   * Process generation tasks (create agent profiles, content)
   * @private
   */
  _processGenerationTask(prompt, metadata) {
    // Simulated generation output
    const generation = {
      type: 'generation',
      prompt,
      generated: 'Generated content based on requirements',
      metadata: metadata,
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(generation, null, 2);
  }

  /**
   * Process general/task type tasks
   * @private
   */
  _processGeneralTask(prompt, metadata) {
    const result = {
      type: 'general',
      input: prompt,
      output: 'Processed task locally with full BYAN expertise',
      metadata,
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(result, null, 2);
  }

  /**
   * Process generic tasks (fallback)
   * @private
   */
  _processGenericTask(prompt, metadata) {
    const result = {
      type: 'generic',
      input: prompt || '',
      output: 'Processed with local executor',
      metadata,
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(result, null, 2);
  }

  /**
   * Estimate token count from input/output
   * Simple heuristic: ~1.3 tokens per word
   * @private
   */
  _estimateTokens(prompt = '', output = '') {
    const promptWords = prompt.split(/\s+/).filter(w => w.length > 0).length;
    const outputWords = output.split(/\s+/).filter(w => w.length > 0).length;
    
    // Rough token estimation
    const totalWords = promptWords + outputWords;
    return Math.ceil(totalWords * 1.3);
  }
}

module.exports = LocalExecutor;
