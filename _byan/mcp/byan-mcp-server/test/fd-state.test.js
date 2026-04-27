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

function setProjectContext(root) {
  update({
    patch: { project_context: { name: 'BYAN', summary: 'Test project', source: 'local' } },
    projectRoot: root,
  });
}

function setMinIdeas(root, n = 10) {
  update({
    patch: { raw_ideas: Array.from({ length: n }, (_, i) => `idea ${i}`) },
    projectRoot: root,
  });
}

test('status returns active:false when no state exists', () => {
  const root = tmpProject();
  const s = status({ projectRoot: root });
  assert.equal(s.active, false);
  assert.equal(s.phase, null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('start writes initial state with phase DISCOVERY', () => {
  const root = tmpProject();
  const now = new Date('2026-04-19T12:34:56Z');
  const s = start({ featureName: 'token ledger', projectRoot: root, now });
  assert.equal(s.phase, 'DISCOVERY');
  assert.equal(s.feature_name, 'token ledger');
  assert.match(s.fd_id, /^2026\d{4}-\d{6}-token-ledger$/);
  assert.equal(s.backlog.length, 0);
  assert.equal(s.project_context, null);
  assert.equal(s.phase_history[0].phase, 'DISCOVERY');
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

test('advance from DISCOVERY rejects when project_context is missing', () => {
  const root = tmpProject();
  start({ featureName: 'f', projectRoot: root });
  assert.throws(() => advance({ to: 'BRAINSTORM', projectRoot: root }), /project_context/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('advance from DISCOVERY allows force=true bypass', () => {
  const root = tmpProject();
  start({ featureName: 'f', projectRoot: root });
  const s = advance({ to: 'BRAINSTORM', projectRoot: root, force: true });
  assert.equal(s.phase, 'BRAINSTORM');
  fs.rmSync(root, { recursive: true, force: true });
});

test('advance moves forward through phases (with sufficient raw_ideas + project_context)', () => {
  const root = tmpProject();
  start({ featureName: 'f', projectRoot: root });
  setProjectContext(root);
  advance({ to: 'BRAINSTORM', projectRoot: root });
  setMinIdeas(root, 10);
  const s = advance({ to: 'PRUNE', projectRoot: root });
  assert.equal(s.phase, 'PRUNE');
  assert.equal(s.phase_history.length, 3);
  fs.rmSync(root, { recursive: true, force: true });
});

test('advance from BRAINSTORM rejects when raw_ideas < 10', () => {
  const root = tmpProject();
  start({ featureName: 'f', projectRoot: root });
  setProjectContext(root);
  advance({ to: 'BRAINSTORM', projectRoot: root });
  update({ patch: { raw_ideas: ['only three', 'too few', 'oops'] }, projectRoot: root });
  assert.throws(() => advance({ to: 'PRUNE', projectRoot: root }), /at least 10/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('advance from BRAINSTORM allows force=true bypass', () => {
  const root = tmpProject();
  start({ featureName: 'f', projectRoot: root });
  advance({ to: 'BRAINSTORM', projectRoot: root, force: true });
  const s = advance({ to: 'PRUNE', projectRoot: root, force: true });
  assert.equal(s.phase, 'PRUNE');
  fs.rmSync(root, { recursive: true, force: true });
});

test('advance rejects invalid target phase', () => {
  const root = tmpProject();
  start({ featureName: 'f', projectRoot: root });
  assert.throws(() => advance({ to: 'NOT_A_PHASE', projectRoot: root }));
  fs.rmSync(root, { recursive: true, force: true });
});

test('advance rejects backward moves except REFACTOR->BUILD and ABORTED/COMPLETED', () => {
  const root = tmpProject();
  start({ featureName: 'f', projectRoot: root });
  advance({ to: 'BRAINSTORM', projectRoot: root, force: true });
  advance({ to: 'PRUNE', projectRoot: root, force: true });
  advance({ to: 'DISPATCH', projectRoot: root });
  assert.throws(() => advance({ to: 'BRAINSTORM', projectRoot: root }));
  assert.throws(() => advance({ to: 'DISCOVERY', projectRoot: root }));
  fs.rmSync(root, { recursive: true, force: true });
});

test('REFACTOR -> BUILD backward transition is allowed (the rework loop)', () => {
  const root = tmpProject();
  start({ featureName: 'f', projectRoot: root });
  advance({ to: 'BRAINSTORM', projectRoot: root, force: true });
  advance({ to: 'PRUNE', projectRoot: root, force: true });
  advance({ to: 'DISPATCH', projectRoot: root });
  advance({ to: 'BUILD', projectRoot: root });
  advance({ to: 'REVIEW', projectRoot: root });
  advance({ to: 'VALIDATE', projectRoot: root });
  advance({ to: 'REFACTOR', projectRoot: root });
  const s = advance({ to: 'BUILD', projectRoot: root });
  assert.equal(s.phase, 'BUILD');
  fs.rmSync(root, { recursive: true, force: true });
});

test('abort sets phase to ABORTED and records reason', () => {
  const root = tmpProject();
  start({ featureName: 'f', projectRoot: root });
  advance({ to: 'BRAINSTORM', projectRoot: root, force: true });
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
    patch: {
      backlog: [{ id: 'F1', title: 't', priority: 'P1' }],
      notes: ['hello'],
      project_context: { name: 'BYAN', summary: 's', source: 'local' },
      review_findings: [{ status: 'ready-for-validate' }],
      validate_verdict: { status: 'OK' },
      refactor_log: [],
      doc_log: ['CHANGELOG updated'],
    },
    projectRoot: root,
  });
  assert.equal(s.backlog.length, 1);
  assert.equal(s.notes[0], 'hello');
  assert.equal(s.project_context.name, 'BYAN');
  assert.equal(s.validate_verdict.status, 'OK');
  assert.throws(() => update({ patch: { evil_field: 1 }, projectRoot: root }));
  fs.rmSync(root, { recursive: true, force: true });
});

test('status returns active:true when in DISCOVERY, false after COMPLETED', () => {
  const root = tmpProject();
  start({ featureName: 'f', projectRoot: root });
  assert.equal(status({ projectRoot: root }).active, true);
  advance({ to: 'BRAINSTORM', projectRoot: root, force: true });
  advance({ to: 'PRUNE', projectRoot: root, force: true });
  advance({ to: 'DISPATCH', projectRoot: root });
  advance({ to: 'BUILD', projectRoot: root });
  advance({ to: 'REVIEW', projectRoot: root });
  advance({ to: 'VALIDATE', projectRoot: root });
  advance({ to: 'DOC', projectRoot: root });
  advance({ to: 'COMPLETED', projectRoot: root });
  assert.equal(status({ projectRoot: root }).active, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('ALL_PHASES includes the 9 workflow phases + COMPLETED + ABORTED', () => {
  assert.ok(ALL_PHASES.includes('DISCOVERY'));
  assert.ok(ALL_PHASES.includes('BRAINSTORM'));
  assert.ok(ALL_PHASES.includes('PRUNE'));
  assert.ok(ALL_PHASES.includes('DISPATCH'));
  assert.ok(ALL_PHASES.includes('BUILD'));
  assert.ok(ALL_PHASES.includes('REVIEW'));
  assert.ok(ALL_PHASES.includes('VALIDATE'));
  assert.ok(ALL_PHASES.includes('REFACTOR'));
  assert.ok(ALL_PHASES.includes('DOC'));
  assert.ok(ALL_PHASES.includes('COMPLETED'));
  assert.ok(ALL_PHASES.includes('ABORTED'));
});
