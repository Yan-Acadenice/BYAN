import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { migrate } from '../lib/migrate-fs.js';

function mk(root, rel, body = 'x') {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  return p;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-migfs-'));
  mk(root, '_byan/bmm/agents/analyst.md', 'AGENT analyst');
  mk(root, '_byan/agents/skeptic-soul.md', 'SOUL');
  mk(root, '_byan/knowledge/sources.md', 'SOURCES');
  mk(root, '_byan/workers-old-WRONG.md', 'JUNK');
  mk(root, '_byan/config.yaml', 'user_name: Yan');       // split
  mk(root, '_byan/bmm/config.yaml', 'module: bmm');       // review
  return root;
}

const exists = (root, rel) => fs.existsSync(path.join(root, rel));

// ── Dry-run ──────────────────────────────────────────────────────────────────

test('dry-run reports moves but changes nothing on disk', () => {
  const root = fixture();
  const report = migrate({ projectRoot: root }); // apply defaults to false
  assert.ok(report.moved.length >= 2, 'would move agent + knowledge + soul');
  // nothing actually moved
  assert.ok(exists(root, '_byan/bmm/agents/analyst.md'), 'source still present');
  assert.ok(!exists(root, '_byan/agent/analyst/analyst.md'), 'target not created in dry-run');
});

// ── Apply ────────────────────────────────────────────────────────────────────

test('apply moves the safe entries to their targets', () => {
  const root = fixture();
  const report = migrate({ projectRoot: root, apply: true });
  assert.ok(exists(root, '_byan/agent/analyst/analyst.md'), 'agent moved to target');
  assert.ok(!exists(root, '_byan/bmm/agents/analyst.md'), 'source removed');
  assert.ok(exists(root, '_byan/agent/skeptic/skeptic-soul.md'), 'soul moved alongside');
  assert.ok(exists(root, '_byan/connaissance/sources.md'), 'knowledge moved');
  assert.equal(
    fs.readFileSync(path.join(root, '_byan/agent/analyst/analyst.md'), 'utf8'),
    'AGENT analyst',
    'content preserved'
  );
  assert.ok(report.moved.length >= 3);
});

// ── Idempotence ──────────────────────────────────────────────────────────────

test('second apply is a no-op (idempotent)', () => {
  const root = fixture();
  migrate({ projectRoot: root, apply: true });
  const second = migrate({ projectRoot: root, apply: true });
  assert.equal(second.moved.length, 0, 'nothing left to move');
});

// ── Non-destructive ──────────────────────────────────────────────────────────

test('does not overwrite an existing target (conflict, source preserved)', () => {
  const root = fixture();
  // user already has a customized target
  mk(root, '_byan/agent/analyst/analyst.md', 'CUSTOM USER VERSION');
  const report = migrate({ projectRoot: root, apply: true });
  // target keeps the user content, source still there, conflict reported
  assert.equal(
    fs.readFileSync(path.join(root, '_byan/agent/analyst/analyst.md'), 'utf8'),
    'CUSTOM USER VERSION'
  );
  assert.ok(exists(root, '_byan/bmm/agents/analyst.md'), 'source preserved on conflict');
  assert.ok(report.conflicts.some((c) => c.to === '_byan/agent/analyst/analyst.md'));
});

// ── Junk / review / split ────────────────────────────────────────────────────

test('junk is skipped and left in place', () => {
  const root = fixture();
  const report = migrate({ projectRoot: root, apply: true });
  assert.ok(exists(root, '_byan/workers-old-WRONG.md'), 'junk untouched');
  assert.ok(report.skipped.some((s) => s.from === '_byan/workers-old-WRONG.md'));
});

test('split and review are reported as manual, not applied', () => {
  const root = fixture();
  const report = migrate({ projectRoot: root, apply: true });
  // config.yaml (split) untouched
  assert.ok(exists(root, '_byan/config.yaml'), 'config not auto-split');
  assert.ok(!exists(root, '_byan/context/config.yaml'), 'split not auto-applied');
  // bmm/config.yaml (review) untouched
  assert.ok(exists(root, '_byan/bmm/config.yaml'), 'review item untouched');
  const manualFroms = report.manual.map((m) => m.from);
  assert.ok(manualFroms.includes('_byan/config.yaml'));
  assert.ok(manualFroms.includes('_byan/bmm/config.yaml'));
});

// ── Report shape ─────────────────────────────────────────────────────────────

test('report has moved/kept/skipped/manual/conflicts arrays', () => {
  const root = fixture();
  const report = migrate({ projectRoot: root });
  for (const k of ['moved', 'kept', 'skipped', 'manual', 'conflicts']) {
    assert.ok(Array.isArray(report[k]), `${k} is an array`);
  }
  assert.equal(report.applied, false);
});
