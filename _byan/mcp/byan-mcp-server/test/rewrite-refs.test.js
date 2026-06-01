import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveRef, rewriteText, rewriteTree } from '../lib/rewrite-refs.js';

// ── resolveRef: files ────────────────────────────────────────────────────────

test('resolveRef maps a moved agent file', () => {
  assert.equal(resolveRef('_byan/bmm/agents/dev.md'), '_byan/agent/dev/dev.md');
});

test('resolveRef maps moved knowledge / memory files', () => {
  assert.equal(resolveRef('_byan/knowledge/sources.md'), '_byan/connaissance/sources.md');
  assert.equal(resolveRef('_byan/_memory/elo-profile.json'), '_byan/memoire/elo-profile.json');
});

test('resolveRef maps tea testarch knowledge (substructure preserved)', () => {
  assert.equal(resolveRef('_byan/tea/testarch/knowledge/nfr-criteria.md'), '_byan/connaissance/testarch/knowledge/nfr-criteria.md');
});

// ── resolveRef: directories (probe) ──────────────────────────────────────────

test('resolveRef maps a moved directory ref (prefix rename)', () => {
  assert.equal(resolveRef('_byan/knowledge'), '_byan/connaissance');
  assert.equal(resolveRef('_byan/knowledge/'), '_byan/connaissance/');
  assert.equal(resolveRef('_byan/_memory/'), '_byan/memoire/');
  assert.equal(resolveRef('_byan/tea/testarch/knowledge'), '_byan/connaissance/testarch/knowledge');
});

test('resolveRef leaves an agents/ directory ref alone (restructures, ambiguous)', () => {
  assert.equal(resolveRef('_byan/bmm/agents'), null);
});

// ── resolveRef: unchanged cases (keep / split / already-target) ───────────────

test('resolveRef leaves kept module-infra unchanged', () => {
  assert.equal(resolveRef('_byan/bmb/config.yaml'), null);
  assert.equal(resolveRef('_byan/core/model-selector.js'), null);
});

test('resolveRef leaves the split config.yaml unchanged (original stays in place)', () => {
  assert.equal(resolveRef('_byan/config.yaml'), null);
});

test('resolveRef leaves an already-migrated ref unchanged (idempotence base)', () => {
  assert.equal(resolveRef('_byan/agent/dev/dev.md'), null);
  assert.equal(resolveRef('_byan/connaissance/sources.md'), null);
});

// ── rewriteText ──────────────────────────────────────────────────────────────

test('rewriteText rewrites move refs and records changes', () => {
  const src = 'load {project-root}/_byan/bmm/agents/dev.md then _byan/knowledge/sources.md';
  const { text, changes } = rewriteText(src);
  assert.equal(text, 'load {project-root}/_byan/agent/dev/dev.md then _byan/connaissance/sources.md');
  assert.equal(changes.length, 2);
});

test('rewriteText leaves keep/split refs and non-_byan paths untouched', () => {
  const src = 'cfg _byan/config.yaml + _byan/bmb/config.yaml + .claude/hooks/x.js + _byan/agent/byan/byan.md';
  const { text, changes } = rewriteText(src);
  assert.equal(text, src);
  assert.equal(changes.length, 0);
});

test('rewriteText preserves trailing sentence punctuation', () => {
  const { text } = rewriteText('see _byan/knowledge/sources.md.');
  assert.equal(text, 'see _byan/connaissance/sources.md.');
});

test('rewriteText is idempotent', () => {
  const src = 'a _byan/bmm/agents/dev.md b _byan/tea/testarch/knowledge/log.md c _byan/_memory/x.json';
  const once = rewriteText(src).text;
  const twice = rewriteText(once).text;
  assert.equal(twice, once);
  // second pass reports zero changes
  assert.equal(rewriteText(once).changes.length, 0);
});

// ── rewriteTree ──────────────────────────────────────────────────────────────

function tmpRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-rw-'));
  const mk = (rel, body) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  };
  mk('_byan/agents/byan.md', 'I delegate to _byan/bmm/agents/dev.md and read _byan/knowledge/sources.md');
  mk('_byan/bmm/workflows/create-prd/workflow.md', 'see _byan/tea/testarch/knowledge/overview.md');
  mk('_byan/bmb/config.yaml', 'byan_version: 2.7.3  # path _byan/bmb/config.yaml');
  mk('_byan/mcp/byan-mcp-server/server.js', 'const x = "_byan/bmm/agents/dev.md";'); // code: skipped
  mk('_byan/_config/agent-manifest.csv', 'name,path\nbyan,_byan/bmm/agents/byan.md'); // manifest: skipped
  return root;
}

test('rewriteTree dry-run reports changes and writes nothing', () => {
  const root = tmpRepo();
  const before = fs.readFileSync(path.join(root, '_byan/agents/byan.md'), 'utf8');
  const r = rewriteTree({ projectRoot: root, apply: false });
  assert.equal(r.applied, false);
  assert.ok(r.filesChanged >= 2);
  assert.equal(fs.readFileSync(path.join(root, '_byan/agents/byan.md'), 'utf8'), before);
});

test('rewriteTree apply rewrites content but skips code and manifests', () => {
  const root = tmpRepo();
  const r = rewriteTree({ projectRoot: root, apply: true });
  assert.equal(r.applied, true);
  // content rewritten
  assert.match(fs.readFileSync(path.join(root, '_byan/agents/byan.md'), 'utf8'), /_byan\/agent\/dev\/dev\.md/);
  assert.match(fs.readFileSync(path.join(root, '_byan/agents/byan.md'), 'utf8'), /_byan\/connaissance\/sources\.md/);
  // kept config untouched
  assert.match(fs.readFileSync(path.join(root, '_byan/bmb/config.yaml'), 'utf8'), /_byan\/bmb\/config\.yaml/);
  // code under mcp/ NOT rewritten
  assert.match(fs.readFileSync(path.join(root, '_byan/mcp/byan-mcp-server/server.js'), 'utf8'), /_byan\/bmm\/agents\/dev\.md/);
  // _config manifest NOT rewritten by the body rewriter (F6 owns it)
  assert.match(fs.readFileSync(path.join(root, '_byan/_config/agent-manifest.csv'), 'utf8'), /_byan\/bmm\/agents\/byan\.md/);
});

test('rewriteTree is idempotent at the tree level', () => {
  const root = tmpRepo();
  rewriteTree({ projectRoot: root, apply: true });
  const second = rewriteTree({ projectRoot: root, apply: true });
  assert.equal(second.filesChanged, 0);
  assert.equal(second.refsRewritten, 0);
});
