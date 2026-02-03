/**
 * Node.js Detector Utility
 * 
 * Detects Node.js version.
 * 
 * @module utils/node-detector
 */

/**
 * Detect Node.js version
 * 
 * @returns {string} - Version string (e.g., '18.19.0')
 */
function detect() {
  return process.version.slice(1); // Remove 'v' prefix
}

/**
 * Compare two semver versions
 * 
 * Strips version suffixes (-beta, -rc1, etc.) before comparison.
 * 
 * @param {string} version1 - First version
 * @param {string} version2 - Second version
 * @returns {number} - -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(version1, version2) {
  // Strip suffixes: '18.0.0-beta' → '18.0.0'
  const cleanV1 = version1.replace(/-.*$/, '');
  const cleanV2 = version2.replace(/-.*$/, '');
  
  const v1Parts = cleanV1.split('.').map(Number);
  const v2Parts = cleanV2.split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    if (v1Parts[i] > v2Parts[i]) return 1;
    if (v1Parts[i] < v2Parts[i]) return -1;
  }
  
  return 0;
}

/**
 * Check if Node version meets minimum requirement
 * 
 * @param {string} currentVersion - Current Node version
 * @param {string} requiredVersion - Required Node version
 * @returns {boolean}
 */
function meetsRequirement(currentVersion, requiredVersion) {
  return compareVersions(currentVersion, requiredVersion) >= 0;
}

module.exports = {
  detect,
  compareVersions,
  meetsRequirement
};
