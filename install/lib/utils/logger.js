/**
 * Logger Utility
 * 
 * Wrapper around chalk and console for colored logging.
 * 
 * @module utils/logger
 */

const chalk = require('chalk');

/**
 * Log info message
 * 
 * @param {string} message - Message to log
 */
function info(message) {
  console.log(chalk.blue('ℹ'), message);
}

/**
 * Log success message
 * 
 * @param {string} message - Message to log
 */
function success(message) {
  console.log(chalk.green('✓'), message);
}

/**
 * Log warning message
 * 
 * @param {string} message - Message to log
 */
function warn(message) {
  console.log(chalk.yellow('⚠'), message);
}

/**
 * Log error message
 * 
 * @param {string} message - Message to log
 */
function error(message) {
  console.error(chalk.red('✖'), message);
}

/**
 * Log debug message (only if DEBUG env var set)
 * 
 * @param {string} message - Message to log
 */
function debug(message) {
  if (process.env.DEBUG) {
    console.log(chalk.gray('[DEBUG]'), message);
  }
}

module.exports = {
  info,
  success,
  warn,
  error,
  debug
};
