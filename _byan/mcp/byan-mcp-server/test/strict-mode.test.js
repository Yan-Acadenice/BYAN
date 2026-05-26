import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  lockScope,
  selfVerify,
  complete,
  getStatus,
  abort,
  checkAuditTrail,
  MIN_PASSES,
} from '../lib/strict-mode.js';

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-strict-'));
  return root;
}

function readAudit(root) {
  const p = path.join(root, '.byan-strict', 'audit.log');
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

test('lockScope rejects short scope text', () => {
  const root = makeRoot();
  assert.throws(() => lockScope({ scopeText: 'short', projectRoot: root }), /at least 10 chars/);
});

test('lockScope rejects empty acceptance criteria', () => {
  const root = makeRoot();
  assert.throws(
    () =>
      lockScope({
        scopeText: 'Build a real production app',
        acceptanceCriteria: [],
        projectRoot: root,
      }),
    /non-empty array/
  );
});

test('lockScope creates state and audit entry', () => {
  const root = makeRoot();
  const result = lockScope({
    scopeText: 'Build a real production app with auth, payment, email',
    acceptanceCriteria: ['auth works', 'payment works', 'email works'],
    allowedPaths: ['src/**', 'tests/**'],
    projectRoot: root,
  });
  assert.equal(typeof result.scope_hash, 'string');
  assert.equal(result.scope_hash.length, 16);
  assert.equal(result.acceptance_criteria.length, 3);

  const status = getStatus({ projectRoot: root });
  assert.equal(status.scope_locked, true);
  assert.equal(status.pass_count, 0);
  assert.equal(status.min_passes, MIN_PASSES);

  const audit = readAudit(root);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].event, 'lock_scope');
});

test('lockScope idempotent on same scope hash', () => {
  const root = makeRoot();
  const args = {
    scopeText: 'Build a real production app with full feature set',
    acceptanceCriteria: ['a', 'b'],
    projectRoot: root,
  };
  const a = lockScope(args);
  const b = lockScope(args);
  assert.equal(a.scope_hash, b.scope_hash);
  assert.equal(readAudit(root).length, 1);
});

test('lockScope rejects different scope without force', () => {
  const root = makeRoot();
  lockScope({
    scopeText: 'first scope is the production app build',
    acceptanceCriteria: ['x'],
    projectRoot: root,
  });
  assert.throws(
    () =>
      lockScope({
        scopeText: 'second scope is completely different work',
        acceptanceCriteria: ['y'],
        projectRoot: root,
      }),
    /already locked/
  );
});

test('lockScope relocks with force=true and resets passes', () => {
  const root = makeRoot();
  lockScope({
    scopeText: 'first scope here is the initial build',
    acceptanceCriteria: ['x'],
    projectRoot: root,
  });
  selfVerify({ verdict: 'ok', findings: [], projectRoot: root });
  let status = getStatus({ projectRoot: root });
  assert.equal(status.pass_count, 1);

  lockScope({
    scopeText: 'second scope is a different complete rebuild',
    acceptanceCriteria: ['y'],
    projectRoot: root,
    force: true,
  });
  status = getStatus({ projectRoot: root });
  assert.equal(status.pass_count, 0);
});

test('selfVerify rejects without active session', () => {
  const root = makeRoot();
  assert.throws(
    () => selfVerify({ verdict: 'ok', findings: [], projectRoot: root }),
    /No active strict session/
  );
});

test('selfVerify validates verdict', () => {
  const root = makeRoot();
  lockScope({
    scopeText: 'valid scope text for verification',
    acceptanceCriteria: ['a'],
    projectRoot: root,
  });
  assert.throws(
    () => selfVerify({ verdict: 'maybe', findings: [], projectRoot: root }),
    /verdict must be/
  );
});

test('selfVerify requires findings when verdict=gap', () => {
  const root = makeRoot();
  lockScope({
    scopeText: 'valid scope text for verification',
    acceptanceCriteria: ['a'],
    projectRoot: root,
  });
  assert.throws(
    () => selfVerify({ verdict: 'gap', findings: [], projectRoot: root }),
    /findings must be a non-empty array/
  );
});

test('selfVerify increments pass count and writes audit', () => {
  const root = makeRoot();
  lockScope({
    scopeText: 'valid scope text for verification',
    acceptanceCriteria: ['a'],
    projectRoot: root,
  });
  const r1 = selfVerify({
    verdict: 'gap',
    findings: ['missing auth tests'],
    projectRoot: root,
  });
  assert.equal(r1.pass_count, 1);
  assert.equal(r1.remaining_passes, MIN_PASSES - 1);

  const r2 = selfVerify({ verdict: 'gap', findings: ['still gap'], projectRoot: root });
  assert.equal(r2.pass_count, 2);

  const r3 = selfVerify({ verdict: 'ok', findings: [], projectRoot: root });
  assert.equal(r3.pass_count, 3);
  assert.equal(r3.remaining_passes, 0);

  const audit = readAudit(root);
  assert.equal(audit.filter((e) => e.event === 'self_verify').length, 3);
});

test('complete rejects below MIN_PASSES', () => {
  const root = makeRoot();
  lockScope({
    scopeText: 'valid scope text for completion',
    acceptanceCriteria: ['a'],
    projectRoot: root,
  });
  selfVerify({ verdict: 'ok', findings: [], projectRoot: root });
  assert.throws(() => complete({ projectRoot: root }), /1\/3 self-verify passes/);
});

test('complete rejects when last pass is gap', () => {
  const root = makeRoot();
  lockScope({
    scopeText: 'valid scope text for completion',
    acceptanceCriteria: ['a'],
    projectRoot: root,
  });
  selfVerify({ verdict: 'ok', findings: [], projectRoot: root });
  selfVerify({ verdict: 'ok', findings: [], projectRoot: root });
  selfVerify({ verdict: 'gap', findings: ['still bad'], projectRoot: root });
  assert.throws(() => complete({ projectRoot: root }), /verdict="gap"/);
});

test('complete returns audit_token after 3 ok passes', () => {
  const root = makeRoot();
  lockScope({
    scopeText: 'valid scope text for completion',
    acceptanceCriteria: ['a'],
    projectRoot: root,
  });
  for (let i = 0; i < 3; i++) {
    selfVerify({ verdict: 'ok', findings: [], projectRoot: root });
  }
  const r = complete({ projectRoot: root });
  assert.equal(typeof r.audit_token, 'string');
  assert.equal(r.audit_token.length, 24);
  assert.equal(r.pass_count, 3);

  const audit = readAudit(root);
  assert.equal(audit[audit.length - 1].event, 'complete');
});

test('complete rejects double-call', () => {
  const root = makeRoot();
  lockScope({
    scopeText: 'valid scope text for completion',
    acceptanceCriteria: ['a'],
    projectRoot: root,
  });
  for (let i = 0; i < 3; i++) {
    selfVerify({ verdict: 'ok', findings: [], projectRoot: root });
  }
  complete({ projectRoot: root });
  assert.throws(() => complete({ projectRoot: root }), /already completed/);
});

test('abort marks session inactive and audits', () => {
  const root = makeRoot();
  lockScope({
    scopeText: 'valid scope text for abort',
    acceptanceCriteria: ['a'],
    projectRoot: root,
  });
  const r = abort({ reason: 'user_cancelled', projectRoot: root });
  assert.equal(r.aborted, true);

  const status = getStatus({ projectRoot: root });
  assert.equal(status.active, false);

  const audit = readAudit(root);
  assert.equal(audit[audit.length - 1].event, 'abort');
  assert.equal(audit[audit.length - 1].reason, 'user_cancelled');
});

test('getStatus on fresh root returns inactive', () => {
  const root = makeRoot();
  const s = getStatus({ projectRoot: root });
  assert.equal(s.active, false);
  assert.equal(s.scope_locked, false);
  assert.equal(s.pass_count, 0);
});

test('checkAuditTrail ok after complete', () => {
  const root = makeRoot();
  const lock = lockScope({
    scopeText: 'valid scope text for audit',
    acceptanceCriteria: ['a'],
    projectRoot: root,
  });
  for (let i = 0; i < 3; i++) {
    selfVerify({ verdict: 'ok', findings: [], projectRoot: root });
  }
  complete({ projectRoot: root });

  const r = checkAuditTrail({ scopeHash: lock.scope_hash, projectRoot: root });
  assert.equal(r.ok, true);
  assert.equal(r.pass_count, 3);
});

test('checkAuditTrail rejects when no complete', () => {
  const root = makeRoot();
  const r = checkAuditTrail({ projectRoot: root });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_completed_session');
});

test('checkAuditTrail rejects on scope mismatch', () => {
  const root = makeRoot();
  lockScope({
    scopeText: 'valid scope text for mismatch test',
    acceptanceCriteria: ['a'],
    projectRoot: root,
  });
  for (let i = 0; i < 3; i++) {
    selfVerify({ verdict: 'ok', findings: [], projectRoot: root });
  }
  complete({ projectRoot: root });

  const r = checkAuditTrail({ scopeHash: 'deadbeefdeadbeef', projectRoot: root });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'scope_mismatch');
});

test('checkAuditTrail rejects expired audit', () => {
  const root = makeRoot();
  const past = new Date(Date.now() - 10 * 60 * 1000 - 5000);
  lockScope({
    scopeText: 'valid scope text for expiry test',
    acceptanceCriteria: ['a'],
    projectRoot: root,
    now: past,
  });
  for (let i = 0; i < 3; i++) {
    selfVerify({ verdict: 'ok', findings: [], projectRoot: root, now: past });
  }
  complete({ projectRoot: root, now: past });

  const r = checkAuditTrail({ projectRoot: root, windowSeconds: 60 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'audit_expired');
});

test('audit log is append-only across sessions', () => {
  const root = makeRoot();
  lockScope({
    scopeText: 'first session full of work',
    acceptanceCriteria: ['a'],
    projectRoot: root,
  });
  abort({ reason: 'test1', projectRoot: root });

  lockScope({
    scopeText: 'second session also full of work',
    acceptanceCriteria: ['b'],
    projectRoot: root,
    force: true,
  });
  abort({ reason: 'test2', projectRoot: root });

  const audit = readAudit(root);
  assert.equal(audit.length, 4);
  assert.deepEqual(
    audit.map((e) => e.event),
    ['lock_scope', 'abort', 'lock_scope', 'abort']
  );
});
