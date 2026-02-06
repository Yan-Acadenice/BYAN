/**
 * TaskRouter - Routes tasks based on complexity
 * Integrates ComplexityScorer + TaskToolInterface
 * 
 * Thresholds:
 * - < 30: task-tool only
 * - 30-60: task-tool with fallback capability
 * - > 60: local execution
 */

class ComplexityScorer {
  /**
   * Calculate task complexity score (0-100)
   * Based on: prompt length, type, metadata indicators
   */
  calculateComplexity(task) {
    if (!task || typeof task !== 'object') {
      return 0;
    }

    let score = 0;

    // Base score from prompt length
    const prompt = task.prompt || '';
    const wordCount = prompt.split(/\s+/).filter(w => w.length > 0).length;
    score += Math.min(wordCount * 0.4, 20); // Max 20 points from length

    // Type-based scoring
    const typeScores = {
      'explore': 8,
      'task': 28,
      'general-purpose': 50,
      'code-review': 40
    };
    score += typeScores[task.type] || 20;

    // Metadata indicators
    const metadata = task.metadata || {};
    if (metadata.requiresContext) score += 10;
    if (metadata.requiresMultipleSteps) score += 20;
    if (metadata.requiresReasoning) score += 15;
    if (metadata.estimatedDuration === 'medium') score += 8;
    if (metadata.estimatedDuration === 'long') score += 20;

    // Keyword analysis in prompt
    const complexityKeywords = [
      'refactor', 'architecture', 'design', 'comprehensive',
      'multiple', 'across', 'entire', 'system', 'migration',
      'analyze', 'detailed'
    ];

    const lowerPrompt = prompt.toLowerCase();
    complexityKeywords.forEach(keyword => {
      if (lowerPrompt.includes(keyword)) {
        score += 3;
      }
    });

    // Cap at 100
    return Math.min(Math.round(score), 100);
  }
}

class TaskRouter {
  constructor(customThresholds = {}) {
    this.thresholds = {
      taskToolOnly: customThresholds.taskToolOnly || 30,
      taskToolWithFallback: customThresholds.taskToolWithFallback || 60
    };
    
    this.complexityScorer = new ComplexityScorer();
  }

  /**
   * Route a task to appropriate executor
   * @param {Object} task - Task object with type, prompt, metadata
   * @returns {Object} Routing decision with executor, canFallback, complexity, reasoning
   */
  routeTask(task) {
    // Validation
    if (!task) {
      throw new Error('Task cannot be null or undefined');
    }

    if (typeof task !== 'object' || Array.isArray(task)) {
      throw new Error('Task must be an object');
    }

    // Calculate complexity
    const complexity = this.complexityScorer.calculateComplexity(task);

    // Determine executor and fallback capability
    let executor;
    let canFallback;
    let reasoning;

    if (complexity < this.thresholds.taskToolOnly) {
      executor = 'task-tool';
      canFallback = false;
      reasoning = `Low complexity (${complexity}) - routing to task-tool only`;
    } else if (complexity <= this.thresholds.taskToolWithFallback) {
      executor = 'task-tool';
      canFallback = true;
      reasoning = `Medium complexity (${complexity}) - routing to task-tool with fallback capability`;
    } else {
      executor = 'local';
      canFallback = false;
      reasoning = `High complexity (${complexity}) - routing to local execution for comprehensive handling`;
    }

    return {
      executor,
      canFallback,
      complexity,
      task,
      reasoning,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = TaskRouter;
