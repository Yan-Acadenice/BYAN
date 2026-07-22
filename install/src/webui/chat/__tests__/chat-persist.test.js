/**
 * F3 persistence wiring — the chat/start route must save the assistant's streamed
 * reply and the claude session id to the record on complete, so a later resume
 * shows a full transcript and can --resume the real claude session. Also checks
 * the resume path reuses the stored cwd + claude id and never deletes a resumed
 * record on failure.
 *
 * getSessionManager caches a module-level singleton, so each test resets modules
 * and re-mocks the bridge to get a fresh, root-isolated instance.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

function tmpRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-persist-'));
  fs.mkdirSync(path.join(dir, '_byan'), { recursive: true });
  return dir;
}

function fakeRes() {
  const out = { code: 0, body: null };
  return {
    out,
    writeHead: (c) => { out.code = c; },
    end: (b) => { out.body = b ? JSON.parse(b) : null; },
  };
}

// A server stub with the fields the chat routes touch.
function fakeServer(root) {
  return { projectRoot: root, clients: new Set() };
}

let createBridge;
let api;
let SessionManager;

beforeEach(() => {
  jest.resetModules();
  jest.doMock('../bridge', () => ({ createBridge: jest.fn() }));
  ({ createBridge } = require('../bridge'));
  api = require('../../api');
  SessionManager = require('../session-manager');
});

afterEach(() => jest.resetAllMocks());

test('POST chat/start persists the assistant reply + claude session id on complete', async () => {
  const root = tmpRoot();
  createBridge.mockImplementation((cli, opts) => ({
    start: async () => {
      opts.onChunk('Hel');
      opts.onChunk('lo');
      opts.onComplete({ sessionId: 'uuid-9', result: 'ok' });
    },
  }));

  const res = fakeRes();
  await api.routes['POST chat/start']({ body: { cli: 'claude', cwd: '/proj' } }, res, fakeServer(root));

  expect(res.out.code).toBe(200);
  const sessionId = res.out.body.sessionId;
  expect(sessionId).toBeTruthy();

  const sm = new SessionManager(root);
  const loaded = sm.load(sessionId);
  expect(loaded.claudeSessionId).toBe('uuid-9');
  expect(loaded.cwd).toBe('/proj');
  const assistant = loaded.messages.filter((m) => m.role === 'assistant');
  expect(assistant).toHaveLength(1);
  expect(assistant[0].content).toBe('Hello');
});

test('per-turn buffer resets — two turns store two distinct assistant replies', async () => {
  const root = tmpRoot();
  let capturedOpts = null;
  createBridge.mockImplementation((cli, opts) => {
    capturedOpts = opts;
    // Turn 1 on start.
    return { start: async () => { opts.onChunk('un'); opts.onComplete({ sessionId: 'uuid-1' }); } };
  });

  const res = fakeRes();
  await api.routes['POST chat/start']({ body: { cli: 'claude' } }, res, fakeServer(root));
  const sessionId = res.out.body.sessionId;

  // Turn 2 reuses the SAME bridge closure (as chat/send would) — the buffer must
  // have reset, so we get 'deux', not 'undeux'.
  capturedOpts.onChunk('deux');
  capturedOpts.onComplete({ sessionId: 'uuid-1' });

  const loaded = new SessionManager(root).load(sessionId);
  const assistant = loaded.messages.filter((m) => m.role === 'assistant').map((m) => m.content);
  expect(assistant).toEqual(['un', 'deux']);
});

test('POST chat/start resume reuses the record cwd + claude id, and keeps the record on failure', async () => {
  const root = tmpRoot();
  // Seed a resumable record on disk ; a fresh manager on the same root reads it.
  const seed = new SessionManager(root);
  const rec = seed.create('claude', null, { cwd: '/seeded' });
  seed.setClaudeSessionId(rec.id, 'uuid-seed');

  let seenOpts = null;
  createBridge.mockImplementation((cli, opts) => {
    seenOpts = opts;
    return { start: async () => { throw new Error('spawn failed'); } };
  });

  const res = fakeRes();
  await api.routes['POST chat/start']({ body: { resumeSessionId: rec.id } }, res, fakeServer(root));

  // Bridge was built to resume the stored claude id, in the stored cwd.
  expect(seenOpts.resumeSessionId).toBe('uuid-seed');
  expect(seenOpts.projectRoot).toBe('/seeded');
  // Start failed (500) but a resumed record must NOT be deleted.
  expect(res.out.code).toBe(500);
  expect(new SessionManager(root).load(rec.id)).not.toBeNull();
});
