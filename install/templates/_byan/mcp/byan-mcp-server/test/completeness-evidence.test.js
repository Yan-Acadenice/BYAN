import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  classifyCriterion,
  fileTokens,
  buildEvidence,
} from '../lib/completeness-evidence.js';
import { lockScope, selfVerify, complete } from '../lib/strict-mode.js';

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'byan-completeness-'));
}

// ── classification ────────────────────────────────────────────────────────

test('classifyCriterion: a filename criterion is code-shaped', () => {
  assert.equal(classifyCriterion('lib/foo.js exports decide()'), 'code');
});

test('classifyCriterion: a test-vocabulary criterion is code-shaped', () => {
  assert.equal(classifyCriterion('the jest suite passes green'), 'code');
});

test('classifyCriterion: a human-judged outcome is prose', () => {
  assert.equal(classifyCriterion('the user feels the flow is smooth'), 'prose');
});

test('fileTokens: extracts backticked paths and bare filenames', () => {
  const toks = fileTokens('`src/a.js` and config.yaml are present');
  assert.ok(toks.includes('src/a.js'));
  assert.ok(toks.includes('config.yaml'));
});

test('fileTokens: a backticked command is not a file token', () => {
  const toks = fileTokens('run `npm test` then check');
  assert.equal(toks.length, 0);
});

// ── evidence collection (injected io) ───────────────────────────────────────

const ioWithFile = (existing) => ({
  existsSync: (p) => existing.includes(p),
  gitDiffStat: () => '',
});

test('code criterion with an existing file -> hasEvidence true, not missing', () => {
  const r = buildEvidence({
    criteria: ['lib/widget.js implements render'],
    allowedPaths: [],
    io: ioWithFile(['lib/widget.js']),
  });
  assert.equal(r.perCriterion.length, 1);
  assert.equal(r.perCriterion[0].kind, 'code');
  assert.equal(r.perCriterion[0].hasEvidence, true);
  assert.equal(r.perCriterion[0].evidence.type, 'file');
  assert.equal(r.missing.length, 0);
});

test('code criterion with no file, no test, no diff -> missing', () => {
  const r = buildEvidence({
    criteria: ['lib/widget.js implements render'],
    allowedPaths: [],
    io: ioWithFile([]),
  });
  assert.equal(r.perCriterion[0].hasEvidence, false);
  assert.deepEqual(r.missing, ['lib/widget.js implements render']);
});

test('code criterion covered by a captured green test run -> hasEvidence true', () => {
  const r = buildEvidence({
    criteria: ['the suite passes'],
    allowedPaths: [],
    context: { testRun: { ran: true, exitCode: 0, summary: '696 passed' } },
    io: ioWithFile([]),
  });
  assert.equal(r.perCriterion[0].hasEvidence, true);
  assert.equal(r.perCriterion[0].evidence.type, 'test');
  assert.equal(r.missing.length, 0);
});

test('code criterion covered by a constrained git diff -> hasEvidence true', () => {
  const r = buildEvidence({
    criteria: ['src/api.js endpoint added'],
    allowedPaths: ['src/'],
    io: { existsSync: () => false, gitDiffStat: () => ' src/api.js | 12 +++++' },
  });
  assert.equal(r.perCriterion[0].hasEvidence, true);
  assert.equal(r.perCriterion[0].evidence.type, 'diff');
});

test('prose criterion is reported but never counted as missing', () => {
  const r = buildEvidence({
    criteria: ['the experience feels polished'],
    allowedPaths: [],
    io: ioWithFile([]),
  });
  assert.equal(r.perCriterion[0].kind, 'prose');
  assert.equal(r.perCriterion[0].hasEvidence, false);
  assert.equal(r.missing.length, 0);
});

// ── strict complete() integration: disarmed default is unchanged ────────────

function lockAndPass(root) {
  lockScope({
    scopeText: 'Build the complete feature exactly as asked.',
    acceptanceCriteria: ['lib/missing-thing.js exists', 'the user is happy'],
    allowedPaths: ['src/'],
    projectRoot: root,
  });
  for (let i = 0; i < 3; i++) {
    selfVerify({ verdict: 'ok', findings: [], projectRoot: root });
  }
}

test('complete() with the gate DISARMED does NOT reject even when code criteria lack evidence', () => {
  const root = makeRoot();
  // No delivery-default.json in this tmp root -> readDeliveryConfig returns {}
  // -> disarmed. The code criterion has no file/test/diff -> it WOULD be a miss
  // if armed; the gate must still pass and behave exactly as before.
  lockAndPass(root);
  // Force the diff to be empty so the only path to evidence is missing.
  const r = complete({
    projectRoot: root,
    evidenceIo: { existsSync: () => false, gitDiffStat: () => '' },
  });
  assert.equal(typeof r.audit_token, 'string');
  assert.equal(r.audit_token.length, 24);
  assert.equal(r.pass_count, 3);
  // The evidence report is ATTACHED (additive) even when disarmed.
  assert.ok(r.evidence);
  assert.ok(Array.isArray(r.evidence.missing));
  // The code criterion with no evidence is observed as missing in the report...
  assert.ok(r.evidence.missing.includes('lib/missing-thing.js exists'));
  // ...but completion was NOT rejected (disarmed = observe only).
});

test('complete() appends an observed-disarmed line to the completeness ledger', () => {
  const root = makeRoot();
  lockAndPass(root);
  complete({
    projectRoot: root,
    evidenceIo: { existsSync: () => false, gitDiffStat: () => '' },
  });
  const ledger = path.join(root, '_byan-output', 'completeness-ledger.jsonl');
  assert.ok(fs.existsSync(ledger));
  const lines = fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean);
  const last = JSON.parse(lines[lines.length - 1]);
  assert.equal(last.event, 'observed-disarmed');
  assert.equal(last.armed, false);
});

test('complete() with the gate ARMED rejects when code criteria lack evidence', () => {
  const root = makeRoot();
  // Write an armed delivery-default.json into this tmp root.
  fs.mkdirSync(path.join(root, '_byan', '_config'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '_byan', '_config', 'delivery-default.json'),
    JSON.stringify({ completenessGate: { armed: true } })
  );
  lockAndPass(root);
  assert.throws(
    () =>
      complete({
        projectRoot: root,
        evidenceIo: { existsSync: () => false, gitDiffStat: () => '' },
      }),
    /completeness gate is ARMED/
  );
});

test('complete() with the gate ARMED passes when evidence is present', () => {
  const root = makeRoot();
  fs.mkdirSync(path.join(root, '_byan', '_config'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '_byan', '_config', 'delivery-default.json'),
    JSON.stringify({ completenessGate: { armed: true } })
  );
  lockAndPass(root);
  // The code criterion now resolves to an existing file -> evidence present;
  // the prose criterion never blocks. Completion is earned.
  const r = complete({
    projectRoot: root,
    evidenceIo: {
      existsSync: (p) => p === 'lib/missing-thing.js',
      gitDiffStat: () => '',
    },
  });
  assert.equal(typeof r.audit_token, 'string');
  assert.equal(r.evidence.missing.length, 0);
});
