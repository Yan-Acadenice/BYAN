import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
} from '../lib/kanban.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'byan-kanban-'));
}

test('KANBAN_COLUMNS exposes the 5 canonical columns', () => {
  assert.deepEqual(KANBAN_COLUMNS, ['todo', 'doing', 'blocked', 'review', 'done']);
});

test('createBoard produces a board with empty cards', () => {
  const root = tmp();
  const b = createBoard({ sessionId: 's1', projectRoot: root });
  assert.equal(b.session_id, 's1');
  assert.deepEqual(b.columns, KANBAN_COLUMNS);
  assert.deepEqual(b.cards, {});
  fs.rmSync(root, { recursive: true, force: true });
});

test('addCard writes a card in todo by default', () => {
  const root = tmp();
  createBoard({ sessionId: 's1', projectRoot: root });
  const c = addCard({
    sessionId: 's1',
    card: { id: 'F1', title: 'foo', assignee: 'dev', priority: 'P1' },
    projectRoot: root,
  });
  assert.equal(c.column, 'todo');
  assert.equal(c.assignee, 'dev');
  const b = getBoard({ sessionId: 's1', projectRoot: root });
  assert.equal(Object.keys(b.cards).length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('addCard refuses duplicate id', () => {
  const root = tmp();
  createBoard({ sessionId: 's1', projectRoot: root });
  addCard({ sessionId: 's1', card: { id: 'F1', title: 'foo' }, projectRoot: root });
  assert.throws(() =>
    addCard({ sessionId: 's1', card: { id: 'F1', title: 'bar' }, projectRoot: root })
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('moveCard transitions column, records blocker_reason when blocked', () => {
  const root = tmp();
  createBoard({ sessionId: 's1', projectRoot: root });
  addCard({ sessionId: 's1', card: { id: 'F1', title: 'foo' }, projectRoot: root });
  const c = moveCard({
    sessionId: 's1',
    cardId: 'F1',
    toColumn: 'blocked',
    blocker_reason: 'missing api spec',
    projectRoot: root,
  });
  assert.equal(c.column, 'blocked');
  assert.equal(c.blocker_reason, 'missing api spec');

  const c2 = moveCard({ sessionId: 's1', cardId: 'F1', toColumn: 'doing', projectRoot: root });
  assert.equal(c2.column, 'doing');
  assert.equal(c2.blocker_reason, null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('moveCard rejects invalid column', () => {
  const root = tmp();
  createBoard({ sessionId: 's1', projectRoot: root });
  addCard({ sessionId: 's1', card: { id: 'F1', title: 'foo' }, projectRoot: root });
  assert.throws(() =>
    moveCard({ sessionId: 's1', cardId: 'F1', toColumn: 'archive', projectRoot: root })
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('moveCard rejects unknown card', () => {
  const root = tmp();
  createBoard({ sessionId: 's1', projectRoot: root });
  assert.throws(() =>
    moveCard({ sessionId: 's1', cardId: 'ghost', toColumn: 'done', projectRoot: root })
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('assignCard updates assignee', () => {
  const root = tmp();
  createBoard({ sessionId: 's1', projectRoot: root });
  addCard({ sessionId: 's1', card: { id: 'F1', title: 'foo' }, projectRoot: root });
  const c = assignCard({
    sessionId: 's1',
    cardId: 'F1',
    assignee: 'bmad-bmm-quinn',
    projectRoot: root,
  });
  assert.equal(c.assignee, 'bmad-bmm-quinn');
  fs.rmSync(root, { recursive: true, force: true });
});

test('postStandup appends jsonl entry', () => {
  const root = tmp();
  postStandup({
    sessionId: 's1',
    agent: 'bmad-bmm-dev',
    did: 'implemented auth',
    next: 'add tests',
    projectRoot: root,
  });
  const entries = readStandups({ sessionId: 's1', projectRoot: root });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].agent, 'bmad-bmm-dev');
  assert.equal(entries[0].did, 'implemented auth');
  fs.rmSync(root, { recursive: true, force: true });
});

test('detectBlockedStreaks flags agent with 2+ consecutive blocked stand-ups', () => {
  const root = tmp();
  const post = (agent, blockers) =>
    postStandup({ sessionId: 's1', agent, blockers, projectRoot: root });

  post('dev', ['missing api spec']);
  post('dev', ['still missing']);
  post('quinn', []);
  post('quinn', ['waiting for dev']);

  const flagged = detectBlockedStreaks({ sessionId: 's1', minStreak: 2, projectRoot: root });
  const agents = flagged.map((f) => f.agent).sort();
  assert.deepEqual(agents, ['dev']);
  assert.equal(flagged[0].streak, 2);
  fs.rmSync(root, { recursive: true, force: true });
});

test('detectBlockedStreaks resets streak on a clean day', () => {
  const root = tmp();
  postStandup({ sessionId: 's1', agent: 'dev', blockers: ['b'], projectRoot: root });
  postStandup({ sessionId: 's1', agent: 'dev', blockers: [], projectRoot: root });
  postStandup({ sessionId: 's1', agent: 'dev', blockers: ['b'], projectRoot: root });

  const flagged = detectBlockedStreaks({ sessionId: 's1', minStreak: 2, projectRoot: root });
  assert.equal(flagged.length, 0);
  fs.rmSync(root, { recursive: true, force: true });
});
