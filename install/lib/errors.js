/**
 * Custom Error Classes
 * 
 * @module errors
 */

class YanInstallerError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'YanInstallerError';
  }
}

class NodeVersionError extends YanInstallerError {
  constructor(required, current) {
    super(`Node.js ${required}+ required, got ${current}`);
    this.name = 'NodeVersionError';
    this.required = required;
    this.current = current;
  }
}

class PlatformNotFoundError extends YanInstallerError {
  constructor(platform) {
    super(`Platform not found: ${platform}`);
    this.name = 'PlatformNotFoundError';
    this.platform = platform;
  }
}

class PermissionError extends YanInstallerError {
  constructor(path) {
    super(`Permission denied: ${path}`);
    this.name = 'PermissionError';
    this.path = path;
  }
}

class ValidationError extends YanInstallerError {
  constructor(message, failures) {
    super(message);
    this.name = 'ValidationError';
    this.failures = failures;
  }
}

class BackupError extends YanInstallerError {
  constructor(message, options) {
    super(message, options);
    this.name = 'BackupError';
  }
}

module.exports = {
  YanInstallerError,
  NodeVersionError,
  PlatformNotFoundError,
  PermissionError,
  ValidationError,
  BackupError
};
