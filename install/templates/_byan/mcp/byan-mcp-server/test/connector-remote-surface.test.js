import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createByanServer, REMOTE_SAFE_TOOLS } from '../server.js';

const TOKEN = 'byan_' + 'c'.repeat(40);

async function withRemoteClient(fn) {
  const server = createByanServer({ token: TOKEN, remoteOnly: true });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'surface-test', version: '0' }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

test('remoteOnly server advertises EXACTLY the remote-safe allowlist', async () => {
  await withRemoteClient(async (client) => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    const expected = [...REMOTE_SAFE_TOOLS].sort();
    assert.deepEqual(names, expected);
    // sanity: the full stdio surface is much larger than the remote allowlist
    assert.ok(expected.length >= 15 && expected.length <= 25);
  });
});

test('remoteOnly server hides every fs-local / write tool', async () => {
  await withRemoteClient(async (client) => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    for (const hidden of [
      'byan_fd_status',
      'byan_strict_status',
      'byan_kanban_get',
      'byan_soul_read',
      'byan_api_projects_create',
      'byan_api_workflows_run',
      'byan_api_chat_send',
      'byan_import_project',
      'byan_leantime_ping',
    ]) {
      assert.ok(!names.has(hidden), `${hidden} must NOT be on the remote surface`);
    }
  });
});

test('remoteOnly: calling a non-allowlisted tool is a per-tool error, not a crash', async () => {
  await withRemoteClient(async (client) => {
    const res = await client.callTool({ name: 'byan_fd_status', arguments: {} });
    assert.equal(res.isError, true);
    const text = (res.content && res.content[0] && res.content[0].text) || '';
    assert.match(text, /not available on the remote BYAN connector/i);
  });
});
