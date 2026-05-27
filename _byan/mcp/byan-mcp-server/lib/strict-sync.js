// BYAN Strict Mode — API sync layer.
//
// The byan_web API is the authority for strict sessions; the local
// .byan-strict/ state is a mirror. This module is the only place that talks to
// the network on behalf of strict mode — strict-mode.js stays pure-local.
//
// Every push is best-effort: a missing token, an unreachable API, or a non-2xx
// response degrades to { synced: false, reason } and never throws. The local
// protocol must keep working whether or not the API answers. Reads
// (fetchSession) are how the authority is consulted; callers decide how to
// reconcile, with the local state as the offline fallback.

const DEFAULT_TIMEOUT_MS = 4000;

function apiBase() {
  return (process.env.BYAN_API_URL || 'http://localhost:3737').replace(/\/+$/, '');
}

function apiToken() {
  return process.env.BYAN_API_TOKEN || '';
}

function authHeader(token) {
  if (!token) return {};
  const scheme = token.startsWith('byan_') ? 'ApiKey' : 'Bearer';
  return { Authorization: `${scheme} ${token}` };
}

export function syncEnabled({ token = apiToken() } = {}) {
  return Boolean(token);
}

async function request(
  method,
  routePath,
  { body, apiUrl = apiBase(), token = apiToken(), fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  if (!token) return { ok: false, synced: false, reason: 'no_token' };
  if (typeof fetchImpl !== 'function') return { ok: false, synced: false, reason: 'no_fetch' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${apiUrl}${routePath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      return { ok: false, synced: false, reason: `http_${res.status}`, status: res.status, data };
    }
    return { ok: true, synced: true, status: res.status, data: data ? data.data : null };
  } catch (err) {
    return { ok: false, synced: false, reason: err && err.name === 'AbortError' ? 'timeout' : 'network_error', error: err ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// POST /api/strict-sessions — create or upsert at scope-lock time.
export function pushLock(
  { sessionId, scopeLock, projectId = process.env.BYAN_PROJECT_ID || null, featureName = null },
  opts = {}
) {
  if (!scopeLock) return Promise.resolve({ ok: false, synced: false, reason: 'no_scope_lock' });
  return request('POST', '/api/strict-sessions', {
    ...opts,
    body: {
      id: sessionId,
      projectId,
      featureName,
      scopeText: scopeLock.scope_text,
      scopeHash: scopeLock.scope_hash,
      acceptanceCriteria: scopeLock.acceptance_criteria,
      allowedPaths: scopeLock.allowed_paths,
    },
  });
}

// PATCH /api/strict-sessions/:id — append one verify pass.
export function pushVerify({ sessionId, pass }, opts = {}) {
  if (!sessionId || !pass) return Promise.resolve({ ok: false, synced: false, reason: 'missing_args' });
  return request('PATCH', `/api/strict-sessions/${encodeURIComponent(sessionId)}`, {
    ...opts,
    body: {
      verifyPass: {
        pass: pass.pass,
        verdict: pass.verdict,
        findings: pass.findings || [],
        completedAt: pass.completed_at,
      },
    },
  });
}

// PATCH /api/strict-sessions/:id — mark completed, store the audit token.
export function pushComplete({ sessionId, auditToken, completedAt }, opts = {}) {
  if (!sessionId) return Promise.resolve({ ok: false, synced: false, reason: 'missing_args' });
  return request('PATCH', `/api/strict-sessions/${encodeURIComponent(sessionId)}`, {
    ...opts,
    body: { complete: { auditToken, completedAt } },
  });
}

// PATCH /api/strict-sessions/:id — deliberate abort.
export function pushAbort({ sessionId, reason }, opts = {}) {
  if (!sessionId) return Promise.resolve({ ok: false, synced: false, reason: 'missing_args' });
  return request('PATCH', `/api/strict-sessions/${encodeURIComponent(sessionId)}`, {
    ...opts,
    body: { abort: { reason: reason || null } },
  });
}

// GET /api/strict-sessions/:id — read the authoritative server record.
export function fetchSession({ sessionId }, opts = {}) {
  if (!sessionId) return Promise.resolve({ ok: false, synced: false, reason: 'missing_args' });
  return request('GET', `/api/strict-sessions/${encodeURIComponent(sessionId)}`, opts);
}

// Resolve a byan_web project id from the active FD project_context (slug/name).
// Best-effort: returns the id of the first match, or null when nothing matches.
export async function resolveProjectId({ slug, name } = {}, opts = {}) {
  const term = name || slug;
  if (!term) return null;
  const res = await request('GET', `/api/projects/search?slug=${encodeURIComponent(term)}`, opts);
  if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
    return res.data[0].id;
  }
  return null;
}
