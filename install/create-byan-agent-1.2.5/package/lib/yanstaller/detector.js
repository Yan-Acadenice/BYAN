/**
 * DETECTOR Module
 * 
 * Detects OS, Node.js version, Git, and installed platforms.
 * 
 * Phase 1: 40h development
 * 
 * @module yanstaller/detector
 */

const osDetector = require('../utils/os-detector');
const nodeDetector = require('../utils/node-detector');
const gitDetector = require('../utils/git-detector');
const platforms = require('../platforms');

/**
 * @typedef {Object} DetectionResult
 * @property {string} os - 'windows' | 'linux' | 'macos'
 * @property {string} osVersion - e.g., '11' for Windows 11
 * @property {string} nodeVersion - e.g., '18.19.0'
 * @property {boolean} hasGit
 * @property {string} [gitVersion] - e.g., '2.43.0'
 * @property {PlatformInfo[]} platforms - Detected platforms
 */

/**
 * @typedef {Object} PlatformInfo
 * @property {string} name - 'copilot-cli' | 'vscode' | 'claude' | 'codex'
 * @property {boolean} detected
 * @property {string} [path] - Installation path if detected
 * @property {string} [version] - Version if detected
 */

const logger = require('../utils/logger');

/**
 * Detect full environment
 * 
 * Runs parallel detection for speed.
 * Non-blocking: platform detection failures are caught and logged.
 * 
 * @returns {Promise<DetectionResult>}
 */
async function detect() {
  // Parallel detection for speed (Mantra #7 KISS)
  const [osInfo, nodeVersion, gitInfo] = await Promise.all([
    osDetector.detect(),
    Promise.resolve(nodeDetector.detect()), // Sync wrapped in Promise
    gitDetector.detect()
  ]);
  
  // Platform detection with timeout protection
  const platformNames = ['copilot-cli', 'vscode', 'claude', 'codex'];
  const platformsInfo = await Promise.all(
    platformNames.map(name => detectPlatform(name))
  );
  
  // Check if ALL platforms failed
  const allFailed = platformsInfo.every(p => !p.detected);
  if (allFailed) {
    const errors = platformsInfo
      .filter(p => p.error)
      .map(p => `${p.name}: ${p.error}`)
      .join(', ');
    if (errors) {
      logger.warn(`0/4 platforms detected. Errors: [${errors}]`);
    }
  }
  
  return {
    os: osInfo.name,
    osVersion: osInfo.version,
    nodeVersion,
    hasGit: gitInfo.installed,
    gitVersion: gitInfo.version,
    platforms: platformsInfo
  };
}

/**
 * Check if Node.js version meets minimum requirement
 * 
 * Handles version suffixes (-beta, -rc1) by stripping them.
 * 
 * @param {string} currentVersion - e.g., '18.19.0'
 * @param {string} requiredVersion - e.g., '18.0.0'
 * @returns {boolean}
 */
function isNodeVersionValid(currentVersion, requiredVersion) {
  return nodeDetector.meetsRequirement(currentVersion, requiredVersion);
}

/**
 * Detect specific platform
 * 
 * Non-blocking: errors are caught and returned in result.
 * 
 * @param {string} platformName - 'copilot-cli' | 'vscode' | 'claude' | 'codex'
 * @returns {Promise<PlatformInfo>}
 */
async function detectPlatform(platformName) {
  const platform = platforms[platformName];
  if (!platform) {
    throw new Error(`Unknown platform: ${platformName}`);
  }
  
  try {
    const detected = await platform.detect();
    
    // Handle timeout response format (object with detected + error)
    if (typeof detected === 'object' && 'error' in detected) {
      logger.warn(`Platform ${platformName} detection failed: ${detected.error}`);
      return {
        name: platformName,
        detected: false,
        error: detected.error
      };
    }
    
    return {
      name: platformName,
      detected: !!detected,
      path: detected ? platform.getPath() : undefined
    };
  } catch (error) {
    // Non-blocking: platform detection failure shouldn't crash detection
    // Error UX: Log warning and include in report for user visibility
    logger.warn(`Platform ${platformName} detection failed: ${error.message}`);
    return {
      name: platformName,
      detected: false,
      error: error.message
    };
  }
}

module.exports = {
  detect,
  isNodeVersionValid,
  detectPlatform
};
