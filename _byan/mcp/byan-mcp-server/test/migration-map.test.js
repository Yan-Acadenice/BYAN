import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mapPath, buildMigrationPlan } from '../lib/migration-map.js';

// ── Agents ───────────────────────────────────────────────────────────────────

test('module agent -> agent/<name>/<name>.md with provenance', () => {
  const r = mapPath('_byan/bmm/agents/analyst.md');
  assert.equal(r.target, '_byan/agent/analyst/analyst.md');
  assert.equal(r.type, 'agent');
  assert.equal(r.scope, 'systeme');
  assert.equal(r.provenance, 'bmm');
  assert.equal(r.action, 'move');
});

test('core root agent -> provenance core', () => {
  const r = mapPath('_byan/agents/hermes.md');
  assert.equal(r.target, '_byan/agent/hermes/hermes.md');
  assert.equal(r.provenance, 'core');
});

test('agent in subdir -> agent/<name>/<name>.md', () => {
  const r = mapPath('_byan/bmm/agents/tech-writer/tech-writer.md');
  assert.equal(r.target, '_byan/agent/tech-writer/tech-writer.md');
  assert.equal(r.type, 'agent');
});

// ── Soul / Tao ───────────────────────────────────────────────────────────────

test('agent soul -> alongside agent', () => {
  const r = mapPath('_byan/agents/skeptic-soul.md');
  assert.equal(r.target, '_byan/agent/skeptic/skeptic-soul.md');
  assert.equal(r.type, 'soul');
  assert.equal(r.action, 'move');
});

test('module agent tao -> alongside agent', () => {
  const r = mapPath('_byan/bmm/agents/analyst-tao.md');
  assert.equal(r.target, '_byan/agent/analyst/analyst-tao.md');
  assert.equal(r.type, 'tao');
});

// ── Workflows ────────────────────────────────────────────────────────────────

test('workflow -> workflow/simple/<name>/ preserving substructure', () => {
  const r = mapPath('_byan/bmm/workflows/create-prd/workflow.md');
  assert.equal(r.target, '_byan/workflow/simple/create-prd/workflow.md');
  assert.equal(r.type, 'workflow');
});

test('workflow nested step file preserved', () => {
  const r = mapPath('_byan/bmm/workflows/create-prd/steps-c/step-01-init.md');
  assert.equal(r.target, '_byan/workflow/simple/create-prd/steps-c/step-01-init.md');
});

// ── Task -> Command (D1) ─────────────────────────────────────────────────────

test('core task -> command/', () => {
  const r = mapPath('_byan/core/tasks/help.md');
  assert.equal(r.target, '_byan/command/help.md');
  assert.equal(r.type, 'command');
});

// ── Knowledge / Memory ───────────────────────────────────────────────────────

test('knowledge -> connaissance', () => {
  const r = mapPath('_byan/knowledge/sources.md');
  assert.equal(r.target, '_byan/connaissance/sources.md');
  assert.equal(r.type, 'connaissance');
});

test('_memory -> memoire', () => {
  const r = mapPath('_byan/_memory/fact-graph.json');
  assert.equal(r.target, '_byan/memoire/fact-graph.json');
  assert.equal(r.type, 'memoire');
});

// ── BYAN root soul/tao ───────────────────────────────────────────────────────

test('BYAN root soul -> agent/byan/', () => {
  const r = mapPath('_byan/soul.md');
  assert.equal(r.target, '_byan/agent/byan/soul.md');
  assert.equal(r.type, 'soul');
  assert.equal(r.action, 'move');
});

// ── Config split (D4) ────────────────────────────────────────────────────────

test('config.yaml -> split into context + regle', () => {
  const r = mapPath('_byan/config.yaml');
  assert.equal(r.action, 'split');
  assert.deepEqual(r.targets, ['_byan/context/config.yaml', '_byan/regle/config-rules.yaml']);
});

// ── Junk / skip ──────────────────────────────────────────────────────────────

test('junk files are skipped', () => {
  assert.equal(mapPath('_byan/workers-old-WRONG.md').action, 'skip');
  assert.equal(mapPath('_byan/_test/foo.md').action, 'skip');
  assert.equal(mapPath('_byan/soul-template.md').action, 'skip');
  assert.equal(mapPath('_byan/COMPLETION-REPORT.md').action, 'skip');
});

// ── Idempotence (already target -> keep) ─────────────────────────────────────

test('already-target paths map to themselves (keep)', () => {
  for (const p of [
    '_byan/agent/byan/byan.md',
    '_byan/workflow/simple/create-prd/workflow.md',
    '_byan/command/help.md',
    '_byan/connaissance/sources.md',
    '_byan/memoire/fact-graph.json',
    '_byan/_config/agent-manifest.csv',
    '_byan/mcp/byan-mcp-server/server.js',
    '_byan/INDEX.md',
  ]) {
    const r = mapPath(p);
    assert.equal(r.action, 'keep', `expected keep for ${p}`);
    assert.equal(r.target, p);
  }
});

// ── Disambiguation by provenance ─────────────────────────────────────────────

test('disambiguate suffixes the agent folder with provenance', () => {
  const r = mapPath('_byan/bmm/agents/dev.md', { disambiguate: true });
  assert.equal(r.target, '_byan/agent/dev-bmm/dev.md');
});

// ── buildMigrationPlan (collision auto-resolution) ───────────────────────────

function tmpRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-mig-'));
  const mk = (rel, body = 'x') => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  };
  // Two agents named "dev" in different modules -> collision on agent/dev/dev.md
  mk('_byan/bmm/agents/dev.md');
  mk('_byan/cis/agents/dev.md');
  mk('_byan/knowledge/sources.md');
  mk('_byan/workers-old-WRONG.md');
  return root;
}

test('buildMigrationPlan returns {from,to,action} entries and moves nothing', () => {
  const root = tmpRepo();
  const before = fs.readdirSync(path.join(root, '_byan', 'bmm', 'agents'));
  const plan = buildMigrationPlan({ projectRoot: root });
  assert.ok(Array.isArray(plan));
  const sources = plan.map((e) => e.from);
  assert.ok(sources.includes('_byan/knowledge/sources.md'));
  // dry-run: source files still in place
  assert.deepEqual(fs.readdirSync(path.join(root, '_byan', 'bmm', 'agents')), before);
});

test('buildMigrationPlan auto-resolves name collisions with provenance', () => {
  const root = tmpRepo();
  const plan = buildMigrationPlan({ projectRoot: root });
  const devTargets = plan.filter((e) => e.from.endsWith('agents/dev.md')).map((e) => e.to);
  assert.equal(devTargets.length, 2);
  // distinct targets, each disambiguated by provenance
  assert.equal(new Set(devTargets).size, 2);
  assert.ok(devTargets.includes('_byan/agent/dev-bmm/dev.md'));
  assert.ok(devTargets.includes('_byan/agent/dev-cis/dev.md'));
});

test('buildMigrationPlan marks junk as skip', () => {
  const root = tmpRepo();
  const plan = buildMigrationPlan({ projectRoot: root });
  const junk = plan.find((e) => e.from === '_byan/workers-old-WRONG.md');
  assert.equal(junk.action, 'skip');
});
