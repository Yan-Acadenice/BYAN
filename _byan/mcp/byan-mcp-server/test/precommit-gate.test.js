import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evaluateGate, decide } from '../lib/precommit-gate.js';
import { lockScope, selfVerify, complete, abort } from '../lib/strict-mode.js';

// These local-path tests must not consult a live API: ensure no token.
delete process.env.BYAN_API_TOKEN;

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'byan-gate-'));
}

function lockAndPass(root, n, lastVerdict = 'ok') {
  lockScope({
    scopeText: 'Build the complete feature exactly as asked.',
    acceptanceCriteria: ['criterion one', 'criterion two'],
    allowedPaths: ['src/feature/'],
    projectRoot: root,
  });
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const verdict = isLast ? lastVerdict : 'ok';
    selfVerify({
      verdict,
      findings: verdict === 'gap' ? ['still missing X'] : [],
      projectRoot: root,
    });
  }
}

test('gate passes when no strict session exists', async () => {
  const r = await evaluateGate({ projectRoot: tmpRoot() });
  assert.equal(r.pass, true);
});

test('gate blocks when session engaged but not completed', async () => {
  const root = tmpRoot();
  lockAndPass(root, 1);
  const r = await evaluateGate({ projectRoot: root });
  assert.equal(r.pass, false);
  assert.match(r.reason, /not completed/);
});

test('gate blocks engaged session with zero passes', async () => {
  const root = tmpRoot();
  lockScope({
    scopeText: 'Build the complete feature exactly as asked.',
    acceptanceCriteria: ['only criterion'],
    projectRoot: root,
  });
  const r = await evaluateGate({ projectRoot: root });
  assert.equal(r.pass, false);
});

test('gate passes when session completed correctly', async () => {
  const root = tmpRoot();
  lockAndPass(root, 3, 'ok');
  complete({ projectRoot: root });
  const r = await evaluateGate({ projectRoot: root });
  assert.equal(r.pass, true);
  assert.match(r.reason, /completed/);
});

test('gate passes when session was aborted', async () => {
  const root = tmpRoot();
  lockAndPass(root, 1);
  abort({ reason: 'changed approach', projectRoot: root });
  const r = await evaluateGate({ projectRoot: root });
  assert.equal(r.pass, true);
  assert.match(r.reason, /aborted/);
});

// ── decide() pure logic ──────────────────────────────────────────────────────

test('decide passes when no session', () => {
  assert.equal(decide({ hasSession: false }).pass, true);
});

test('decide blocks completed with insufficient passes', () => {
  const r = decide({
    hasSession: true, scopeLocked: true, completed: true,
    passCount: 2, minPasses: 3, passes: [{ verdict: 'ok' }, { verdict: 'ok' }],
  });
  assert.equal(r.pass, false);
});

test('decide blocks completed when last verdict is gap', () => {
  const r = decide({
    hasSession: true, scopeLocked: true, completed: true,
    passCount: 3, minPasses: 3,
    passes: [{ verdict: 'ok' }, { verdict: 'ok' }, { verdict: 'gap' }],
  });
  assert.equal(r.pass, false);
});

// ── API authority path ───────────────────────────────────────────────────────

function fakeFetch(record) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: record }),
  });
}

test('API authority overrides local: local incomplete but API completed -> PASS', async () => {
  const root = tmpRoot();
  lockAndPass(root, 1); // local: engaged, 1 pass, not completed -> would BLOCK locally
  process.env.BYAN_API_TOKEN = 'byan_' + '0'.repeat(64);
  try {
    const apiRecord = {
      id: 'x', completed: true, active: false, aborted: false,
      audit_token: 'tok', passes: [{ verdict: 'ok' }, { verdict: 'ok' }, { verdict: 'ok' }],
    };
    const r = await evaluateGate({ projectRoot: root, fetchImpl: fakeFetch(apiRecord) });
    assert.equal(r.pass, true);
    assert.match(r.reason, /api/);
  } finally {
    delete process.env.BYAN_API_TOKEN;
  }
});

test('API authority overrides local: local completed but API still engaged -> BLOCK', async () => {
  const root = tmpRoot();
  lockAndPass(root, 3, 'ok');
  complete({ projectRoot: root }); // local: completed -> would PASS locally
  process.env.BYAN_API_TOKEN = 'byan_' + '0'.repeat(64);
  try {
    const apiRecord = {
      id: 'x', completed: false, active: true, aborted: false,
      audit_token: null, passes: [{ verdict: 'ok' }],
    };
    const r = await evaluateGate({ projectRoot: root, fetchImpl: fakeFetch(apiRecord) });
    assert.equal(r.pass, false);
    assert.match(r.reason, /not completed/);
  } finally {
    delete process.env.BYAN_API_TOKEN;
  }
});

test('API unreachable falls back to local mirror', async () => {
  const root = tmpRoot();
  lockAndPass(root, 3, 'ok');
  complete({ projectRoot: root });
  process.env.BYAN_API_TOKEN = 'byan_' + '0'.repeat(64);
  try {
    const failingFetch = async () => { throw new Error('ECONNREFUSED'); };
    const r = await evaluateGate({ projectRoot: root, fetchImpl: failingFetch });
    assert.equal(r.pass, true);
    assert.match(r.reason, /local/);
  } finally {
    delete process.env.BYAN_API_TOKEN;
  }
});
