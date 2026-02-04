/**
 * Git Detector Utility
 * 
 * Detects if Git is installed.
 * 
 * @module utils/git-detector
 */

const { execSync } = require('child_process');

/**
 * Detect if Git is installed
 * 
 * @returns {Promise<{installed: boolean, version: string | null}>}
 */
async function detect() {
  try {
    const version = execSync('git --version', { encoding: 'utf8' }).trim();
    const versionMatch = version.match(/git version ([\d.]+)/);
    
    return {
      installed: true,
      version: versionMatch ? versionMatch[1] : null
    };
  } catch {
    return {
      installed: false,
      version: null
    };
  }
}

module.exports = {
  detect
};
