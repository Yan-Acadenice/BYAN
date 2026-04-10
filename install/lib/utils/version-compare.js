/**
 * Version Comparison Utility
 *
 * Compares semver versions and fetches latest from npm registry.
 *
 * @module utils/version-compare
 */

const https = require('https');

/**
 * Compare two semver version strings.
 *
 * @param {string} a - First version (e.g., '2.7.9')
 * @param {string} b - Second version (e.g., '2.8.0')
 * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
 */
function compareVersions(a, b) {
  const partsA = a.replace(/^v/, '').split('.').map(Number);
  const partsB = b.replace(/^v/, '').split('.').map(Number);
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }

  return 0;
}

/**
 * Fetch the latest published version of a package from npm registry.
 *
 * @param {string} packageName - npm package name
 * @returns {Promise<string>} Latest version string
 */
function getLatestVersion(packageName) {
  const url = `https://registry.npmjs.org/${packageName}/latest`;

  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`npm registry returned ${res.statusCode} for ${packageName}`));
        res.resume();
        return;
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.version);
        } catch (err) {
          reject(new Error(`Failed to parse npm registry response: ${err.message}`));
        }
      });
    }).on('error', (err) => {
      reject(new Error(`Failed to reach npm registry: ${err.message}`));
    });
  });
}

module.exports = {
  compareVersions,
  getLatestVersion
};
