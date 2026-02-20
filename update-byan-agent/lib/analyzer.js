const fs = require('fs');
const path = require('path');
const https = require('https');
const yaml = require('js-yaml');

/**
 * Analyzer - Version checking and comparison module
 * Validates current BYAN installation version vs npm registry
 */
class Analyzer {
  constructor(installPath) {
    this.installPath = installPath;
    this.configPath = path.join(installPath, '_byan', 'bmb', 'config.yaml');
  }

  /**
   * Check current version from _byan/bmb/config.yaml
   * @returns {Promise<string|null>} Current version or null if not found
   */
  async checkCurrentVersion() {
    try {
      if (!fs.existsSync(this.configPath)) {
        return null;
      }

      const configContent = fs.readFileSync(this.configPath, 'utf8');
      const config = yaml.load(configContent);
      
      return config.byan_version || null;
    } catch (error) {
      throw new Error(`Erreur lecture config.yaml: ${error.message}`);
    }
  }

  /**
   * Fetch latest version from npm registry
   * @returns {Promise<string>} Latest version available on npm
   */
  async fetchLatestVersion() {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'registry.npmjs.org',
        path: '/create-byan-agent/latest',
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.version);
          } catch (error) {
            reject(new Error(`Erreur parsing npm response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Erreur connexion npm registry: ${error.message}`));
      });

      req.end();
    });
  }

  /**
   * Compare two semver versions
   * @param {string} current - Current version (e.g., "2.6.0")
   * @param {string} latest - Latest version (e.g., "2.6.1")
   * @returns {number} -1 if current < latest, 0 if equal, 1 if current > latest
   */
  compare(current, latest) {
    const parseCurrent = this._parseSemver(current);
    const parseLatest = this._parseSemver(latest);

    if (parseCurrent.major !== parseLatest.major) {
      return parseCurrent.major < parseLatest.major ? -1 : 1;
    }
    if (parseCurrent.minor !== parseLatest.minor) {
      return parseCurrent.minor < parseLatest.minor ? -1 : 1;
    }
    if (parseCurrent.patch !== parseLatest.patch) {
      return parseCurrent.patch < parseLatest.patch ? -1 : 1;
    }
    
    return 0;
  }

  /**
   * Parse semver string to object
   * @param {string} version - Version string (e.g., "2.6.1")
   * @returns {{major: number, minor: number, patch: number}}
   */
  _parseSemver(version) {
    const parts = version.split('.').map(Number);
    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      patch: parts[2] || 0
    };
  }

  /**
   * Check if update is available
   * @returns {Promise<{current: string, latest: string, needsUpdate: boolean}>}
   */
  async checkVersion() {
    const current = await this.checkCurrentVersion();
    const latest = await this.fetchLatestVersion();

    if (!current) {
      throw new Error('Version actuelle introuvable dans config.yaml');
    }

    const comparison = this.compare(current, latest);
    
    return {
      current,
      latest,
      needsUpdate: comparison < 0,
      upToDate: comparison === 0,
      ahead: comparison > 0
    };
  }
}

module.exports = Analyzer;
