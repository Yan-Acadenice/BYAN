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

/**
 * Leantime reachability probe.
 *
 * Mirrors the runtime client (lib/leantime-sync.js `rpc`) on the wire so the
 * probe validates the EXACT URL the MCP server will hit : POST `${base}/api/jsonrpc`
 * with the `x-api-key` header (Leantime's scheme — never ApiKey/Bearer). The
 * base is normalized like the runtime (trailing slashes stripped only, /api
 * NOT stripped) so a probe pass guarantees a runtime-reachable host.
 *
 * Wrong-host detection (the LEANTIME_API_URL lesson) : Leantime serves the HTML
 * app and the JSON-RPC API on the same domain. A 200 carrying HTML (or any
 * non-JSON body) means the URL points at the UI, not the /api/jsonrpc backend.
 * That surfaces as reason `non_json` with a hint, never read as an empty board.
 *
 * Never throws — always resolves with a plain result object. Uses
 * AbortController for a hard timeout (default 5s).
 *
 * @param {{ apiUrl: string, token?: string, timeoutMs?: number }} opts
 * @returns {Promise<{ reachable: boolean, status?: number, latencyMs?: number, reason?: string, hint?: string, error?: string }>}
 */
async function validateLeantimeReachability({ apiUrl, token, timeoutMs = 5000 }) {
  const base = String(apiUrl || '').replace(/\/+$/, '');
  if (!base) return { reachable: false, reason: 'no_base' };
  if (!token) return { reachable: false, reason: 'no_token' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();

  try {
    const res = await fetch(`${base}/api/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': token },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'byan-install-probe',
        method: 'leantime.rpc.projects.getAllProjects',
        params: {},
      }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - t0;
    clearTimeout(timer);

    if (!res.ok) {
      return { reachable: true, status: res.status, latencyMs, reason: `http_${res.status}` };
    }

    const contentType = (res.headers && typeof res.headers.get === 'function'
      ? res.headers.get('content-type') || ''
      : '').toLowerCase();
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (data === null || typeof data !== 'object') {
      const hint = contentType.includes('text/html')
        ? 'Got HTML, not JSON-RPC. LEANTIME_API_URL likely points at the Leantime UI, not the /api/jsonrpc backend.'
        : 'Expected a JSON-RPC envelope.';
      return { reachable: true, status: res.status, latencyMs, reason: 'non_json', hint };
    }

    // A JSON-RPC error envelope still proves the host + path are correct (e.g.
    // an auth/permission error) — the URL is right, only the call failed.
    if (data.error) {
      return { reachable: true, status: res.status, latencyMs, reason: 'rpc_error' };
    }
    return { reachable: true, status: res.status, latencyMs };
  } catch (err) {
    clearTimeout(timer);
    return {
      reachable: false,
      reason: err && err.name === 'AbortError' ? 'timeout' : 'network_error',
      error: err ? err.message || String(err) : 'unknown',
    };
  }
}

module.exports = {
  validateByanWebReachability,
  validateLeantimeReachability,
};
