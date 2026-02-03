/**
 * OS Detector Utility
 * 
 * Detects operating system and version.
 * 
 * @module utils/os-detector
 */

const os = require('os');

/**
 * Detect operating system
 * 
 * @returns {{name: string, version: string, platform: string}}
 */
function detect() {
  const platform = os.platform();
  const release = os.release();
  
  let name;
  switch (platform) {
    case 'win32':
      name = 'windows';
      break;
    case 'darwin':
      name = 'macos';
      break;
    case 'linux':
      name = 'linux';
      break;
    default:
      name = 'unknown';
  }
  
  return {
    name,
    version: release,
    platform
  };
}

/**
 * Check if running on Windows
 * 
 * @returns {boolean}
 */
function isWindows() {
  return os.platform() === 'win32';
}

/**
 * Check if running on macOS
 * 
 * @returns {boolean}
 */
function isMacOS() {
  return os.platform() === 'darwin';
}

/**
 * Check if running on Linux
 * 
 * @returns {boolean}
 */
function isLinux() {
  return os.platform() === 'linux';
}

module.exports = {
  detect,
  isWindows,
  isMacOS,
  isLinux
};
