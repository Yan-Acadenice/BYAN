/**
 * Cost Optimizer Worker
 * 
 * Automatically routes LLM calls to optimal model based on complexity.
 * Integrates with byan-copilot-router for cost optimization.
 * 
 * @module workers/cost-optimizer
 */

const { CopilotRouter } = require('byan-copilot-router');

class CostOptimizerWorker {
  constructor(config = {}) {
    this.router = new CopilotRouter({
      workerThreshold: config.workerThreshold || 30,
      agentThreshold: config.agentThreshold || 60,
      fallbackEnabled: config.fallbackEnabled !== false,
      maxRetries: config.maxRetries || 3,
      clientOptions: {
        testMode: config.testMode !== false // Default to test mode
      }
    });
    
    this.role = 'worker';
    this.model = 'auto'; // Auto-select based on complexity
    this.verbose = config.verbose || false;
  }

  /**
   * Execute task with automatic routing
   * 
   * @param {Object} task - Task to execute
   * @param {string} task.input - User prompt
   * @param {string} task.type - Task type (simple/generate/analysis/reasoning)
   * @param {number} [task.contextSize] - Context size in characters
   * @param {number} [task.steps] - Number of steps
   * @param {string} [task.outputFormat] - Output format (text/json/complex)
   * @returns {Promise<Object>} Execution result
   */
  async execute(task) {
    if (this.verbose) {
      console.log('[CostOptimizer] Routing task:', task.type);
    }

    try {
      const result = await this.router.route({
        input: task.input || task.prompt,
        type: task.type || 'generate',
        contextSize: task.contextSize || (task.context?.length || 0),
        steps: task.steps,
        outputFormat: task.outputFormat
      });

      if (this.verbose) {
        console.log(`[CostOptimizer] Routed to: ${result.route}`);
        console.log(`[CostOptimizer] Cost: $${result.cost.toFixed(6)}`);
        console.log(`[CostOptimizer] Complexity: ${result.complexityScore.total}`);
      }

      return {
        success: true,
        content: result.content,
        route: result.route,
        model: result.model,
        cost: result.cost,
        tokens: result.tokens,
        complexity: result.complexityScore.total
      };

    } catch (error) {
      console.error('[CostOptimizer] Error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get routing statistics
   * 
   * @returns {Object} Statistics with costs and savings
   */
  getStatistics() {
    return this.router.getTracker().getStatistics();
  }

  /**
   * Print cost summary
   */
  printSummary() {
    console.log(this.router.getTracker().printSummary());
  }

  /**
   * Export cost data
   * 
   * @param {string} format - Format (json/csv)
   * @returns {string} Exported data
   */
  exportData(format = 'json') {
    const tracker = this.router.getTracker();
    return format === 'csv' ? tracker.exportCSV() : tracker.exportJSON();
  }

  /**
   * Reset statistics
   */
  reset() {
    this.router.getTracker().reset();
  }

  /**
   * Cleanup resources
   */
  async close() {
    await this.router.close();
  }

  /**
   * Get complexity score for a task without executing
   * 
   * @param {Object} task - Task to analyze
   * @returns {Object} Complexity score
   */
  analyzeComplexity(task) {
    return this.router.analyzer.calculateComplexity({
      input: task.input || task.prompt,
      type: task.type || 'generate',
      contextSize: task.contextSize || 0,
      steps: task.steps,
      outputFormat: task.outputFormat
    });
  }
}

module.exports = CostOptimizerWorker;

// Example usage
if (require.main === module) {
  (async () => {
    console.log('🚀 Cost Optimizer Worker Demo\n');
    
    const worker = new CostOptimizerWorker({ verbose: true });

    // Simple task
    console.log('1️⃣  Simple task:');
    const r1 = await worker.execute({
      input: 'Fix typo in code',
      type: 'simple'
    });
    console.log('Result:', r1.success ? '✓' : '✗', '\n');

    // Complex task
    console.log('2️⃣  Complex task:');
    const r2 = await worker.execute({
      input: 'Design microservices architecture',
      type: 'reasoning',
      steps: 5
    });
    console.log('Result:', r2.success ? '✓' : '✗', '\n');

    // Show statistics
    console.log('📊 Statistics:');
    worker.printSummary();

    await worker.close();
  })();
}
