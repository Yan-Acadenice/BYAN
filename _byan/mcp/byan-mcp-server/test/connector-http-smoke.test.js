import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { httpServer, MCP_PATH } from '../server-http.js';

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
