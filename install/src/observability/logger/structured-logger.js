/**
 * Structured Logger for BYAN v2.0
 * Provides structured logging with JSON format, log levels, and metadata
 * 
 * @module observability/logger/structured-logger
 * @version 2.0.0-HYPER-MVP
 */

/**
 * Log levels supported by the logger
 */
const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
};

/**
 * Numeric priorities for log levels
 */
const LOG_PRIORITIES = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Structured Logger - Provides JSON-formatted logging with metadata
 * 
 * @class StructuredLogger
 * @example
 * const logger = new StructuredLogger();
 * logger.info('User logged in', { userId: '123', ip: '192.168.1.1' });
 */
class StructuredLogger {
  constructor(options = {}) {
    this.level = options.level || LOG_LEVELS.INFO;
    this.logs = []; // In-memory storage for tests
    this.enableConsole = options.enableConsole !== false;
  }

  /**
   * Set the minimum log level
   * 
   * @param {string} level - Log level (debug, info, warn, error)
   * @returns {void}
   * 
   * @example
   * logger.setLevel('debug'); // Show all logs
   * logger.setLevel('error'); // Show only errors
   */
  setLevel(level) {
    if (!LOG_PRIORITIES.hasOwnProperty(level)) {
      throw new Error(
        `Invalid log level: ${level}. Must be one of: debug, info, warn, error`
      );
    }
    this.level = level;
  }

  /**
   * Log debug message
   * 
   * @param {string} message - Log message
   * @param {Object} [meta={}] - Additional metadata
   * @returns {void}
   * 
   * @example
   * logger.debug('Cache hit', { key: 'user:123', ttl: 3600 });
   */
  debug(message, meta = {}) {
    this._log(LOG_LEVELS.DEBUG, message, meta);
  }

  /**
   * Log info message
   * 
   * @param {string} message - Log message
   * @param {Object} [meta={}] - Additional metadata
   * @returns {void}
   * 
   * @example
   * logger.info('Task started', { taskId: '123', agent: 'dev' });
   */
  info(message, meta = {}) {
    this._log(LOG_LEVELS.INFO, message, meta);
  }

  /**
   * Log warning message
   * 
   * @param {string} message - Log message
   * @param {Object} [meta={}] - Additional metadata
   * @returns {void}
   * 
   * @example
   * logger.warn('Rate limit approaching', { limit: 1000, used: 950 });
   */
  warn(message, meta = {}) {
    this._log(LOG_LEVELS.WARN, message, meta);
  }

  /**
   * Log error message
   * 
   * @param {string} message - Log message
   * @param {Object} [meta={}] - Additional metadata
   * @returns {void}
   * 
   * @example
   * logger.error('Task failed', { taskId: '123', error: 'Timeout' });
   */
  error(message, meta = {}) {
    this._log(LOG_LEVELS.ERROR, message, meta);
  }

  /**
   * Internal log method
   * 
   * @private
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} meta - Metadata
   * @returns {void}
   */
  _log(level, message, meta) {
    // Check if this log should be recorded based on level
    if (LOG_PRIORITIES[level] < LOG_PRIORITIES[this.level]) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      meta: { ...meta },
    };

    // Store in memory
    this.logs.push(logEntry);

    // Output to console if enabled
    if (this.enableConsole) {
      this._outputToConsole(logEntry);
    }
  }

  /**
   * Output log entry to console
   * 
   * @private
   * @param {Object} logEntry - Log entry
   * @returns {void}
   */
  _outputToConsole(logEntry) {
    const output = JSON.stringify(logEntry);
    
    switch (logEntry.level) {
      case LOG_LEVELS.DEBUG:
        console.debug(output);
        break;
      case LOG_LEVELS.INFO:
        console.info(output);
        break;
      case LOG_LEVELS.WARN:
        console.warn(output);
        break;
      case LOG_LEVELS.ERROR:
        console.error(output);
        break;
      default:
        console.log(output);
    }
  }

  /**
   * Get all logs
   * 
   * @returns {Array<Object>} Array of log entries
   * 
   * @example
   * const logs = logger.getLogs();
   * logs.forEach(log => {
   *   console.log(`[${log.level}] ${log.message}`);
   * });
   */
  getLogs() {
    return [...this.logs];
  }

  /**
   * Get logs filtered by level
   * 
   * @param {string} level - Log level to filter by
   * @returns {Array<Object>} Filtered log entries
   * 
   * @example
   * const errors = logger.getLogsByLevel('error');
   */
  getLogsByLevel(level) {
    return this.logs.filter((log) => log.level === level);
  }

  /**
   * Clear all logs
   * 
   * @returns {void}
   * 
   * @example
   * logger.clear(); // Remove all logs from memory
   */
  clear() {
    this.logs = [];
  }

  /**
   * Get log count
   * 
   * @returns {number} Number of logs
   */
  count() {
    return this.logs.length;
  }

  /**
   * Get log count by level
   * 
   * @returns {Object} Count of logs per level
   * 
   * @example
   * const stats = logger.getStats();
   * // { debug: 10, info: 25, warn: 3, error: 1 }
   */
  getStats() {
    const stats = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };

    this.logs.forEach((log) => {
      if (stats.hasOwnProperty(log.level)) {
        stats[log.level]++;
      }
    });

    return stats;
  }
}

module.exports = { StructuredLogger, LOG_LEVELS };
