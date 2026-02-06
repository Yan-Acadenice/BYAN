/**
 * MetricsCollector - Track task execution metrics
 * 
 * Tracks:
 * - tasksRouted, taskToolCalls, localExecutions
 * - totalTokens, totalDuration
 * - successfulTasks, failedTasks
 * - Averages (duration, tokens)
 * 
 * Methods:
 * - recordTaskRouting(routingData)
 * - recordTaskExecution(executionData)
 * - getMetrics()
 * - reset()
 */

class MetricsCollector {
  constructor() {
    this.metrics = {
      tasksRouted: 0,
      taskToolCalls: 0,
      localExecutions: 0,
      totalTokens: 0,
      totalDuration: 0,
      successfulTasks: 0,
      failedTasks: 0
    };

    this.taskHistory = [];
  }

  /**
   * Record task routing decision
   * @param {Object} routingData - Routing decision data
   */
  recordTaskRouting(routingData) {
    if (!routingData) return;

    const { executor, complexity, task } = routingData;

    // Increment counters
    this.metrics.tasksRouted++;

    if (executor === 'task-tool') {
      this.metrics.taskToolCalls++;
    } else if (executor === 'local') {
      this.metrics.localExecutions++;
    }

    // Store in history
    this.taskHistory.push({
      type: 'routing',
      timestamp: new Date().toISOString(),
      executor,
      complexity,
      task
    });
  }

  /**
   * Record task execution result
   * @param {Object} executionData - Execution result data
   */
  recordTaskExecution(executionData) {
    if (!executionData) return;

    const { duration, success, tokens, error } = executionData;

    // Validate and record duration (reject negative)
    if (duration !== undefined && duration >= 0) {
      this.metrics.totalDuration += duration;
    }

    // Validate and record tokens (reject negative)
    if (tokens !== undefined && tokens >= 0) {
      this.metrics.totalTokens += tokens;
    }

    // Record success/failure
    if (success === true) {
      this.metrics.successfulTasks++;
    } else if (success === false) {
      this.metrics.failedTasks++;
    }

    // Store in history
    this.taskHistory.push({
      type: 'execution',
      timestamp: new Date().toISOString(),
      duration,
      success,
      tokens,
      error
    });
  }

  /**
   * Get current metrics snapshot
   * @returns {Object} Current metrics
   */
  getMetrics() {
    const totalTasks = this.metrics.successfulTasks + this.metrics.failedTasks;

    return {
      tasksRouted: this.metrics.tasksRouted,
      taskToolCalls: this.metrics.taskToolCalls,
      localExecutions: this.metrics.localExecutions,
      totalTokens: this.metrics.totalTokens,
      totalDuration: this.metrics.totalDuration,
      successfulTasks: this.metrics.successfulTasks,
      failedTasks: this.metrics.failedTasks,
      averageDuration: totalTasks > 0 
        ? Math.round(this.metrics.totalDuration / totalTasks) 
        : 0,
      averageTokens: totalTasks > 0 
        ? Math.round(this.metrics.totalTokens / totalTasks) 
        : 0
    };
  }

  /**
   * Reset all metrics and history
   */
  reset() {
    this.metrics = {
      tasksRouted: 0,
      taskToolCalls: 0,
      localExecutions: 0,
      totalTokens: 0,
      totalDuration: 0,
      successfulTasks: 0,
      failedTasks: 0
    };

    this.taskHistory = [];
  }
}

module.exports = MetricsCollector;
