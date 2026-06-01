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

// ── Module testarch knowledge -> connaissance/testarch (F16) ─────────────────

test('tea testarch knowledge -> connaissance/testarch (substructure preserved)', () => {
  const r = mapPath('_byan/tea/testarch/knowledge/overview.md');
  assert.equal(r.target, '_byan/connaissance/testarch/knowledge/overview.md');
  assert.equal(r.type, 'connaissance');
  assert.equal(r.provenance, 'tea');
  assert.equal(r.action, 'move');
});

test('tea testarch index rides along to connaissance/testarch', () => {
  const r = mapPath('_byan/tea/testarch/tea-index.csv');
  assert.equal(r.target, '_byan/connaissance/testarch/tea-index.csv');
  assert.equal(r.action, 'move');
});

// ── Module resource docs -> connaissance/ (F16) ──────────────────────────────

test('core excalidraw resources -> connaissance', () => {
  const r = mapPath('_byan/core/resources/excalidraw/README.md');
  assert.equal(r.target, '_byan/connaissance/excalidraw/README.md');
  assert.equal(r.type, 'connaissance');
  assert.equal(r.action, 'move');
});

// ── creator-soul -> agent/byan (F16) ─────────────────────────────────────────

test('creator-soul.md -> agent/byan/', () => {
  const r = mapPath('_byan/creator-soul.md');
  assert.equal(r.target, '_byan/agent/byan/creator-soul.md');
  assert.equal(r.type, 'soul');
  assert.equal(r.action, 'move');
});

// ── workers.md + workers/ dir -> worker/ (F16) ───────────────────────────────

test('workers.md -> worker/workers.md (moved whole, no forced split)', () => {
  const r = mapPath('_byan/workers.md');
  assert.equal(r.target, '_byan/worker/workers.md');
  assert.equal(r.type, 'worker');
  assert.equal(r.action, 'move');
});

test('workers/ launcher dir -> worker/', () => {
  const r = mapPath('_byan/workers/launchers/launch-yanstaller-claude.md');
  assert.equal(r.target, '_byan/worker/launchers/launch-yanstaller-claude.md');
  assert.equal(r.action, 'move');
});

// ── Module-scoped infra retained in place (F16) ──────────────────────────────

test('module config / help / teams / data + core machinery -> keep (not review)', () => {
  for (const p of [
    '_byan/bmb/config.yaml',
    '_byan/tea/module-help.csv',
    '_byan/cis/teams/creative-squad.yaml',
    '_byan/bmm/data/project-context-template.md',
    '_byan/core/model-selector.js',
    '_byan/core/model-selector.yaml',
    '_byan/core/MODEL-SELECTOR-GUIDE.md',
    '_byan/core/base/bmad-base-agent.md',
    '_byan/core/activation/soul-activation.md',
  ]) {
    const r = mapPath(p);
    assert.equal(r.action, 'keep', `expected keep for ${p}`);
    assert.equal(r.target, p, `keep should map ${p} to itself`);
    assert.equal(r.type, 'module-infra');
  }
});

test('no path falls through to review after F16', () => {
  // every ex-manual category is now classified; only config.yaml stays split.
  for (const p of [
    '_byan/tea/testarch/knowledge/nfr-criteria.md',
    '_byan/core/resources/excalidraw/library-loader.md',
    '_byan/creator-soul.md',
    '_byan/workers.md',
    '_byan/workers/launchers/README.md',
    '_byan/bmm/config.yaml',
  ]) {
    assert.notEqual(mapPath(p).action, 'review', `${p} should not be review`);
  }
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

test('buildMigrationPlan auto-resolves cross-module collisions with provenance', () => {
  const root = tmpRepo();
  const plan = buildMigrationPlan({ projectRoot: root });
  const devTargets = plan.filter((e) => e.from.endsWith('agents/dev.md')).map((e) => e.to);
  assert.equal(devTargets.length, 2);
  // distinct targets, each disambiguated by provenance (two genuinely different agents)
  assert.equal(new Set(devTargets).size, 2);
  assert.ok(devTargets.includes('_byan/agent/dev-bmm/dev.md'));
  assert.ok(devTargets.includes('_byan/agent/dev-cis/dev.md'));
});

test('flat-vs-module collision: module wins the canonical slot, flat -> -flat (F18)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-mig-fvm-'));
  const mk = (rel) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'x');
  };
  mk('_byan/bmb/agents/byan.md');   // module copy
  mk('_byan/agents/byan.md');       // flat duplicate
  const plan = buildMigrationPlan({ projectRoot: root });
  const byanEntries = plan.filter((e) => e.from.endsWith('agents/byan.md'));
  const byFrom = Object.fromEntries(byanEntries.map((e) => [e.from, e.to]));
  // module wins the canonical agent/byan/byan.md
  assert.equal(byFrom['_byan/bmb/agents/byan.md'], '_byan/agent/byan/byan.md');
  // flat preserved under agent/byan-flat/
  assert.equal(byFrom['_byan/agents/byan.md'], '_byan/agent/byan-flat/byan.md');
  const flat = byanEntries.find((e) => e.from === '_byan/agents/byan.md');
  assert.equal(flat.superseded, true);
});

test('buildMigrationPlan marks junk as skip', () => {
  const root = tmpRepo();
  const plan = buildMigrationPlan({ projectRoot: root });
  const junk = plan.find((e) => e.from === '_byan/workers-old-WRONG.md');
  assert.equal(junk.action, 'skip');
});

test('buildMigrationPlan leaves no review action and conserves every file (F16)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-mig-f16-'));
  const mk = (rel) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'x');
  };
  const files = [
    '_byan/bmm/agents/dev.md',
    '_byan/tea/testarch/knowledge/overview.md',
    '_byan/tea/testarch/tea-index.csv',
    '_byan/core/resources/excalidraw/README.md',
    '_byan/creator-soul.md',
    '_byan/workers.md',
    '_byan/workers/launchers/launch.md',
    '_byan/bmb/config.yaml',
    '_byan/tea/module-help.csv',
    '_byan/cis/teams/default-party.csv',
    '_byan/core/model-selector.js',
    '_byan/config.yaml',
    '_byan/knowledge/sources.md',
  ];
  files.forEach(mk);
  const plan = buildMigrationPlan({ projectRoot: root });
  // every source file appears exactly once (conservation)
  assert.equal(plan.length, files.length);
  assert.deepEqual(new Set(plan.map((e) => e.from)), new Set(files));
  // no review left; only config.yaml is split
  assert.equal(plan.filter((e) => e.action === 'review').length, 0);
  assert.equal(plan.filter((e) => e.action === 'split').length, 1);
  // module-scoped infra retained
  const kept = plan.filter((e) => e.action === 'keep').map((e) => e.from);
  for (const p of ['_byan/bmb/config.yaml', '_byan/tea/module-help.csv', '_byan/cis/teams/default-party.csv', '_byan/core/model-selector.js']) {
    assert.ok(kept.includes(p), `expected ${p} kept`);
  }
});
