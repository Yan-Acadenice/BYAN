/**
 * Exit Codes
 * 
 * Standard exit codes for YANSTALLER CLI.
 * 
 * @module exit-codes
 */

module.exports = {
  /**
   * Success - Installation completed without errors
   */
  SUCCESS: 0,

  /**
   * Node.js version too old (< 18.0.0)
   */
  NODE_VERSION_ERROR: 1,

  /**
   * Permission denied (file system access)
   */
  PERMISSION_ERROR: 2,

  /**
   * Post-installation validation failed
   */
  VALIDATION_FAILED: 3,

  /**
   * Installation process failed
   */
  INSTALLATION_FAILED: 4,

  /**
   * Backup operation failed
   */
  BACKUP_FAILED: 5,

  /**
   * Platform not found or not supported
   */
  PLATFORM_ERROR: 6,

  /**
   * User cancelled installation
   */
  USER_CANCELLED: 7,

  /**
   * Unknown error
   */
  UNKNOWN_ERROR: 99
};
