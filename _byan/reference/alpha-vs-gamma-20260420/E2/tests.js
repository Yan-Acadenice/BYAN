// tests.js — node --test suite for peer-review.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  requestReview,
  recordVerdict,
  getReview,
  listPending,
  pickReviewer,
  DEFAULT_AGENT_ROSTER,
} from './peer-review.js';

async function mktmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'byan-review-'));
}

test('requestReview happy path creates pending record', async () => {
  const root = await mktmp();
  const rec = await requestReview({
    task_id: 't1',
    author: 'bmad-bmm-dev',
    artifact_paths: ['src/foo.js'],
    description: 'adds foo',
    projectRoot: root,
  });
  assert.equal(rec.status, 'pending');
  assert.equal(rec.author, 'bmad-bmm-dev');
  assert.deepEqual(rec.artifact_paths, ['src/foo.js']);
  assert.equal(rec.verdicts.length, 0);
  const onDisk = await getReview({ task_id: 't1', projectRoot: root });
  assert.equal(onDisk.task_id, 't1');
});

test('requestReview rejects duplicate pending', async () => {
  const root = await mktmp();
  await requestReview({
    task_id: 't2',
    author: 'bmad-bmm-dev',
    artifact_paths: [],
    projectRoot: root,
  });
  await assert.rejects(
    () => requestReview({
      task_id: 't2',
      author: 'bmad-bmm-dev',
      artifact_paths: [],
      projectRoot: root,
    }),
    /duplicate pending/,
  );
});

test('recordVerdict approve transitions status to approved', async () => {
  const root = await mktmp();
  await requestReview({
    task_id: 't3',
    author: 'bmad-bmm-dev',
    artifact_paths: [],
    projectRoot: root,
  });
  const rec = await recordVerdict({
    task_id: 't3',
    reviewer: 'bmad-bmm-quinn',
    verdict: 'approve',
    comments: 'LGTM',
    projectRoot: root,
  });
  assert.equal(rec.status, 'approved');
  assert.equal(rec.verdicts.length, 1);
  assert.equal(rec.verdicts[0].reviewer, 'bmad-bmm-quinn');
});

test('recordVerdict changes transitions status to changes_requested', async () => {
  const root = await mktmp();
  await requestReview({
    task_id: 't4',
    author: 'bmad-bmm-dev',
    artifact_paths: [],
    projectRoot: root,
  });
  const rec = await recordVerdict({
    task_id: 't4',
    reviewer: 'bmad-compliance',
    verdict: 'changes',
    must_fix: ['add tests'],
    projectRoot: root,
  });
  assert.equal(rec.status, 'changes_requested');
  assert.deepEqual(rec.verdicts[0].must_fix, ['add tests']);
});

test('recordVerdict block transitions status to blocked', async () => {
  const root = await mktmp();
  await requestReview({
    task_id: 't5',
    author: 'bmad-bmm-dev',
    artifact_paths: [],
    projectRoot: root,
  });
  const rec = await recordVerdict({
    task_id: 't5',
    reviewer: 'bmad-compliance',
    verdict: 'block',
    must_fix: ['hardcoded secret in line 42'],
    projectRoot: root,
  });
  assert.equal(rec.status, 'blocked');
});

test('recordVerdict throws when reviewer === author', async () => {
  const root = await mktmp();
  await requestReview({
    task_id: 't6',
    author: 'bmad-bmm-dev',
    artifact_paths: [],
    projectRoot: root,
  });
  await assert.rejects(
    () => recordVerdict({
      task_id: 't6',
      reviewer: 'bmad-bmm-dev',
      verdict: 'approve',
      projectRoot: root,
    }),
    /cannot review own work/,
  );
});

test('recordVerdict rejects invalid verdict', async () => {
  const root = await mktmp();
  await requestReview({
    task_id: 't7',
    author: 'bmad-bmm-dev',
    artifact_paths: [],
    projectRoot: root,
  });
  await assert.rejects(
    () => recordVerdict({
      task_id: 't7',
      reviewer: 'bmad-bmm-quinn',
      verdict: 'lgtm',
      projectRoot: root,
    }),
    /invalid verdict/,
  );
});

test('listPending filters only pending records', async () => {
  const root = await mktmp();
  await requestReview({
    task_id: 'p1',
    author: 'bmad-bmm-dev',
    artifact_paths: [],
    projectRoot: root,
  });
  await requestReview({
    task_id: 'p2',
    author: 'bmad-bmm-architect',
    artifact_paths: [],
    projectRoot: root,
  });
  await requestReview({
    task_id: 'p3',
    author: 'bmad-bmm-pm',
    artifact_paths: [],
    projectRoot: root,
  });
  await recordVerdict({
    task_id: 'p2',
    reviewer: 'bmad-tea-tea',
    verdict: 'approve',
    projectRoot: root,
  });
  const pending = await listPending({ projectRoot: root });
  const ids = pending.map((r) => r.task_id).sort();
  assert.deepEqual(ids, ['p1', 'p3']);
});

test('pickReviewer uses domain pair (dev → quinn)', () => {
  const reviewer = pickReviewer({
    author: 'bmad-bmm-dev',
    preferredDomain: 'dev',
    roster: DEFAULT_AGENT_ROSTER,
  });
  assert.equal(reviewer, 'bmad-bmm-quinn');
});

test('pickReviewer uses domain pair (architect → tea)', () => {
  const reviewer = pickReviewer({
    author: 'bmad-bmm-architect',
    preferredDomain: 'architect',
    roster: DEFAULT_AGENT_ROSTER,
  });
  assert.equal(reviewer, 'bmad-tea-tea');
});

test('pickReviewer infers domain from author name when preferredDomain absent', () => {
  const reviewer = pickReviewer({
    author: 'bmad-bmm-pm',
    roster: DEFAULT_AGENT_ROSTER,
  });
  assert.equal(reviewer, 'bmad-bmm-sm');
});

test('pickReviewer falls back to roster when no domain pair matches', () => {
  const roster = ['alice', 'bob', 'carol'];
  const reviewer = pickReviewer({
    author: 'alice',
    roster,
  });
  assert.notEqual(reviewer, 'alice');
  assert.ok(roster.includes(reviewer));
});

test('pickReviewer never returns author even when paired would equal author', () => {
  // Edge case: if author is bmad-bmm-quinn and domain is quinn, paired is dev (not self)
  const reviewer = pickReviewer({
    author: 'bmad-bmm-quinn',
    preferredDomain: 'quinn',
    roster: DEFAULT_AGENT_ROSTER,
  });
  assert.notEqual(reviewer, 'bmad-bmm-quinn');
  assert.equal(reviewer, 'bmad-bmm-dev');
});

test('getReview returns null for unknown task_id', async () => {
  const root = await mktmp();
  const rec = await getReview({ task_id: 'nope', projectRoot: root });
  assert.equal(rec, null);
});

test('getReview returns full record with verdicts after recordVerdict', async () => {
  const root = await mktmp();
  await requestReview({
    task_id: 'g1',
    author: 'bmad-bmm-dev',
    artifact_paths: ['a.js', 'b.js'],
    description: 'desc',
    projectRoot: root,
  });
  await recordVerdict({
    task_id: 'g1',
    reviewer: 'bmad-bmm-quinn',
    verdict: 'changes',
    comments: 'needs tests',
    must_fix: ['add tests'],
    projectRoot: root,
  });
  const rec = await getReview({ task_id: 'g1', projectRoot: root });
  assert.equal(rec.status, 'changes_requested');
  assert.equal(rec.verdicts.length, 1);
  assert.equal(rec.verdicts[0].comments, 'needs tests');
  assert.deepEqual(rec.artifact_paths, ['a.js', 'b.js']);
});
