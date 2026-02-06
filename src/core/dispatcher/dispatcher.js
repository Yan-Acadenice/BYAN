/**
 * Economic Dispatcher for routing tasks to appropriate AI models
 * Routes tasks based on complexity keywords to optimize cost/performance
 * 
 * @class EconomicDispatcher
 * @example
 * const dispatcher = new EconomicDispatcher();
 * const model = dispatcher.dispatch('explore codebase'); // Returns 'haiku'
 */
class EconomicDispatcher {
  /**
   * Initialize a new EconomicDispatcher instance
   */
  constructor() {
    // Model classification patterns
    this.patterns = {
      haiku: [
        'explore', 'simple', 'quick', 'search', 'find', 'list', 'show',
        'check', 'verify', 'read', 'get', 'view', 'display', 'basic'
      ],
      sonnet: [
        'implement', 'code', 'complex', 'develop', 'create', 'build',
        'write', 'fix', 'refactor', 'optimize', 'integrate', 'design'
      ],
      opus: [
        'architect', 'critical', 'review', 'analyze', 'evaluate', 'plan',
        'strategy', 'security', 'performance', 'scalability', 'system-design',
        'architectural', 'mission-critical', 'production'
      ]
    };

    // Relative costs (Haiku = 1x baseline)
    this.costs = {
      haiku: 1,
      sonnet: 5,
      opus: 15
    };
  }

  /**
   * Dispatch a task to the appropriate model
   * @param {string} task - Task description
   * @returns {string} Model name ('haiku', 'sonnet', or 'opus')
   * @throws {Error} If task is not a string
   */
  dispatch(task) {
    if (typeof task !== 'string' || !task) {
      throw new Error('Task must be a non-empty string');
    }

    const taskLower = task.toLowerCase();
    
    // Helper to check for whole word match or start of compound words
    const hasKeyword = (patterns) => {
      return patterns.some(pattern => {
        const regex = new RegExp(`\\b${pattern}\\b`, 'i');
        return regex.test(task);
      });
    };

    // Check Opus patterns first (highest priority for critical tasks)
    if (hasKeyword(this.patterns.opus)) {
      return 'opus';
    }

    // Check Sonnet patterns (medium complexity)
    if (hasKeyword(this.patterns.sonnet)) {
      return 'sonnet';
    }

    // Check Haiku patterns (simple tasks)
    if (hasKeyword(this.patterns.haiku)) {
      return 'haiku';
    }

    // Default to Sonnet for unclassified tasks (balanced choice)
    return 'sonnet';
  }

  /**
   * Get the relative cost of a model
   * @param {string} model - Model name ('haiku', 'sonnet', or 'opus')
   * @returns {number} Relative cost multiplier
   * @throws {Error} If model is unknown
   */
  getModelCost(model) {
    if (!this.costs[model]) {
      throw new Error(`Unknown model: ${model}`);
    }
    return this.costs[model];
  }

  /**
   * Get cost comparison between two models
   * @param {string} model1 - First model
   * @param {string} model2 - Second model
   * @returns {number} Cost ratio (model1/model2)
   */
  compareCosts(model1, model2) {
    const cost1 = this.getModelCost(model1);
    const cost2 = this.getModelCost(model2);
    return cost1 / cost2;
  }

  /**
   * Get all available models with their costs
   * @returns {object} Models and their costs
   */
  getAllModels() {
    return { ...this.costs };
  }

  /**
   * Estimate cost savings by using recommended model vs default
   * @param {string} task - Task description
   * @param {string} defaultModel - Default model to compare against
   * @returns {object} Savings information
   */
  estimateSavings(task, defaultModel = 'sonnet') {
    const recommended = this.dispatch(task);
    const recommendedCost = this.getModelCost(recommended);
    const defaultCost = this.getModelCost(defaultModel);
    const savings = ((defaultCost - recommendedCost) / defaultCost) * 100;

    return {
      recommended,
      recommendedCost,
      defaultCost,
      savingsPercent: Math.round(savings),
      shouldSwitch: savings > 0
    };
  }
}

module.exports = EconomicDispatcher;
