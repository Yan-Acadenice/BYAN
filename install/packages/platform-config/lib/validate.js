/**
 * byan_web reachability probe.
 *
 * Never throws — always resolves with a plain result object. Uses
 * AbortController to enforce a hard timeout (default 5s).
 */

const { stripApiSuffix, buildAuthHeader } = require('./url-utils');

/**
 * @param {{ apiUrl: string, token?: string, timeoutMs?: number }} opts
 * @returns {Promise<{ reachable: boolean, status?: number, latencyMs?: number, error?: string }>}
 */
async function validateByanWebReachability({ apiUrl, token, timeoutMs = 5000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers = buildAuthHeader(token);
  const url = `${stripApiSuffix(apiUrl)}/api/health`;
  const t0 = Date.now();

  try {
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    const latencyMs = Date.now() - t0;
    clearTimeout(timer);

    if (res.status >= 200 && res.status < 400) {
      return { reachable: true, status: res.status, latencyMs };
    }
    return {
      reachable: true,
      status: res.status,
      latencyMs,
      error: `HTTP ${res.status}`,
    };
  } catch (err) {
    clearTimeout(timer);
    return { reachable: false, error: err.message || String(err) };
  }
}

module.exports = {
  validateByanWebReachability,
};
