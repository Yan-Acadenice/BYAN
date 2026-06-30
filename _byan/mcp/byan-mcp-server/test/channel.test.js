/**
 * test/channel.test.js — Tests du channel MCP byan (F2a).
 *
 * Runner : node:test (même runner que tous les autres tests du package).
 * Réseau : 100% mocké via fetchImpl — aucun appel réel.
 *
 * Cas couverts :
 *   1. Notification émise pour un message dans l'outbox (happy path)
 *   2. Reply tool POST correct (session_id, content, headers)
 *   3. Poll best-effort : ne plante pas si l'API est injoignable
 *   4. Gate sender : un message sans session_id est ignoré (pas de notification)
 *   5. Poll best-effort : ne plante pas sur 500 API
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';
import { startPollLoop } from '../lib/channel-poll.js';
import { createChannelServer } from '../lib/channel-server.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Construit un stub fetch qui répond selon une map { url_fragment: handler }.
 * Le handler est (url, opts) => Response (ou { ok, status, json() }).
 */
function makeFetch(routes) {
  return async (url, opts) => {
    for (const [fragment, handler] of Object.entries(routes)) {
      if (url.includes(fragment)) return handler(url, opts);
    }
    // Par défaut : 404 pour les routes non déclarées.
    return { ok: false, status: 404, text: async () => 'Not Found', json: async () => ({}) };
  };
}

/** Stub Response minimal compatible avec ce que channel-poll.js attend. */
function okJson(data) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function errResponse(status) {
  return {
    ok: false,
    status,
    headers: { get: () => 'text/plain' },
    json: async () => ({}),
    text: async () => `HTTP ${status}`,
  };
}

/** Attend que la condition soit vraie, en relançant à intervalles. */
async function waitFor(predicate, { timeoutMs = 2000, checkMs = 20 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(r => setTimeout(r, checkMs));
  }
  throw new Error('waitFor timed out');
}

// ---------------------------------------------------------------------------
// Test 1 : notification émise pour un message outbox (happy path)
// ---------------------------------------------------------------------------

test('poll: notification émise pour un message outbox', async () => {
  const emitted = [];
  const ackUrls = [];

  const outboxMsg = { id: 'msg-001', session_id: 'sess-abc', content: 'Bonjour Claude' };

  // Outbox retourne un message au premier poll, vide ensuite.
  let pollCount = 0;
  const fetchImpl = makeFetch({
    '/api/sessions/outbox': () => {
      pollCount++;
      if (pollCount === 1) return okJson({ data: [outboxMsg] });
      return okJson({ data: [] });
    },
    '/ack': (url) => {
      ackUrls.push(url);
      return okJson({ ok: true });
    },
  });

  const loop = startPollLoop({
    apiUrl: 'http://byan-test',
    apiToken: 'byan_test_token',
    intervalMs: 50, // rapide pour les tests
    fetchImpl,
    onMessage: async (msg) => { emitted.push(msg); },
  });

  // Attendre que le message soit traité.
  await waitFor(() => emitted.length >= 1);
  loop.stop();

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].id, 'msg-001');
  assert.equal(emitted[0].session_id, 'sess-abc');
  assert.equal(emitted[0].content, 'Bonjour Claude');

  // Ack appelé avec le bon URL.
  assert.ok(ackUrls.some(u => u.includes('sess-abc') && u.includes('msg-001') && u.includes('/ack')));
});

// ---------------------------------------------------------------------------
// Test 2 : reply tool POST correct (via le handler MCP réel)
// ---------------------------------------------------------------------------

test('reply tool: POST /api/sessions/:session_id/reply avec content et Authorization', async () => {
  const replyCalls = [];

  const fetchImpl = makeFetch({
    '/reply': (url, opts) => {
      replyCalls.push({ url, method: opts.method, headers: opts.headers, body: opts.body });
      return okJson({ ok: true });
    },
  });

  const server = createChannelServer({
    apiUrl: 'http://byan-test',
    apiToken: 'byan_test_token',
    intervalMs: 999_999, // pas de poll en test
    fetchImpl,
  });

  // Invoquer le handler CallTool via l'API interne _requestHandlers du SDK.
  // _requestHandlers est un Map<method_string, handler_fn> stable dans
  // @modelcontextprotocol/sdk >= 1.x. On l'utilise pour ne pas spawner
  // un transport stdio en test.
  const callToolHandler = server._requestHandlers?.get('tools/call');
  assert.ok(callToolHandler, 'CallTool handler doit être enregistré');

  const result = await callToolHandler(
    {
      method: 'tools/call',
      params: {
        name: 'byan_session_reply',
        arguments: { session_id: 'sess-xyz', content: 'Voici la réponse' },
      },
    },
    {}
  );

  // Le tool doit retourner { content: [{ type:'text', text: ... }] } sans isError.
  assert.ok(!result.isError, `tool ne doit pas retourner isError, got: ${JSON.stringify(result)}`);
  const text = JSON.parse(result.content[0].text);
  assert.equal(text.ok, true);
  assert.equal(text.session_id, 'sess-xyz');

  // Vérifier que fetch a bien été appelé avec le bon URL, method, headers, body.
  assert.equal(replyCalls.length, 1, 'fetch appelé une fois');
  assert.ok(replyCalls[0].url.includes('/api/sessions/sess-xyz/reply'), 'URL contient session_id');
  assert.equal(replyCalls[0].method, 'POST');

  const sent = JSON.parse(replyCalls[0].body);
  assert.equal(sent.content, 'Voici la réponse');

  const auth = replyCalls[0].headers.Authorization;
  assert.ok(auth && auth.startsWith('ApiKey '), `Authorization ApiKey scheme, got: ${auth}`);
});

// ---------------------------------------------------------------------------
// Test 3 : poll best-effort — ne plante pas si l'API est injoignable
// ---------------------------------------------------------------------------

test('poll: best-effort — ne plante pas si l\'API est injoignable', async () => {
  let pollAttempts = 0;

  // Toujours jeter une erreur réseau (ECONNREFUSED simulé).
  const fetchImpl = async () => {
    pollAttempts++;
    throw new Error('ECONNREFUSED connect ETIMEDOUT');
  };

  const loop = startPollLoop({
    apiUrl: 'http://byan-unreachable',
    apiToken: 'byan_test_token',
    intervalMs: 30,
    fetchImpl,
    onMessage: async () => {},
  });

  // Attendre 2 polls minimum sans crash.
  await waitFor(() => pollAttempts >= 2, { timeoutMs: 1000 });
  loop.stop();

  // Le test passe si on est ici sans exception non capturée.
  assert.ok(pollAttempts >= 2, `au moins 2 polls tentés, got ${pollAttempts}`);
});

// ---------------------------------------------------------------------------
// Test 4 : gate — message sans session_id est ignoré (pas de notification)
// ---------------------------------------------------------------------------

test('poll: message sans session_id est ignoré (gate)', async () => {
  const emitted = [];

  const malformed = { id: 'msg-bad', content: 'injection attempt' }; // pas de session_id

  let pollCount = 0;
  const fetchImpl = makeFetch({
    '/api/sessions/outbox': () => {
      pollCount++;
      if (pollCount === 1) return okJson({ data: [malformed] });
      return okJson({ data: [] });
    },
    '/ack': () => okJson({ ok: true }),
  });

  const loop = startPollLoop({
    apiUrl: 'http://byan-test',
    apiToken: 'byan_test_token',
    intervalMs: 30,
    fetchImpl,
    onMessage: async (msg) => { emitted.push(msg); },
  });

  // Attendre au moins 2 polls pour s'assurer que le message malformé est sauté.
  await waitFor(() => pollCount >= 2, { timeoutMs: 1000 });
  loop.stop();

  assert.equal(emitted.length, 0, 'aucune notification pour un message sans session_id');
});

// ---------------------------------------------------------------------------
// Test 5 : poll best-effort — ne plante pas sur 500 API
// ---------------------------------------------------------------------------

test('poll: best-effort — ne plante pas sur 500 serveur', async () => {
  let pollAttempts = 0;

  const fetchImpl = makeFetch({
    '/api/sessions/outbox': () => {
      pollAttempts++;
      return errResponse(500);
    },
  });

  const loop = startPollLoop({
    apiUrl: 'http://byan-test',
    apiToken: 'byan_test_token',
    intervalMs: 30,
    fetchImpl,
    onMessage: async () => {},
  });

  await waitFor(() => pollAttempts >= 2, { timeoutMs: 1000 });
  loop.stop();

  // Le test passe si on est ici sans crash.
  assert.ok(pollAttempts >= 2, `au moins 2 polls sur 500, got ${pollAttempts}`);
});

// ---------------------------------------------------------------------------
// Test 6 : createChannelServer — capability claude/channel déclarée
// ---------------------------------------------------------------------------

test('createChannelServer: capability claude/channel déclarée dans les options', () => {
  // On ne peut pas inspecter les capabilities après construction via l'API
  // publique du SDK, mais on peut vérifier que le createChannelServer
  // ne throw pas et retourne un Server MCP avec startPolling.
  const server = createChannelServer({
    apiUrl: 'http://byan-test',
    apiToken: 'byan_test_token',
    intervalMs: 999_999,
    fetchImpl: async () => okJson({ data: [] }),
  });

  assert.ok(server, 'createChannelServer retourne un objet');
  assert.equal(typeof server.startPolling, 'function', 'startPolling est exposé');
  assert.equal(typeof server.connect, 'function', 'connect est exposé (Server MCP)');
});

// ---------------------------------------------------------------------------
// Test 7 : startPolling émet mcp.notification() pour un message outbox
// Chemin complet : channel-server -> channel-poll -> mcp.notification
// ---------------------------------------------------------------------------

test('startPolling: émet mcp.notification pour chaque message outbox', async () => {
  const notifications = [];
  const ackUrls = [];

  const outboxMsg = {
    id: 'msg-notify-001',
    session_id: 'sess-notify',
    content: 'Message depuis byan_web',
    meta: { user: 'yan' },
  };

  let pollCount = 0;
  const fetchImpl = makeFetch({
    '/api/sessions/outbox': () => {
      pollCount++;
      return okJson({ data: pollCount === 1 ? [outboxMsg] : [] });
    },
    '/ack': (url) => {
      ackUrls.push(url);
      return okJson({ ok: true });
    },
  });

  const server = createChannelServer({
    apiUrl: 'http://byan-test',
    apiToken: 'byan_notify_token',
    intervalMs: 40,
    fetchImpl,
  });

  // Intercepter mcp.notification() pour capturer les appels sans transport réel.
  // mcp.notification est une méthode instance patchable avant connect().
  server.notification = async (n) => { notifications.push(n); };

  // startPolling démarre la boucle de poll.
  const loop = server.startPolling();

  await waitFor(() => notifications.length >= 1, { timeoutMs: 1000 });
  loop.stop();

  assert.equal(notifications.length, 1);
  const n = notifications[0];
  assert.equal(n.method, 'notifications/claude/channel');
  assert.equal(n.params.content, 'Message depuis byan_web');
  assert.equal(n.params.meta.session_id, 'sess-notify');
  assert.equal(n.params.meta.msg_id, 'msg-notify-001');

  // Ack appelé pour le message.
  assert.ok(ackUrls.some(u => u.includes('sess-notify') && u.includes('msg-notify-001')));
});
