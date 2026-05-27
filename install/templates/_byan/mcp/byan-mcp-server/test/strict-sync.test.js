import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pushLock, pushVerify, pushComplete, pushAbort, fetchSession, syncEnabled, resolveProjectId,
} from '../lib/strict-sync.js';

const TOKEN = 'byan_' + '0'.repeat(64);
const scopeLock = {
  scope_text: 'Persist strict sessions server-side',
  scope_hash: 'abc123',
  acceptance_criteria: ['a', 'b'],
  allowed_paths: ['_byan/**'],
};

function recordingFetch(response) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, method: opts.method, headers: opts.headers, body: opts.body ? JSON.parse(opts.body) : null });
    return response;
  };
  return { calls, fetchImpl };
}

const ok2xx = (data = { id: 'sess-1' }) => ({ ok: true, status: 201, json: async () => ({ data }) });

test('syncEnabled reflects token presence', () => {
  assert.equal(syncEnabled({ token: '' }), false);
  assert.equal(syncEnabled({ token: TOKEN }), true);
});

test('pushLock without token degrades to synced:false / no_token', async () => {
  const r = await pushLock({ sessionId: 'sess-1', scopeLock }, { token: '' });
  assert.equal(r.synced, false);
  assert.equal(r.reason, 'no_token');
});

test('pushLock posts to /api/strict-sessions with ApiKey scheme and full payload', async () => {
  const { calls, fetchImpl } = recordingFetch(ok2xx());
  const r = await pushLock(
    { sessionId: 'sess-1', scopeLock, projectId: 'proj-1', featureName: 'feat' },
    { token: TOKEN, apiUrl: 'http://api', fetchImpl }
  );
  assert.equal(r.synced, true);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, 'http://api/api/strict-sessions');
  assert.match(calls[0].headers.Authorization, /^ApiKey byan_/);
  assert.equal(calls[0].body.id, 'sess-1');
  assert.equal(calls[0].body.scopeText, scopeLock.scope_text);
  assert.deepEqual(calls[0].body.acceptanceCriteria, ['a', 'b']);
  assert.equal(calls[0].body.projectId, 'proj-1');
});

test('Bearer scheme used for non-byan tokens', async () => {
  const { calls, fetchImpl } = recordingFetch(ok2xx());
  await pushLock({ sessionId: 'sess-1', scopeLock }, { token: 'jwt.token.here', apiUrl: 'http://api', fetchImpl });
  assert.match(calls[0].headers.Authorization, /^Bearer /);
});

test('pushVerify PATCHes a verify pass', async () => {
  const { calls, fetchImpl } = recordingFetch(ok2xx({ id: 'sess-1' }));
  const r = await pushVerify(
    { sessionId: 'sess-1', pass: { pass: 2, verdict: 'gap', findings: ['x'], completed_at: 'now' } },
    { token: TOKEN, apiUrl: 'http://api', fetchImpl }
  );
  assert.equal(r.synced, true);
  assert.equal(calls[0].method, 'PATCH');
  assert.equal(calls[0].url, 'http://api/api/strict-sessions/sess-1');
  assert.equal(calls[0].body.verifyPass.verdict, 'gap');
  assert.deepEqual(calls[0].body.verifyPass.findings, ['x']);
});

test('pushComplete PATCHes completion with audit token', async () => {
  const { calls, fetchImpl } = recordingFetch(ok2xx());
  await pushComplete({ sessionId: 'sess-1', auditToken: 'tok', completedAt: 'now' }, { token: TOKEN, apiUrl: 'http://api', fetchImpl });
  assert.equal(calls[0].body.complete.auditToken, 'tok');
});

test('pushAbort PATCHes an abort', async () => {
  const { calls, fetchImpl } = recordingFetch(ok2xx());
  await pushAbort({ sessionId: 'sess-1', reason: 'changed mind' }, { token: TOKEN, apiUrl: 'http://api', fetchImpl });
  assert.equal(calls[0].body.abort.reason, 'changed mind');
});

test('fetchSession GETs the authoritative record', async () => {
  const { calls, fetchImpl } = recordingFetch({ ok: true, status: 200, json: async () => ({ data: { id: 'sess-1', completed: true } }) });
  const r = await fetchSession({ sessionId: 'sess-1' }, { token: TOKEN, apiUrl: 'http://api', fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.data.completed, true);
  assert.equal(calls[0].method, 'GET');
});

test('non-2xx response is synced:false with http_ reason', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({ error: 'nope', code: 'FORBIDDEN' }) });
  const r = await pushComplete({ sessionId: 'sess-1', auditToken: 't' }, { token: TOKEN, apiUrl: 'http://api', fetchImpl });
  assert.equal(r.synced, false);
  assert.equal(r.reason, 'http_403');
});

test('network error is swallowed into synced:false', async () => {
  const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
  const r = await pushAbort({ sessionId: 'sess-1' }, { token: TOKEN, apiUrl: 'http://api', fetchImpl });
  assert.equal(r.synced, false);
  assert.equal(r.reason, 'network_error');
});

test('missing scopeLock guards pushLock', async () => {
  const r = await pushLock({ sessionId: 'sess-1' }, { token: TOKEN });
  assert.equal(r.synced, false);
  assert.equal(r.reason, 'no_scope_lock');
});

test('resolveProjectId returns first match id from search', async () => {
  const { calls, fetchImpl } = recordingFetch({
    ok: true, status: 200, json: async () => ({ data: [{ id: 'proj-42', name: 'Demo' }], total: 1 }),
  });
  const id = await resolveProjectId({ name: 'Demo' }, { token: TOKEN, apiUrl: 'http://api', fetchImpl });
  assert.equal(id, 'proj-42');
  assert.equal(calls[0].method, 'GET');
  assert.match(calls[0].url, /\/api\/projects\/search\?slug=Demo/);
});

test('resolveProjectId returns null when no match or no term', async () => {
  const { fetchImpl } = recordingFetch({ ok: true, status: 200, json: async () => ({ data: [], total: 0 }) });
  assert.equal(await resolveProjectId({ name: 'Nope' }, { token: TOKEN, apiUrl: 'http://api', fetchImpl }), null);
  assert.equal(await resolveProjectId({}, { token: TOKEN }), null);
});
