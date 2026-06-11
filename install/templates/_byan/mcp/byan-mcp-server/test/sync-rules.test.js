import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadConfig,
  renderSkill,
  renderStrictConfig,
  renderAgentsBlock,
  upsertBlock,
  syncRules,
  MARKERS,
} from '../lib/sync-rules.js';

// Minimal valid config used across tests.
const CONFIG_YAML = `
version: 1
name: BYAN Strict Mode
slug: byan-strict
description: Enforcement mode that prevents scope downgrade.
confidence:
  min_score: 95
  hard_claim_level: 1
self_verify:
  min_passes: 3
  last_verdict_must_be: ok
activation:
  manual_mode: strict
  auto_keywords: [prod, production, client]
injection:
  context_banner: |
    [STRICT MODE ACTIVE]
    Lock the scope first.
  stop_block_reason: The turn cannot end without three passes.
  pretooluse_deny_reason: This write is outside the locked scope.
hooks:
  completion_claim_markers: [done, finished, fini]
  scope_guard:
    enforce_paths: true
    exempt_globs: [".byan-strict/"]
  freshness_window_seconds: 600
mantras:
  - id: STRICT-1
    name: Scope Lock First
    rule: Lock the scope before any build.
  - id: STRICT-2
    name: No Downgrade
    rule: Deliver the scope that was asked.
`;

function tmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-sync-'));
  const cfgDir = path.join(root, '_byan', '_config');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(path.join(cfgDir, 'strict-mode.yaml'), CONFIG_YAML);
  return root;
}

test('loadConfig parses and validates', () => {
  const root = tmpRoot();
  const cfg = loadConfig({ projectRoot: root });
  assert.equal(cfg.self_verify.min_passes, 3);
  assert.equal(cfg.mantras.length, 2);
});

test('loadConfig throws on missing file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-sync-empty-'));
  assert.throws(() => loadConfig({ projectRoot: root }), /not found/);
});

test('loadConfig throws on empty mantras', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-sync-nomantra-'));
  const cfgDir = path.join(root, '_byan', '_config');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(
    path.join(cfgDir, 'strict-mode.yaml'),
    CONFIG_YAML.replace(/mantras:[\s\S]*$/, 'mantras: []\n')
  );
  assert.throws(() => loadConfig({ projectRoot: root }), /mantras/);
});

test('renderStrictConfig projects the runtime subset', () => {
  const cfg = loadConfig({ projectRoot: tmpRoot() });
  const out = renderStrictConfig(cfg);
  assert.equal(out.min_passes, 3);
  assert.equal(out.min_score, 95);
  assert.deepEqual(out.completion_claim_markers, ['done', 'finished', 'fini']);
  assert.ok(out.banners.context.includes('STRICT MODE ACTIVE'));
  assert.equal(out.scope_guard.enforce_paths, true);
});

test('renderSkill embeds frontmatter, tools, and mantras', () => {
  const cfg = loadConfig({ projectRoot: tmpRoot() });
  const md = renderSkill(cfg);
  assert.ok(md.startsWith('---\nname: byan-strict'));
  assert.ok(md.includes('mcp__byan__byan_strict_lock_scope'));
  assert.ok(md.includes('mcp__byan__byan_strict_complete'));
  assert.ok(md.includes('STRICT-1 Scope Lock First'));
  assert.ok(md.includes('95%'));
  // Hooks are registered globally in settings.json (self-gating), not in the
  // skill frontmatter — avoids double-firing.
  assert.ok(!md.includes('strict-stop-guard.js'));
});

test('renderAgentsBlock includes banner and mantras', () => {
  const cfg = loadConfig({ projectRoot: tmpRoot() });
  const block = renderAgentsBlock(cfg);
  assert.ok(block.includes('BYAN Strict Mode'));
  assert.ok(block.includes('STRICT-2 No Downgrade'));
});

test('upsertBlock creates a file with markers when absent', () => {
  const root = tmpRoot();
  const file = path.join(root, 'AGENTS.md');
  const action = upsertBlock({ filePath: file, block: 'HELLO' });
  assert.equal(action, 'created');
  const content = fs.readFileSync(file, 'utf8');
  assert.ok(content.includes(MARKERS.BEGIN));
  assert.ok(content.includes(MARKERS.END));
  assert.ok(content.includes('HELLO'));
});

test('upsertBlock replaces only the block and preserves surrounding content', () => {
  const root = tmpRoot();
  const file = path.join(root, 'AGENTS.md');
  fs.writeFileSync(file, '# My Agents\n\nKeep this line.\n');
  upsertBlock({ filePath: file, block: 'FIRST' });
  let content = fs.readFileSync(file, 'utf8');
  assert.ok(content.includes('Keep this line.'));
  assert.ok(content.includes('FIRST'));

  upsertBlock({ filePath: file, block: 'SECOND' });
  content = fs.readFileSync(file, 'utf8');
  assert.ok(content.includes('Keep this line.'));
  assert.ok(content.includes('SECOND'));
  assert.ok(!content.includes('FIRST'));
  // Exactly one marker pair.
  assert.equal((content.match(new RegExp(MARKERS.BEGIN, 'g')) || []).length, 1);
});

test('upsertBlock is idempotent (unchanged on identical block)', () => {
  const root = tmpRoot();
  const file = path.join(root, 'AGENTS.md');
  upsertBlock({ filePath: file, block: 'SAME' });
  const action = upsertBlock({ filePath: file, block: 'SAME' });
  assert.equal(action, 'unchanged');
});

test('syncRules writes all strict artifacts', () => {
  const root = tmpRoot();
  const report = syncRules({ projectRoot: root });
  assert.equal(report['.claude/skills/byan-strict/SKILL.md'], 'created');
  assert.equal(report['.claude/hooks/lib/strict-config.json'], 'created');
  assert.equal(report['AGENTS.md'], 'created');
  assert.equal(report['.github/copilot-instructions.md'], undefined);

  assert.ok(fs.existsSync(path.join(root, '.claude/skills/byan-strict/SKILL.md')));
  const json = JSON.parse(
    fs.readFileSync(path.join(root, '.claude/hooks/lib/strict-config.json'), 'utf8')
  );
  assert.equal(json.min_passes, 3);
});

test('syncRules is idempotent on second run', () => {
  const root = tmpRoot();
  syncRules({ projectRoot: root });
  const report = syncRules({ projectRoot: root });
  for (const action of Object.values(report)) {
    assert.equal(action, 'unchanged');
  }
});
