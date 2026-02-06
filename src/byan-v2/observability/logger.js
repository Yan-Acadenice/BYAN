/**
 * Logger - Winston-based structured logging
 * 
 * Features:
 * - JSON format logging
 * - File + Console output
 * - Methods: logTaskRouting(), logTaskExecution(), logError()
 */

const winston = require('winston');
const fs = require('fs');
const path = require('path');

class Logger {
  constructor(options = {}) {
    const {
      logDir = path.join(process.cwd(), 'logs'),
      logFile = 'byan.log',
      consoleOutput = true,
      level = 'info'
    } = options;

    this.logDir = logDir;
    this.logFile = logFile;
    this.logPath = path.join(logDir, logFile);

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Configure transports
    const transports = [
      new winston.transports.File({
        filename: this.logPath,
        format: winston.format.json()
      })
    ];

    if (consoleOutput) {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      );
    }

    // Create Winston logger
    this.logger = winston.createLogger({
      level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports
    });
  }

  /**
   * Log task routing decision
   * @param {Object} routingData - Routing decision data
   */
  logTaskRouting(routingData) {
    if (!routingData) return;

    const { task, executor, complexity, canFallback, reasoning } = routingData;

    this.logger.info('Task routing decision', {
      taskType: task?.type,
      prompt: task?.prompt,
      metadata: task?.metadata,
      executor,
      complexity,
      canFallback,
      reasoning
    });
  }

  /**
   * Log task execution result
   * @param {Object} executionData - Execution result data
   */
  logTaskExecution(executionData) {
    if (!executionData) return;

    const { task, executor, duration, success, result, error, tokens } = executionData;

    this.logger.info('Task execution completed', {
      taskType: task?.type,
      prompt: task?.prompt,
      executor,
      duration,
      success,
      result,
      error,
      tokens
    });
  }

  /**
   * Log error with context
   * @param {Object} errorData - Error data with type, message, error, context
   */
  logError(errorData) {
    if (!errorData) return;

    const { type, message, error, context } = errorData;

    this.logger.error(message || 'Error occurred', {
      errorType: type,
      stack: error?.stack,
      context
    });
  }

  /**
   * Generic info log
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  info(message, data = {}) {
    this.logger.info(message, data);
  }

  /**
   * Generic warn log
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  warn(message, data = {}) {
    this.logger.warn(message, data);
  }

  /**
   * Generic error log
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  error(message, data = {}) {
    this.logger.error(message, data);
  }

  /**
   * Close logger and flush transports
   */
  close() {
    this.logger.close();
  }
}

module.exports = Logger;
