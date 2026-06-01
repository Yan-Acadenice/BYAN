'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SessionManager = require('../../install/src/webui/chat/session-manager');

// ── fixtures ────────────────────────────────────────────────────────────────

let roots = [];
afterEach(() => {
  for (const r of roots) {
    try { fs.rmSync(r, { recursive: true, force: true }); } catch (_e) { /* noop */ }
  }
  roots = [];
});

function root(memoryDir) {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-sm-layout-'));
  roots.push(r);
  if (memoryDir) fs.mkdirSync(path.join(r, '_byan', memoryDir), { recursive: true });
  return r;
}

// ── sessionsDir resolution ────────────────────────────────────────────────────

describe('SessionManager layout resolution', () => {
  test('Gen2 (_byan/_memory/ present) -> stores under _byan/_memory/chat-sessions', () => {
    const r = root('_memory');
    const sm = new SessionManager(r);
    expect(sm.sessionsDir).toBe(path.join(r, '_byan', '_memory', 'chat-sessions'));
  });

  test('Gen3 (_byan/memoire/ present) -> stores under _byan/memoire/chat-sessions', () => {
    const r = root('memoire');
    const sm = new SessionManager(r);
    expect(sm.sessionsDir).toBe(path.join(r, '_byan', 'memoire', 'chat-sessions'));
  });

  test('fresh project (neither dir) -> defaults to Gen2 _byan/_memory/chat-sessions', () => {
    const r = root(null);
    const sm = new SessionManager(r);
    expect(sm.sessionsDir).toBe(path.join(r, '_byan', '_memory', 'chat-sessions'));
  });

  test('Gen3 wins when both memory dirs exist', () => {
    const r = root('_memory');
    fs.mkdirSync(path.join(r, '_byan', 'memoire'), { recursive: true });
    const sm = new SessionManager(r);
    expect(sm.sessionsDir).toBe(path.join(r, '_byan', 'memoire', 'chat-sessions'));
  });
});

// ── round-trip in the Gen3 layout (the post-migration world) ───────────────────

describe('SessionManager persists into the resolved Gen3 dir', () => {
  test('create + addMessage land in _byan/memoire/ and a fresh manager reads them back', () => {
    const r = root('memoire');
    const sm = new SessionManager(r);
    const session = sm.create('claude', 'byan');
    sm.addMessage(session.id, 'user', 'bonjour');

    // the file physically lands under the Gen3 memory dir
    const onDisk = path.join(r, '_byan', 'memoire', 'chat-sessions', `${session.id}.json`);
    expect(fs.existsSync(onDisk)).toBe(true);
    // and NOT under the dead Gen2 dir
    expect(fs.existsSync(path.join(r, '_byan', '_memory', 'chat-sessions'))).toBe(false);

    // a brand new manager (cold, empty in-memory map) lists it from disk
    const sm2 = new SessionManager(r);
    const listed = sm2.list();
    expect(listed.map((s) => s.id)).toContain(session.id);
    expect(sm2.load(session.id).messages[0].content).toBe('bonjour');
  });
});
