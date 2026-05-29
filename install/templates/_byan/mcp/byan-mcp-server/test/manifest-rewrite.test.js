import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rewritePathColumn, rewritePaths } from '../lib/manifest-reconcile.js';

// ── rewritePathColumn: last column, verbatim preservation ────────────────────

test('rewrites the path column and preserves every other field verbatim', () => {
  // principles field carries HTML entities AND a comma inside quotes.
  const csv =
    'name,principles,module,path\n' +
    '"analyst","- Channel frameworks: SWOT, Porter&apos;s Five Forces.","bmm","_byan/bmm/agents/analyst.md"\n';
  const resolve = (p) => (p === '_byan/bmm/agents/analyst.md' ? '_byan/agent/analyst/analyst.md' : null);
  const { text, changes, column } = rewritePathColumn(csv, resolve, ['path']);
  assert.equal(column, 3);
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0], { from: '_byan/bmm/agents/analyst.md', to: '_byan/agent/analyst/analyst.md' });
  // the principles field (with its comma + &apos;) is byte-identical
  assert.ok(text.includes('"- Channel frameworks: SWOT, Porter&apos;s Five Forces."'));
  assert.ok(text.includes('"_byan/agent/analyst/analyst.md"'));
  assert.ok(!text.includes('_byan/bmm/agents/analyst.md'));
});

// ── path column NOT last (task-manifest has `standalone` after) ──────────────

test('rewrites a middle path column, leaving trailing columns intact', () => {
  const csv =
    'name,description,module,path,standalone\n' +
    '"editorial","Clinical, careful copy-editor","core","_byan/core/tasks/editorial.xml","true"\n';
  const resolve = (p) => (p === '_byan/core/tasks/editorial.xml' ? '_byan/command/editorial.xml' : null);
  const { text, changes, column } = rewritePathColumn(csv, resolve, ['path']);
  assert.equal(column, 3);
  assert.equal(changes.length, 1);
  assert.ok(text.includes('"_byan/command/editorial.xml","true"'));
  assert.ok(text.includes('"Clinical, careful copy-editor"')); // comma-in-quotes preserved
});

// ── column not present / resolveFn returns null ──────────────────────────────

test('no path-like column -> text unchanged, column -1', () => {
  const csv = 'a,b\n"1","2"\n';
  const r = rewritePathColumn(csv, () => '_byan/x', ['path']);
  assert.equal(r.column, -1);
  assert.equal(r.text, csv);
  assert.equal(r.changes.length, 0);
});

test('resolveFn returning null leaves cells unchanged', () => {
  const csv = 'name,path\n"x","_byan/_config/keep.yaml"\n';
  const r = rewritePathColumn(csv, () => null, ['path']);
  assert.equal(r.changes.length, 0);
  assert.equal(r.text.replace(/\n$/, ''), csv.replace(/\n$/, ''));
});

// ── alternate column name (bmad-help uses workflow-file) ─────────────────────

test('detects an alternate column name (workflow-file)', () => {
  const csv = 'module,workflow-file,command\n"bmb","_byan/bmb/workflows/agent/workflow.md","run"\n';
  const resolve = (p) => (p.startsWith('_byan/bmb/workflows/') ? '_byan/workflow/simple/agent/workflow.md' : null);
  const r = rewritePathColumn(csv, resolve, ['workflow-file']);
  assert.equal(r.column, 1);
  assert.equal(r.changes.length, 1);
  assert.ok(r.text.includes('"_byan/workflow/simple/agent/workflow.md","run"'));
});

// ── rewritePaths end-to-end on a fixture _byan tree (dry-run) ────────────────

function mkRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'byan-rewrite-'));
}
function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

test('rewritePaths maps Gen2 -> Gen3 across manifests, dry-run does not write', () => {
  const root = mkRoot();
  try {
    // real files so buildMigrationPlan maps them
    write(root, '_byan/bmm/agents/analyst.md', 'x');
    write(root, '_byan/bmb/workflows/agent/workflow.md', 'x');
    write(root, '_byan/core/tasks/editorial.xml', 'x');

    write(root, '_byan/_config/agent-manifest.csv',
      'name,module,path\n"analyst","bmm","_byan/bmm/agents/analyst.md"\n');
    write(root, '_byan/_config/workflow-manifest.csv',
      'name,module,path\n"agent","bmb","_byan/bmb/workflows/agent/workflow.md"\n');
    write(root, '_byan/_config/task-manifest.csv',
      'name,module,path,standalone\n"editorial","core","_byan/core/tasks/editorial.xml","true"\n');
    write(root, '_byan/_config/files-manifest.csv',
      'type,name,module,path,hash\n"md","analyst","bmm","bmm/agents/analyst.md","abc"\n"csv","agent-manifest","_config","_config/agent-manifest.csv","def"\n');

    const before = fs.readFileSync(path.join(root, '_byan/_config/agent-manifest.csv'), 'utf8');
    const report = rewritePaths({ projectRoot: root, apply: false });

    assert.equal(report.applied, false);
    assert.equal(report.manifests['agent-manifest.csv'].changed, 1);
    assert.equal(report.manifests['workflow-manifest.csv'].changed, 1);
    assert.equal(report.manifests['task-manifest.csv'].changed, 1);
    assert.equal(report.manifests['agent-manifest.csv'].sample[0].to, '_byan/agent/analyst/analyst.md');
    assert.equal(report.manifests['workflow-manifest.csv'].sample[0].to, '_byan/workflow/simple/agent/workflow.md');
    assert.equal(report.manifests['task-manifest.csv'].sample[0].to, '_byan/command/editorial.xml');

    // files-manifest: _byan-relative path mapped (prefix), config row kept
    const fm = report.manifests['files-manifest.csv'];
    assert.equal(fm.changed, 1, 'only the agent row changes; _config row is kept');
    assert.equal(fm.sample[0].to, 'agent/analyst/analyst.md');

    // dry-run wrote nothing
    assert.equal(fs.readFileSync(path.join(root, '_byan/_config/agent-manifest.csv'), 'utf8'), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rewritePaths apply:true writes the rewritten manifests', () => {
  const root = mkRoot();
  try {
    write(root, '_byan/bmm/agents/analyst.md', 'x');
    write(root, '_byan/_config/agent-manifest.csv',
      'name,module,path\n"analyst","bmm","_byan/bmm/agents/analyst.md"\n');
    const report = rewritePaths({ projectRoot: root, apply: true });
    assert.equal(report.applied, true);
    const after = fs.readFileSync(path.join(root, '_byan/_config/agent-manifest.csv'), 'utf8');
    assert.ok(after.includes('"_byan/agent/analyst/analyst.md"'));
    assert.ok(after.endsWith('\n'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
