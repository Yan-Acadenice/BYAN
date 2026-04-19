import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function tmpCopilotRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'byan-copilot-'));
}

function writeSession(root, sessionId, events) {
  const dir = path.join(root, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'events.jsonl'),
    events.map((e) => JSON.stringify(e)).join('\n') + '\n'
  );
}

async function reload(copilotRoot) {
  process.env.BYAN_COPILOT_ROOT = copilotRoot;
  const mod = await import(`../lib/copilot.js?cachebust=${Date.now()}`);
  return mod;
}

test('listSessions returns empty when root missing', async () => {
  const root = tmpCopilotRoot();
  fs.rmSync(root, { recursive: true, force: true });
  const { listSessions } = await reload(root);
  const r = listSessions();
  assert.equal(r.exists, false);
  assert.equal(r.sessions.length, 0);
});

test('listSessions summarises one session with start+shutdown+agent', async () => {
  const root = tmpCopilotRoot();
  writeSession(root, 's1', [
    {
      type: 'session.start',
      timestamp: '2026-04-01T10:00:00Z',
      data: { startTime: '2026-04-01T10:00:00Z', context: { cwd: '/home/yan/myproj', branch: 'main' } },
    },
    { type: 'subagent.selected', timestamp: '2026-04-01T10:00:05Z', data: { agentName: 'byan' } },
    { type: 'user.message', timestamp: '2026-04-01T10:00:10Z', data: { content: 'hi' } },
    { type: 'assistant.message', timestamp: '2026-04-01T10:00:11Z', data: { content: 'hello' } },
    { type: 'tool.execution_start', timestamp: '2026-04-01T10:00:12Z', data: {} },
    { type: 'session.shutdown', timestamp: '2026-04-01T10:00:15Z', data: {} },
  ]);

  const { listSessions } = await reload(root);
  const r = listSessions();
  assert.equal(r.exists, true);
  assert.equal(r.total, 1);
  const s = r.sessions[0];
  assert.equal(s.sessionId, 's1');
  assert.equal(s.agent, 'byan');
  assert.equal(s.cwd, '/home/yan/myproj');
  assert.equal(s.branch, 'main');
  assert.equal(s.user_messages, 1);
  assert.equal(s.assistant_messages, 1);
  assert.equal(s.tool_calls, 1);

  fs.rmSync(root, { recursive: true, force: true });
});

test('listSessions cwdFilter narrows to matching projects', async () => {
  const root = tmpCopilotRoot();
  writeSession(root, 's1', [
    { type: 'session.start', timestamp: '2026-04-01T10:00:00Z', data: { startTime: '2026-04-01T10:00:00Z', context: { cwd: '/home/yan/byan_web' } } },
  ]);
  writeSession(root, 's2', [
    { type: 'session.start', timestamp: '2026-04-02T10:00:00Z', data: { startTime: '2026-04-02T10:00:00Z', context: { cwd: '/home/yan/other' } } },
  ]);

  const { listSessions } = await reload(root);
  const r = listSessions({ cwdFilter: 'byan_web' });
  assert.equal(r.sessions.length, 1);
  assert.equal(r.sessions[0].sessionId, 's1');

  fs.rmSync(root, { recursive: true, force: true });
});

test('readSessionEvents returns all events when no type filter', async () => {
  const root = tmpCopilotRoot();
  writeSession(root, 's1', [
    { type: 'session.start', timestamp: '2026-04-01T10:00:00Z', data: {} },
    { type: 'user.message', timestamp: '2026-04-01T10:00:10Z', data: { content: 'one' } },
    { type: 'user.message', timestamp: '2026-04-01T10:00:20Z', data: { content: 'two' } },
  ]);

  const { readSessionEvents } = await reload(root);
  const r = readSessionEvents({ sessionId: 's1' });
  assert.equal(r.total, 3);
  assert.equal(r.events.length, 3);

  fs.rmSync(root, { recursive: true, force: true });
});

test('readSessionEvents filters by type', async () => {
  const root = tmpCopilotRoot();
  writeSession(root, 's1', [
    { type: 'session.start', timestamp: '2026-04-01T10:00:00Z', data: {} },
    { type: 'user.message', timestamp: '2026-04-01T10:00:10Z', data: { content: 'q' } },
    { type: 'assistant.message', timestamp: '2026-04-01T10:00:11Z', data: { content: 'a' } },
  ]);

  const { readSessionEvents } = await reload(root);
  const r = readSessionEvents({ sessionId: 's1', types: ['user.message'] });
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].type, 'user.message');

  fs.rmSync(root, { recursive: true, force: true });
});

test('readSessionEvents throws on missing sessionId', async () => {
  const root = tmpCopilotRoot();
  const { readSessionEvents } = await reload(root);
  assert.throws(() => readSessionEvents({}));
  assert.throws(() => readSessionEvents({ sessionId: 'nonexistent' }));
});

test('searchSessions finds query substring in messages (case-insensitive)', async () => {
  const root = tmpCopilotRoot();
  writeSession(root, 's1', [
    { type: 'user.message', timestamp: '2026-04-01T10:00:00Z', data: { content: 'How do I configure Hermes?' } },
    { type: 'assistant.message', timestamp: '2026-04-01T10:00:01Z', data: { content: 'Hermes uses routing_rules...' } },
  ]);
  writeSession(root, 's2', [
    { type: 'user.message', timestamp: '2026-04-02T10:00:00Z', data: { content: 'unrelated' } },
  ]);

  const { searchSessions } = await reload(root);
  const r = searchSessions({ query: 'hermes' });
  assert.equal(r.matches.length, 2);
  assert.ok(r.matches.every((m) => m.sessionId === 's1'));

  fs.rmSync(root, { recursive: true, force: true });
});

test('searchSessions throws on missing query', async () => {
  const root = tmpCopilotRoot();
  const { searchSessions } = await reload(root);
  assert.throws(() => searchSessions({}));
});
