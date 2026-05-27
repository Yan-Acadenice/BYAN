import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseManifestCsv,
  renderIndex,
  buildIndex,
} from '../lib/index-generator.js';

// ── parseManifestCsv ─────────────────────────────────────────────────────────

test('parseManifestCsv parses simple rows into objects keyed by header', () => {
  const csv = 'name,description,module,path\n"a","desc a","core","p/a"\n"b","desc b","bmm","p/b"';
  const rows = parseManifestCsv(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { name: 'a', description: 'desc a', module: 'core', path: 'p/a' });
  assert.equal(rows[1].module, 'bmm');
});

test('parseManifestCsv handles commas embedded in quoted fields', () => {
  const csv = 'name,description,module,path\n"a","one, two, three","core","p/a"';
  const rows = parseManifestCsv(csv);
  assert.equal(rows[0].description, 'one, two, three');
  assert.equal(rows[0].path, 'p/a');
});

test('parseManifestCsv handles escaped double-quotes', () => {
  const csv = 'name,note\n"a","say ""hi"" now"';
  const rows = parseManifestCsv(csv);
  assert.equal(rows[0].note, 'say "hi" now');
});

test('parseManifestCsv tolerates blank lines and trailing newline', () => {
  const csv = 'name,path\n"a","p/a"\n\n';
  const rows = parseManifestCsv(csv);
  assert.equal(rows.length, 1);
});

// ── renderIndex ──────────────────────────────────────────────────────────────

const sample = {
  agents: [
    { name: 'byan', title: 'Builder', module: 'bmb', path: '_byan/bmb/agents/byan.md' },
    { name: 'analyst', title: 'Mary', module: 'bmm', path: '_byan/bmm/agents/analyst.md' },
    { name: 'hermes', title: 'Dispatcher', module: 'core', path: '_byan/agents/hermes.md' },
  ],
  workflows: [
    { name: 'create-prd', description: 'PRD', module: 'bmm', path: '_byan/bmm/workflows/create-prd/workflow.md' },
  ],
  commands: [
    { name: 'help', description: 'help', module: 'core', path: '_byan/core/tasks/help.md' },
  ],
  projects: [{ slug: 'demo', path: '_byan/projet/demo' }],
};

test('renderIndex groups agents by scope/module and lists name + path', () => {
  const out = renderIndex(sample);
  assert.match(out, /## Agents \(3\)/);
  assert.match(out, /### bmb/);
  assert.match(out, /### bmm/);
  assert.match(out, /### core/);
  assert.match(out, /`byan`/);
  assert.match(out, /_byan\/bmb\/agents\/byan\.md/);
});

test('renderIndex includes workflows, commands, projects sections with counts', () => {
  const out = renderIndex(sample);
  assert.match(out, /## Workflows \(1\)/);
  assert.match(out, /create-prd/);
  assert.match(out, /## Commandes \(1\)/);
  assert.match(out, /help/);
  assert.match(out, /## Projets \(1\)/);
  assert.match(out, /`demo`/);
});

test('renderIndex is deterministic (no volatile timestamp) and stable across calls', () => {
  assert.equal(renderIndex(sample), renderIndex(sample));
});

test('renderIndex sorts entries for stable output regardless of input order', () => {
  const shuffled = { ...sample, agents: [sample.agents[2], sample.agents[0], sample.agents[1]] };
  assert.equal(renderIndex(shuffled), renderIndex(sample));
});

// ── buildIndex (end-to-end against a temp repo) ──────────────────────────────

function tmpRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-index-'));
  fs.mkdirSync(path.join(root, '_byan', '_config'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '_byan', '_config', 'agent-manifest.csv'),
    'name,displayName,title,icon,role,identity,communicationStyle,principles,module,path\n' +
      '"byan","Builder","Builder of YAN","[B]","r","i","c","p","bmb","_byan/bmb/agents/byan.md"\n'
  );
  fs.writeFileSync(
    path.join(root, '_byan', '_config', 'workflow-manifest.csv'),
    'name,description,module,path\n"create-prd","PRD, tri-modal","bmm","_byan/bmm/workflows/create-prd/workflow.md"\n'
  );
  fs.writeFileSync(
    path.join(root, '_byan', '_config', 'task-manifest.csv'),
    'name,displayName,description,module,path,standalone\n"help","help","get help","core","_byan/core/tasks/help.md","true"\n'
  );
  return root;
}

test('buildIndex writes _byan/INDEX.md from real manifests', () => {
  const root = tmpRepo();
  const r = buildIndex({ projectRoot: root });
  const indexPath = path.join(root, '_byan', 'INDEX.md');
  assert.ok(fs.existsSync(indexPath));
  const content = fs.readFileSync(indexPath, 'utf8');
  assert.match(content, /`byan`/);
  assert.match(content, /create-prd/);
  assert.match(content, /`help`/); // command from task-manifest
  assert.equal(r.path.endsWith('_byan/INDEX.md'), true);
});

test('buildIndex is idempotent (second run reports unchanged)', () => {
  const root = tmpRepo();
  const first = buildIndex({ projectRoot: root });
  const second = buildIndex({ projectRoot: root });
  assert.equal(first.written, true);
  assert.equal(second.written, false);
});

test('buildIndex scans the project zone', () => {
  const root = tmpRepo();
  fs.mkdirSync(path.join(root, '_byan', 'projet', 'demo'), { recursive: true });
  fs.writeFileSync(path.join(root, '_byan', 'projet', 'demo', 'projet.yaml'), 'slug: demo\n');
  buildIndex({ projectRoot: root });
  const content = fs.readFileSync(path.join(root, '_byan', 'INDEX.md'), 'utf8');
  assert.match(content, /`demo`/);
});
