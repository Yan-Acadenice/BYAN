import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evaluateGate } from '../lib/precommit-gate.js';
import { lockScope, selfVerify, complete, abort } from '../lib/strict-mode.js';

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

test('gate passes when no strict session exists', () => {
  const r = evaluateGate({ projectRoot: tmpRoot() });
  assert.equal(r.pass, true);
});

test('gate blocks when session engaged but not completed', () => {
  const root = tmpRoot();
  lockAndPass(root, 1);
  const r = evaluateGate({ projectRoot: root });
  assert.equal(r.pass, false);
  assert.match(r.reason, /not completed/);
});

test('gate blocks engaged session with zero passes', () => {
  const root = tmpRoot();
  lockScope({
    scopeText: 'Build the complete feature exactly as asked.',
    acceptanceCriteria: ['only criterion'],
    projectRoot: root,
  });
  const r = evaluateGate({ projectRoot: root });
  assert.equal(r.pass, false);
});

test('gate passes when session completed correctly', () => {
  const root = tmpRoot();
  lockAndPass(root, 3, 'ok');
  complete({ projectRoot: root });
  const r = evaluateGate({ projectRoot: root });
  assert.equal(r.pass, true);
  assert.match(r.reason, /completed/);
});

test('gate passes when session was aborted', () => {
  const root = tmpRoot();
  lockAndPass(root, 1);
  abort({ reason: 'changed approach', projectRoot: root });
  const r = evaluateGate({ projectRoot: root });
  assert.equal(r.pass, true);
  assert.match(r.reason, /aborted/);
});
