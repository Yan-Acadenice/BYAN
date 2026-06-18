import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { httpServer, MCP_PATH, PRM_PATH, protectedResourceMetadata, validateBearer } from '../server-http.js';

// Smoke test for the remote connector sidecar transport shell.
//
// WHY: the HTTP connector fronts the MCP pilot. An ESM/import break, a botched
// export, or a transport wiring regression in server-http.js would only surface
// as a 502 from the pilot at runtime. This test imports the module, binds the
// native http.Server on an ephemeral port, and probes the synchronous /health
// route -- catching a broken module before it can 502 anything downstream.
//
// The entrypoint guard (isHttpEntrypoint) means importing the module does NOT
// bind a port, so this test owns listen(0)/close() itself. No byan_web, no PG,
// no external network: the server is started in-process and torn down here.

// Teardown: close the listener so `node --test` exits cleanly instead of
// hanging on an open handle.
after(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
});

test('GET /health returns 200 with the connector transport descriptor', async () => {
  await new Promise((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address();

  const res = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.path, MCP_PATH);
});

test('GET on an unknown path returns 404', async () => {
  // The server is already listening from the previous test (same shared
  // instance); reuse its bound port rather than re-listening.
  const { port } = httpServer.address();

  const res = await fetch(`http://127.0.0.1:${port}/nope`);
  assert.equal(res.status, 404);
});

// F7/F10: the RFC 9728 Protected Resource Metadata is served publicly, on both
// the bare well-known path and the path-suffixed variant, with the MCP endpoint
// as `resource` and a non-empty authorization_servers list.
test('GET /.well-known/oauth-protected-resource returns RFC 9728 metadata', async () => {
  const { port } = httpServer.address();

  const res = await fetch(`http://127.0.0.1:${port}${PRM_PATH}`);
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.ok(body.resource.endsWith(MCP_PATH), 'resource points at the MCP endpoint');
  assert.ok(Array.isArray(body.authorization_servers) && body.authorization_servers.length > 0,
    'authorization_servers is a non-empty array');
});

test('GET the path-suffixed PRM variant returns the same shape', async () => {
  const { port } = httpServer.address();

  const res = await fetch(`http://127.0.0.1:${port}${PRM_PATH}${MCP_PATH}`);
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.ok(body.resource.endsWith(MCP_PATH));
  assert.ok(Array.isArray(body.authorization_servers) && body.authorization_servers.length > 0);
});

// F8/F10: an /mcp hit with no Authorization is rejected 401 with the RFC 9728
// challenge BEFORE any tool server is built. No byan_web needed — the missing
// token short-circuits before the loopback validation.
test('POST /mcp without a Bearer returns 401 + WWW-Authenticate challenge', async () => {
  const { port } = httpServer.address();

  const res = await fetch(`http://127.0.0.1:${port}${MCP_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert.equal(res.status, 401);

  const challenge = res.headers.get('www-authenticate');
  assert.ok(challenge && challenge.startsWith('Bearer'), 'challenge is a Bearer scheme');
  assert.ok(challenge.includes('resource_metadata='), 'challenge carries resource_metadata');
});

// F8: validateBearer is fail-closed. A stub /api/auth/me returning 200 passes;
// a 401 (or any non-2xx), a thrown fetch, and a timeout all fail closed. This
// is the loopback contract without needing a live byan_web.
test('validateBearer: 2xx passes, non-2xx and network failure fail closed', async () => {
  const ok200 = await validateBearer('byan_x', {
    apiBase: 'http://stub',
    fetchImpl: async () => ({ status: 200 }),
  });
  assert.equal(ok200, true);

  const denied401 = await validateBearer('byan_x', {
    apiBase: 'http://stub',
    fetchImpl: async () => ({ status: 401 }),
  });
  assert.equal(denied401, false);

  const networkError = await validateBearer('byan_x', {
    apiBase: 'http://stub',
    fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
  });
  assert.equal(networkError, false);

  const noToken = await validateBearer('', { apiBase: 'http://stub', fetchImpl: async () => ({ status: 200 }) });
  assert.equal(noToken, false);
});

// F8: the ApiKey scheme byan_web expects is preserved end-to-end — validateBearer
// must send a byan_ token as `ApiKey <token>`, not Bearer, or /api/auth/me 401s.
test('validateBearer forwards a byan_ token with the ApiKey scheme', async () => {
  let seenAuth = null;
  await validateBearer('byan_abc', {
    apiBase: 'http://stub',
    fetchImpl: async (url, opts) => { seenAuth = opts.headers.Authorization; return { status: 200 }; },
  });
  assert.equal(seenAuth, 'ApiKey byan_abc');
});

// protectedResourceMetadata honors x-forwarded-proto so the advertised resource
// URL is https behind Traefik even though the connector is reached over http.
test('protectedResourceMetadata honors x-forwarded-proto for the public scheme', () => {
  const md = protectedResourceMetadata({
    headers: { host: 'byan-mcp.example.com', 'x-forwarded-proto': 'https' },
  });
  assert.ok(md.resource.startsWith('https://byan-mcp.example.com'));
  assert.ok(md.resource.endsWith(MCP_PATH));
});
