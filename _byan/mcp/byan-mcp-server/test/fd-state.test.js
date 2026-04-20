import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { start, status, advance, update, abort, ALL_PHASES } from '../lib/fd-state.js';

function tmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-fd-'));
  return root;
}

test('status returns active:false when no state exists', () => {
  const root = tmpProject();
  const s = status({ projectRoot: root });
  assert.equal(s.active, false);
  assert.equal(s.phase, null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('start writes initial state with phase BRAINSTORM', () => {
  const root = tmpProject();
  const now = new Date('2026-04-19T12:34:56Z');
  const s = start({ featureName: 'token ledger', projectRoot: root, now });
  assert.equal(s.phase, 'BRAINSTORM');
  assert.equal(s.feature_name, 'token ledger');
  assert.match(s.fd_id, /^2026\d{4}-\d{6}-token-ledger$/);
  assert.equal(s.backlog.length, 0);
  assert.equal(s.phase_history[0].phase, 'BRAINSTORM');
  fs.rmSync(root, { recursive: true, force: true });
});

test('start refuses to clobber an in-progress session unless force=true', () => {
  const root = tmpProject();
  start({ featureName: 'a', projectRoot: root });
  assert.throws(() => start({ featureName: 'b', projectRoot: root }));
  const forced = start({ featureName: 'b', projectRoot: root, force: true });
  assert.equal(forced.feature_name, 'b');
  fs.rmSync(root, { recursive: true, force: true });
});

test('advance moves forward through phases', () => {
  const root = tmpProject();
  start({ featureName: 'f', projectRoot: root });
  const s = advance({ to: 'PRUNE', projectRoot: root });
  assert.equal(s.phase, 'PRUNE');
  assert.equal(s.phase_history.length, 2);
  fs.rmSync(root, { recursive: true, force: true });
});

test('advance rejects invalid target phase', () => {
  const root = tmpProject();
  start({ featureName: 'f', projectRoot: root });
  assert.throws(() => advance({ to: 'NOT_A_PHASE', projectRoot: root }));
  fs.rmSync(root, { recursive: true, force: true });
});

test('advance rejects backward moves (except ABORTED/COMPLETED)', () => {
  const root = tmpProject();
  start({ featureName: 'f', projectRoot: root });
  advance({ to: 'PRUNE', projectRoot: root });
  advance({ to: 'DISPATCH', projectRoot: root });
  assert.throws(() => advance({ to: 'BRAINSTORM', projectRoot: root }));
  fs.rmSync(root, { recursive: true, force: true });
});

test('abort sets phase to ABORTED and records reason', () => {
  const root = tmpProject();
  start({ featureName: 'f', projectRoot: root });
  advance({ to: 'PRUNE', projectRoot: root });
  const s = abort({ reason: 'scope creep', projectRoot: root });
  assert.equal(s.phase, 'ABORTED');
  const last = s.phase_history[s.phase_history.length - 1];
  assert.equal(last.note, 'scope creep');
  fs.rmSync(root, { recursive: true, force: true });
});

test('update patches allowed fields and rejects unknown keys', () => {
  const root = tmpProject();
  start({ featureName: 'f', projectRoot: root });
  const s = update({
    patch: { backlog: [{ id: 'F1', title: 't', priority: 'P1' }], notes: ['hello'] },
    projectRoot: root,
  });
  assert.equal(s.backlog.length, 1);
  assert.equal(s.notes[0], 'hello');
  assert.throws(() => update({ patch: { evil_field: 1 }, projectRoot: root }));
  fs.rmSync(root, { recursive: true, force: true });
});

test('status returns active:true when in BRAINSTORM, false after COMPLETED', () => {
  const root = tmpProject();
  start({ featureName: 'f', projectRoot: root });
  assert.equal(status({ projectRoot: root }).active, true);
  advance({ to: 'PRUNE', projectRoot: root });
  advance({ to: 'DISPATCH', projectRoot: root });
  advance({ to: 'BUILD', projectRoot: root });
  advance({ to: 'VALIDATE', projectRoot: root });
  advance({ to: 'COMPLETED', projectRoot: root });
  assert.equal(status({ projectRoot: root }).active, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('ALL_PHASES includes the 5 workflow phases + COMPLETED + ABORTED', () => {
  assert.ok(ALL_PHASES.includes('BRAINSTORM'));
  assert.ok(ALL_PHASES.includes('PRUNE'));
  assert.ok(ALL_PHASES.includes('DISPATCH'));
  assert.ok(ALL_PHASES.includes('BUILD'));
  assert.ok(ALL_PHASES.includes('VALIDATE'));
  assert.ok(ALL_PHASES.includes('COMPLETED'));
  assert.ok(ALL_PHASES.includes('ABORTED'));
});
