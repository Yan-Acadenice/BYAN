import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  classify,
  resolveWorkflow,
  renderRegistry,
  buildWorkflowsRegistry,
  PORTABLE,
} from '../lib/workflows-generator.js';

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'byan-wf-'));
}

function writeManifest(root, rows) {
  const dir = path.join(root, '_byan', '_config');
  fs.mkdirSync(dir, { recursive: true });
  const header = 'name,description,module,path\n';
  const body = rows
    .map((r) => `"${r.name}","${r.description || ''}","${r.module || 'core'}","${r.path || ''}"`)
    .join('\n');
  fs.writeFileSync(path.join(dir, 'workflow-manifest.csv'), header + body + '\n');
}

test('classify routes names to the right bucket', () => {
  assert.equal(classify('dev-story'), 'autonomous');
  assert.equal(classify('code-review'), 'pipeline');
  assert.equal(classify('create-prd'), 'gated');
  assert.equal(classify('unknown-workflow'), 'gated');
});

test('PORTABLE has no overlap between buckets', () => {
  const overlap = PORTABLE.autonomous.filter((n) => PORTABLE.pipeline.includes(n));
  assert.deepEqual(overlap, []);
});

test('resolveWorkflow prefers the native .js when present', () => {
  const root = tmpRoot();
  writeManifest(root, [
    { name: 'dev-story', path: '_byan/workflow/simple/4-implementation/dev-story/workflow.yaml' },
  ]);
  const wfdir = path.join(root, '.claude', 'workflows');
  fs.mkdirSync(wfdir, { recursive: true });
  fs.writeFileSync(path.join(wfdir, 'dev-story.js'), 'export const meta = { name: "dev-story", description: "x" }\n');
  const r = resolveWorkflow('dev-story', { projectRoot: root });
  assert.equal(r.kind, 'native');
  assert.equal(r.rel, '.claude/workflows/dev-story.js');
});

test('resolveWorkflow falls back to markdown when no native exists', () => {
  const root = tmpRoot();
  writeManifest(root, [
    { name: 'dev-story', path: '_byan/workflow/simple/4-implementation/dev-story/workflow.yaml' },
  ]);
  const r = resolveWorkflow('dev-story', { projectRoot: root });
  assert.equal(r.kind, 'markdown');
  assert.equal(r.rel, '_byan/workflow/simple/4-implementation/dev-story/workflow.yaml');
});

test('resolveWorkflow returns null for an unknown workflow', () => {
  const root = tmpRoot();
  writeManifest(root, []);
  assert.equal(resolveWorkflow('does-not-exist', { projectRoot: root }), null);
});

test('renderRegistry is deterministic (same input -> identical output)', () => {
  const root = tmpRoot();
  const wf = [
    { name: 'dev-story', path: 'a', module: 'bmm' },
    { name: 'code-review', path: 'b', module: 'bmm' },
  ];
  const a = renderRegistry({ workflows: wf, projectRoot: root });
  const b = renderRegistry({ workflows: wf, projectRoot: root });
  assert.equal(a, b);
  assert.match(a, /dev-story/);
  assert.match(a, /## autonomous/);
  assert.match(a, /## pipeline/);
});

test('renderRegistry surfaces drift for a portable name absent from the manifest', () => {
  const root = tmpRoot();
  // dev-story declared portable but NOT in this manifest -> drift section.
  const out = renderRegistry({ workflows: [{ name: 'code-review', path: 'b' }], projectRoot: root });
  assert.match(out, /drift/);
  assert.match(out, /dev-story/);
});

test('buildWorkflowsRegistry writes once then is idempotent on re-run', () => {
  const root = tmpRoot();
  writeManifest(root, [
    { name: 'dev-story', path: 'a' },
    { name: 'code-review', path: 'b' },
  ]);
  const r1 = buildWorkflowsRegistry({ projectRoot: root });
  assert.equal(r1.written, true);
  assert.ok(fs.existsSync(r1.path));
  const r2 = buildWorkflowsRegistry({ projectRoot: root });
  assert.equal(r2.written, false);
  assert.equal(r1.counts.autonomous, 1);
  assert.equal(r1.counts.pipeline, 1);
});
