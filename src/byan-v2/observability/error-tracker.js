/**
 * ErrorTracker - Track and store errors with context
 * 
 * Error Types:
 * - ROUTING_ERROR: Errors during task routing
 * - EXECUTION_ERROR: Errors during task execution
 * - VALIDATION_ERROR: Errors during validation
 * 
 * Features:
 * - Store up to maxErrors (default 100) in FIFO order
 * - Track error type, message, stack, context, timestamp
 * - Filter errors by type
 * - Get error statistics
 * 
 * Methods:
 * - trackError(errorData)
 * - getErrors()
 * - getErrorsByType(type)
 * - getErrorStats()
 * - clearErrors()
 */

class ErrorTracker {
  constructor(options = {}) {
    this.maxErrors = options.maxErrors || 100;
    this.errors = [];
  }

  /**
   * Track an error with full context
   * @param {Object} errorData - Error data with type, message, error, context
   */
  trackError(errorData) {
    if (!errorData) return;

    const { type, message, error, context } = errorData;

    // Build error entry
    const errorEntry = {
      type,
      message: message || error?.message,
      stack: error?.stack,
      context,
      timestamp: new Date().toISOString()
    };

    // Add to errors array
    this.errors.push(errorEntry);

    // Enforce max size (FIFO)
    if (this.errors.length > this.maxErrors) {
      this.errors.shift(); // Remove oldest
    }
  }

  /**
   * Get all tracked errors
   * @returns {Array} Array of error objects
   */
  getErrors() {
    // Return copy to prevent external modification
    return [...this.errors];
  }

  /**
   * Get errors filtered by type
   * @param {string} type - Error type to filter by
   * @returns {Array} Array of errors matching type
   */
  getErrorsByType(type) {
    return this.errors.filter(error => error.type === type);
  }

  /**
   * Get error statistics
   * @returns {Object} Statistics with total and breakdown by type
   */
  getErrorStats() {
    const stats = {
      total: this.errors.length,
      byType: {
        ROUTING_ERROR: 0,
        EXECUTION_ERROR: 0,
        VALIDATION_ERROR: 0
      }
    };

    this.errors.forEach(error => {
      if (stats.byType[error.type] !== undefined) {
        stats.byType[error.type]++;
      }
    });

    return stats;
  }

  /**
   * Clear all tracked errors
   */
  clearErrors() {
    this.errors = [];
  }
}

module.exports = ErrorTracker;
