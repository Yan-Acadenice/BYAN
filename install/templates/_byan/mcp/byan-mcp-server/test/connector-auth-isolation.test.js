import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createByanServer, resolveCallerToken } from '../server.js';

// Synthetic tokens — shape only, never real secrets.
const TOKEN_A = 'byan_' + 'a'.repeat(40);
const TOKEN_B = 'byan_' + 'b'.repeat(40);

// Mock fetch that captures the outbound Authorization header per call. byan_ping
// hits GET /api/health, so a JSON 200 lets the ping handler complete.
function mockFetchCapturing(capture) {
  return async (url, options = {}) => {
    const headers = options.headers || {};
    capture.push({ url: String(url), authorization: headers.Authorization });
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (h) => (String(h).toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      text: async () => JSON.stringify({ ok: true, version: 'test' }),
    };
  };
}

// Build a server bound to `token`, link a client over an in-memory transport
// pair (this exercises the real initialize handshake), call byan_ping, and
// return the captured outbound calls. Each call gets its OWN server instance,
// exactly like the stateless HTTP connector builds one per request.
async function callPing(token, capture) {
  const origFetch = global.fetch;
  global.fetch = mockFetchCapturing(capture);
  try {
    const server = createByanServer({ token });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'isolation-test', version: '0' }, { capabilities: {} });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools = await client.listTools();
    await client.callTool({ name: 'byan_ping', arguments: {} });
    await client.close();
    await server.close();
    return tools;
  } finally {
    global.fetch = origFetch;
  }
}

test('handshake: an in-memory client can list tools from a fresh server (byan_ping present)', async () => {
  const cap = [];
  const tools = await callPing(TOKEN_A, cap);
  const names = (tools.tools || []).map((t) => t.name);
  assert.ok(names.includes('byan_ping'), 'byan_ping must be advertised after the handshake');
});

test('CRITICAL: two tokens -> two distinct Authorization headers (no shared identity, GH#44980)', async () => {
  const capA = [];
  const capB = [];
  await callPing(TOKEN_A, capA);
  await callPing(TOKEN_B, capB);

  assert.equal(capA.length, 1, 'ping A should make exactly one outbound call');
  assert.equal(capB.length, 1, 'ping B should make exactly one outbound call');
  assert.equal(capA[0].authorization, `ApiKey ${TOKEN_A}`);
  assert.equal(capB[0].authorization, `ApiKey ${TOKEN_B}`);
  assert.notEqual(
    capA[0].authorization,
    capB[0].authorization,
    'each caller must reach byan_web with ITS OWN token, never a shared global'
  );
});

test('no per-request token -> no per-request identity leaks (header is not either caller token)', async () => {
  const cap = [];
  await callPing(undefined, cap);
  // Depending on the local env BYAN_API_TOKEN this is undefined or the env
  // fallback; the invariant that matters is it is NEVER another caller's token.
  assert.notEqual(cap[0].authorization, `ApiKey ${TOKEN_A}`);
  assert.notEqual(cap[0].authorization, `ApiKey ${TOKEN_B}`);
});

// Token resolution policy (pure, env-independent). The CRITICAL one is the
// remoteOnly + no-token case: it must NOT fall back to the host env token, or a
// no-header remote request would silently act as the host identity.
test('resolveCallerToken: remoteOnly NEVER falls back to the host env token', () => {
  const ENV = 'byan_' + 'e'.repeat(40);
  // remote + a per-request token -> that token
  assert.equal(resolveCallerToken({ token: TOKEN_A, remoteOnly: true, envToken: ENV }), TOKEN_A);
  // remote + NO token -> undefined, even though the host env token is set (the fix)
  assert.equal(resolveCallerToken({ token: undefined, remoteOnly: true, envToken: ENV }), undefined);
  assert.equal(resolveCallerToken({ token: '', remoteOnly: true, envToken: ENV }), undefined);
});

test('resolveCallerToken: local stdio path keeps the env token as fallback', () => {
  const ENV = 'byan_' + 'e'.repeat(40);
  // stdio + no token -> env fallback (single-developer path, unchanged)
  assert.equal(resolveCallerToken({ token: undefined, remoteOnly: false, envToken: ENV }), ENV);
  // stdio + an explicit token still wins
  assert.equal(resolveCallerToken({ token: TOKEN_B, remoteOnly: false, envToken: ENV }), TOKEN_B);
  // no token anywhere -> undefined (degrades, never throws here)
  assert.equal(resolveCallerToken({ token: undefined, remoteOnly: false, envToken: '' }), undefined);
});
