'use strict';

/**
 * subscription-status — best-effort check of the integrations/status endpoint.
 *
 * Called at install time to surface which integrations (e.g. Google Workspace)
 * are included in the user's byan_web subscription. Never throws: any network
 * error or missing endpoint is silenced so the install is never blocked.
 *
 * The fetchImpl parameter follows the injectable-dep pattern used throughout
 * the installer (gdoc-setup, rtk-integration) so the function is fully
 * unit-testable without a real network.
 *
 * fetchImpl signature: async (url, opts) => { json: async () => any }
 * Defaults to a built-in Node http/https wrapper compatible with the inline
 * block that previously lived in create-byan-agent-v2.js.
 */

const https = require('https');
const http = require('http');

/**
 * Default fetchImpl: wraps Node's http/https.get in a Promise.
 * Returns an object with a json() method (mirrors the fetch API surface
 * used by the tests).
 */
function nodeFetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      return reject(e);
    }
    const transport = parsedUrl.protocol === 'https:' ? https : http;
    const req = transport.get(
      url,
      {
        headers: opts.headers || {},
        timeout: opts.timeout || 5000,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          resolve({
            json: async () => JSON.parse(raw),
          });
        });
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

/**
 * Check the /api/integrations/status endpoint and return a plain object
 * describing what is included in the subscription.
 *
 * @param {object} opts
 * @param {string} opts.apiUrl   - Base URL of the byan_web API (no trailing slash, no /api)
 * @param {string} opts.token    - ApiKey token
 * @param {Function} [opts.fetchImpl] - Injectable fetch function (default: nodeFetch above)
 * @returns {Promise<{ google: { configured: boolean, entitled: boolean, reachable: boolean } | null, error: string | null }>}
 */
async function checkSubscriptionStatus({ apiUrl, token, fetchImpl = nodeFetch } = {}) {
  const statusUrl = `${apiUrl}/api/integrations/status`;
  try {
    const res = await fetchImpl(statusUrl, {
      headers: { Authorization: `ApiKey ${token}` },
      timeout: 5000,
    });
    const body = await res.json();
    const google = (body && body.data && body.data.google) || null;
    return { google, error: null };
  } catch (e) {
    return { google: null, error: e.message };
  }
}

module.exports = { checkSubscriptionStatus, nodeFetch };
