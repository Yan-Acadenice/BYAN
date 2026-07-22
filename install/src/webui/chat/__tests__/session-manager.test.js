/**
 * SessionManager F3 additions — cwd + claudeSessionId persistence, setClaudeSessionId,
 * and the resumable flag in list().
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const SessionManager = require('../session-manager');

function tmpRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-sm-'));
  // A minimal _byan/ so layoutResolver resolves a memory path under it.
  fs.mkdirSync(path.join(dir, '_byan'), { recursive: true });
  return dir;
}

describe('SessionManager — F3 cwd + claudeSessionId', () => {
  let root;
  beforeEach(() => { root = tmpRoot(); });
  afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } });

  it('create persists cwd and a null claudeSessionId by default', () => {
    const sm = new SessionManager(root);
    const s = sm.create('claude', null, { cwd: '/home/yan/proj' });
    expect(s.cwd).toBe('/home/yan/proj');
    expect(s.claudeSessionId).toBeNull();

    // Reloaded from disk keeps the fields.
    const sm2 = new SessionManager(root);
    const loaded = sm2.load(s.id);
    expect(loaded.cwd).toBe('/home/yan/proj');
  });

  it('setClaudeSessionId stores the CLI session id and survives reload', () => {
    const sm = new SessionManager(root);
    const s = sm.create('claude', null, { cwd: '/tmp/x' });
    sm.setClaudeSessionId(s.id, 'uuid-1234');

    const sm2 = new SessionManager(root);
    const loaded = sm2.load(s.id);
    expect(loaded.claudeSessionId).toBe('uuid-1234');
  });

  it('setClaudeSessionId is a no-op for a missing record or empty id', () => {
    const sm = new SessionManager(root);
    const s = sm.create('claude', null);
    expect(() => sm.setClaudeSessionId('nope', 'x')).not.toThrow();
    expect(() => sm.setClaudeSessionId(s.id, '')).not.toThrow();
    expect(sm.load(s.id).claudeSessionId).toBeNull();
  });

  it('list marks a session resumable only once it has a claudeSessionId', () => {
    const sm = new SessionManager(root);
    const a = sm.create('claude', null, { cwd: '/a' });
    const b = sm.create('claude', null, { cwd: '/b' });
    sm.setClaudeSessionId(b.id, 'uuid-b');

    const summaries = sm.list();
    const sa = summaries.find((x) => x.id === a.id);
    const sb = summaries.find((x) => x.id === b.id);
    expect(sa.resumable).toBe(false);
    expect(sa.cwd).toBe('/a');
    expect(sb.resumable).toBe(true);
  });

  it('create stays backward compatible with no opts', () => {
    const sm = new SessionManager(root);
    const s = sm.create('claude', null);
    expect(s.cwd).toBeNull();
    expect(s.claudeSessionId).toBeNull();
  });

  it('rejects a path-traversal session id on load and delete (no escape)', () => {
    const sm = new SessionManager(root);
    // A crafted id must not resolve outside sessionsDir.
    expect(sm.load('../../../../etc/passwd')).toBeNull();
    expect(sm.load('..%2f..%2fsecret')).toBeNull();
    expect(() => sm.delete('../../evil')).not.toThrow();
    // A well-formed but absent id is simply null.
    expect(sm.load('chat-zzz-deadbeef')).toBeNull();
  });

  it('round-trips a full turn (user + assistant) into history', () => {
    const sm = new SessionManager(root);
    const s = sm.create('claude', null, { cwd: '/p' });
    sm.addMessage(s.id, 'user', 'question ?');
    sm.addMessage(s.id, 'assistant', 'réponse.');

    const sm2 = new SessionManager(root);
    const loaded = sm2.load(s.id);
    expect(loaded.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'question ?'],
      ['assistant', 'réponse.'],
    ]);
  });
});
