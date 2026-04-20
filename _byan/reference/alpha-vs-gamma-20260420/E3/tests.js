// E3 tests — node --test tests.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createBoard,
  addCard,
  moveCard,
  assignCard,
  getBoard,
  postStandup,
  readStandups,
  detectBlockedStreaks,
  KANBAN_COLUMNS,
} from './kanban.js';

async function tmpRoot(tag) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `e3-${tag}-`));
  return dir;
}

test('createBoard creates empty board with all columns', async () => {
  const root = await tmpRoot('create');
  const b = await createBoard({ sessionId: 's1', projectRoot: root, now: '2026-04-19T10:00:00Z' });
  assert.equal(b.sessionId, 's1');
  for (const c of KANBAN_COLUMNS) assert.deepEqual(b.columns[c], []);
  assert.equal(b.createdAt, '2026-04-19T10:00:00Z');
});

test('createBoard is idempotent', async () => {
  const root = await tmpRoot('idem');
  const b1 = await createBoard({ sessionId: 's1', projectRoot: root, now: '2026-04-19T10:00:00Z' });
  const b2 = await createBoard({ sessionId: 's1', projectRoot: root, now: '2026-04-19T11:00:00Z' });
  assert.equal(b1.createdAt, b2.createdAt);
});

test('addCard defaults column=todo and priority=P2', async () => {
  const root = await tmpRoot('add');
  await createBoard({ sessionId: 's1', projectRoot: root });
  const c = await addCard({ sessionId: 's1', card: { id: 'C1', title: 'First' }, projectRoot: root });
  assert.equal(c.column, 'todo');
  assert.equal(c.priority, 'P2');
  const b = await getBoard({ sessionId: 's1', projectRoot: root });
  assert.deepEqual(b.columns.todo, ['C1']);
});

test('addCard rejects duplicate id', async () => {
  const root = await tmpRoot('dup');
  await addCard({ sessionId: 's1', card: { id: 'C1', title: 'A' }, projectRoot: root });
  await assert.rejects(
    () => addCard({ sessionId: 's1', card: { id: 'C1', title: 'B' }, projectRoot: root }),
    /duplicate/,
  );
});

test('moveCard with blocker_reason sets it only on blocked', async () => {
  const root = await tmpRoot('move');
  await addCard({ sessionId: 's1', card: { id: 'C1', title: 'X' }, projectRoot: root });
  const m = await moveCard({ sessionId: 's1', cardId: 'C1', toColumn: 'blocked', blocker_reason: 'missing API key', projectRoot: root });
  assert.equal(m.column, 'blocked');
  assert.equal(m.blocker_reason, 'missing API key');

  const m2 = await moveCard({ sessionId: 's1', cardId: 'C1', toColumn: 'doing', blocker_reason: 'ignored', projectRoot: root });
  assert.equal(m2.column, 'doing');
  assert.equal(m2.blocker_reason, null);
});

test('moveCard rejects invalid column', async () => {
  const root = await tmpRoot('invcol');
  await addCard({ sessionId: 's1', card: { id: 'C1', title: 'X' }, projectRoot: root });
  await assert.rejects(
    () => moveCard({ sessionId: 's1', cardId: 'C1', toColumn: 'wip', projectRoot: root }),
    /invalid column/,
  );
});

test('moveCard rejects unknown card', async () => {
  const root = await tmpRoot('unk');
  await createBoard({ sessionId: 's1', projectRoot: root });
  await assert.rejects(
    () => moveCard({ sessionId: 's1', cardId: 'ghost', toColumn: 'done', projectRoot: root }),
    /unknown card/,
  );
});

test('assignCard sets assignee', async () => {
  const root = await tmpRoot('assign');
  await addCard({ sessionId: 's1', card: { id: 'C1', title: 'X' }, projectRoot: root });
  const a = await assignCard({ sessionId: 's1', cardId: 'C1', assignee: 'amelia', projectRoot: root });
  assert.equal(a.assignee, 'amelia');
});

test('postStandup + readStandups round-trip', async () => {
  const root = await tmpRoot('standup');
  await postStandup({ sessionId: 's1', agent: 'dev', did: ['wrote kanban'], blockers: [], next: ['tests'], projectRoot: root, now: '2026-04-19T10:00:00Z' });
  await postStandup({ sessionId: 's1', agent: 'qa', did: ['reviewed'], blockers: ['flaky ci'], next: ['retry'], projectRoot: root, now: '2026-04-19T11:00:00Z' });
  const list = await readStandups({ sessionId: 's1', projectRoot: root });
  assert.equal(list.length, 2);
  assert.equal(list[0].agent, 'dev');
  assert.deepEqual(list[1].blockers, ['flaky ci']);
});

test('readStandups limit returns last N', async () => {
  const root = await tmpRoot('limit');
  for (let i = 0; i < 5; i++) {
    await postStandup({ sessionId: 's1', agent: 'dev', did: [`d${i}`], blockers: [], next: [], projectRoot: root, now: `2026-04-19T10:0${i}:00Z` });
  }
  const list = await readStandups({ sessionId: 's1', projectRoot: root, limit: 2 });
  assert.equal(list.length, 2);
  assert.equal(list[0].did[0], 'd3');
  assert.equal(list[1].did[0], 'd4');
});

test('detectBlockedStreaks flags agent with >=2 consecutive blockers', async () => {
  const root = await tmpRoot('streak');
  await postStandup({ sessionId: 's1', agent: 'dev', blockers: ['A'], projectRoot: root, now: '2026-04-19T10:00:00Z' });
  await postStandup({ sessionId: 's1', agent: 'dev', blockers: ['B'], projectRoot: root, now: '2026-04-19T11:00:00Z' });
  const streaks = await detectBlockedStreaks({ sessionId: 's1', projectRoot: root });
  assert.equal(streaks.length, 1);
  assert.equal(streaks[0].agent, 'dev');
  assert.equal(streaks[0].streak, 2);
  assert.equal(streaks[0].lastAt, '2026-04-19T11:00:00Z');
});

test('detectBlockedStreaks resets on a clean stand-up', async () => {
  const root = await tmpRoot('reset');
  await postStandup({ sessionId: 's1', agent: 'dev', blockers: ['A'], projectRoot: root, now: '2026-04-19T10:00:00Z' });
  await postStandup({ sessionId: 's1', agent: 'dev', blockers: ['B'], projectRoot: root, now: '2026-04-19T11:00:00Z' });
  await postStandup({ sessionId: 's1', agent: 'dev', blockers: [], projectRoot: root, now: '2026-04-19T12:00:00Z' });
  const streaks = await detectBlockedStreaks({ sessionId: 's1', projectRoot: root });
  assert.equal(streaks.length, 0);
});

test('detectBlockedStreaks minStreak parameter respected', async () => {
  const root = await tmpRoot('min');
  await postStandup({ sessionId: 's1', agent: 'dev', blockers: ['A'], projectRoot: root, now: '2026-04-19T10:00:00Z' });
  const none = await detectBlockedStreaks({ sessionId: 's1', projectRoot: root, minStreak: 2 });
  assert.equal(none.length, 0);
  const one = await detectBlockedStreaks({ sessionId: 's1', projectRoot: root, minStreak: 1 });
  assert.equal(one.length, 1);
  assert.equal(one[0].streak, 1);
});
