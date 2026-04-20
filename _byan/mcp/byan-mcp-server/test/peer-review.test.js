import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  requestReview,
  recordVerdict,
  getReview,
  listPending,
  pickReviewer,
  DEFAULT_AGENT_ROSTER,
} from '../lib/peer-review.js';

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'byan-peer-'));
}

test('requestReview writes a pending file under _byan-output/reviews/', () => {
  const root = tmpProject();
  const r = requestReview({
    task_id: 'feat-auth-1',
    author: 'bmad-bmm-dev',
    artifact_paths: ['src/auth.js'],
    description: 'implement login',
    projectRoot: root,
  });
  assert.equal(r.status, 'pending');
  assert.equal(r.author, 'bmad-bmm-dev');
  assert.deepEqual(r.artifact_paths, ['src/auth.js']);
  const p = path.join(root, '_byan-output', 'reviews', 'feat-auth-1.json');
  assert.ok(fs.existsSync(p));
  fs.rmSync(root, { recursive: true, force: true });
});

test('requestReview rejects duplicate pending request', () => {
  const root = tmpProject();
  requestReview({ task_id: 't1', author: 'dev', projectRoot: root });
  assert.throws(() => requestReview({ task_id: 't1', author: 'dev', projectRoot: root }));
  fs.rmSync(root, { recursive: true, force: true });
});

test('recordVerdict approve sets status approved', () => {
  const root = tmpProject();
  requestReview({ task_id: 't1', author: 'bmad-bmm-dev', projectRoot: root });
  const r = recordVerdict({
    task_id: 't1',
    reviewer: 'bmad-bmm-quinn',
    verdict: 'approve',
    projectRoot: root,
  });
  assert.equal(r.status, 'approved');
  assert.equal(r.verdicts.length, 1);
  assert.equal(r.verdicts[0].reviewer, 'bmad-bmm-quinn');
  fs.rmSync(root, { recursive: true, force: true });
});

test('recordVerdict changes sets status changes_requested', () => {
  const root = tmpProject();
  requestReview({ task_id: 't1', author: 'dev', projectRoot: root });
  const r = recordVerdict({
    task_id: 't1',
    reviewer: 'quinn',
    verdict: 'changes',
    must_fix: ['add tests'],
    projectRoot: root,
  });
  assert.equal(r.status, 'changes_requested');
  assert.deepEqual(r.verdicts[0].must_fix, ['add tests']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('recordVerdict block sets status blocked', () => {
  const root = tmpProject();
  requestReview({ task_id: 't1', author: 'dev', projectRoot: root });
  const r = recordVerdict({
    task_id: 't1',
    reviewer: 'bmad-compliance',
    verdict: 'block',
    projectRoot: root,
  });
  assert.equal(r.status, 'blocked');
  fs.rmSync(root, { recursive: true, force: true });
});

test('recordVerdict rejects reviewer == author', () => {
  const root = tmpProject();
  requestReview({ task_id: 't1', author: 'bmad-bmm-dev', projectRoot: root });
  assert.throws(
    () =>
      recordVerdict({
        task_id: 't1',
        reviewer: 'bmad-bmm-dev',
        verdict: 'approve',
        projectRoot: root,
      }),
    /cannot be the same as author/
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('recordVerdict rejects invalid verdict value', () => {
  const root = tmpProject();
  requestReview({ task_id: 't1', author: 'dev', projectRoot: root });
  assert.throws(() =>
    recordVerdict({ task_id: 't1', reviewer: 'quinn', verdict: 'LGTM', projectRoot: root })
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('recordVerdict fails if no review exists', () => {
  const root = tmpProject();
  assert.throws(() =>
    recordVerdict({ task_id: 'never-existed', reviewer: 'quinn', verdict: 'approve', projectRoot: root })
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('listPending returns pending + changes_requested, excludes approved/blocked', () => {
  const root = tmpProject();
  requestReview({ task_id: 't1', author: 'dev', projectRoot: root });
  requestReview({ task_id: 't2', author: 'dev', projectRoot: root });
  requestReview({ task_id: 't3', author: 'dev', projectRoot: root });
  recordVerdict({ task_id: 't2', reviewer: 'quinn', verdict: 'approve', projectRoot: root });
  recordVerdict({ task_id: 't3', reviewer: 'quinn', verdict: 'changes', projectRoot: root });

  const pending = listPending({ projectRoot: root });
  const ids = pending.map((r) => r.task_id).sort();
  assert.deepEqual(ids, ['t1', 't3']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('pickReviewer returns a different agent from author using domain pair', () => {
  const r1 = pickReviewer({ author: 'bmad-bmm-dev' });
  assert.ok(r1);
  assert.notEqual(r1, 'bmad-bmm-dev');
  assert.ok(['bmad-bmm-quinn', 'bmad-tea-tea'].includes(r1));
});

test('pickReviewer falls back to roster if no domain match', () => {
  const r = pickReviewer({ author: 'bmad-unknown' });
  assert.ok(r);
  assert.notEqual(r, 'bmad-unknown');
  assert.ok(DEFAULT_AGENT_ROSTER.includes(r));
});

test('getReview reads persisted review', () => {
  const root = tmpProject();
  requestReview({ task_id: 't1', author: 'dev', projectRoot: root });
  const r = getReview({ task_id: 't1', projectRoot: root });
  assert.equal(r.task_id, 't1');
});
