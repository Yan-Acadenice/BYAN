import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dedupLines, reconcile } from '../lib/manifest-reconcile.js';

const HEADER = 'name,displayName,title,icon,role,identity,communicationStyle,principles,module,path';

// ── dedupLines ───────────────────────────────────────────────────────────────

test('removes a row with same name+path (keeps the first, preserves raw line)', () => {
  const csv = [
    HEADER,
    '"drawio","DrawIO","t","i","r","id","style A","princ A","bmb","_byan/bmb/agents/drawio.md"',
    '"drawio","DrawIO","t","i","r","id","style B","princ B","bmb","_byan/bmb/agents/drawio.md"',
    '"analyst","Mary","t","i","r","id","s","p","bmm","_byan/bmm/agents/analyst.md"',
  ].join('\n');
  const r = dedupLines(csv);
  const lines = r.text.split('\n');
  assert.equal(lines.length, 3, 'header + drawio(first) + analyst');
  assert.match(lines[1], /style A/, 'first drawio kept');
  assert.ok(!r.text.includes('style B'), 'second drawio dropped');
  assert.equal(r.removed.length, 1);
  assert.equal(r.removed[0].name, 'drawio');
});

test('order is preserved for kept rows', () => {
  const csv = [HEADER,
    '"a","","","","","","","","core","_byan/agents/a.md"',
    '"b","","","","","","","","core","_byan/agents/b.md"',
    '"a","","","","","","","","core","_byan/agents/a.md"',
  ].join('\n');
  const r = dedupLines(csv);
  const names = r.text.split('\n').slice(1).map((l) => l.split(',')[0].replace(/"/g, ''));
  assert.deepEqual(names, ['a', 'b']);
});

test('same name with different path is a collision, both kept', () => {
  const csv = [HEADER,
    '"dev","","","","","","","","bmm","_byan/bmm/agents/dev.md"',
    '"dev","","","","","","","","cis","_byan/cis/agents/dev.md"',
  ].join('\n');
  const r = dedupLines(csv);
  assert.equal(r.text.split('\n').length, 3, 'both dev rows kept');
  assert.equal(r.removed.length, 0);
  assert.equal(r.collisions.length, 1);
  assert.equal(r.collisions[0].name, 'dev');
  assert.equal(r.collisions[0].paths.length, 2);
});

test('dedupLines is idempotent', () => {
  const csv = [HEADER,
    '"x","","","","","","","","core","_byan/agents/x.md"',
    '"x","","","","","","","","core","_byan/agents/x.md"',
  ].join('\n');
  const once = dedupLines(csv).text;
  const twice = dedupLines(once).text;
  assert.equal(once, twice);
});

test('tolerates trailing newline', () => {
  const csv = HEADER + '\n"a","","","","","","","","core","_byan/agents/a.md"\n';
  const r = dedupLines(csv);
  assert.ok(r.text.includes('"a"'));
});

// ── reconcile (end-to-end on temp manifests) ─────────────────────────────────

function tmpRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-recon-'));
  const cfg = path.join(root, '_byan', '_config');
  fs.mkdirSync(cfg, { recursive: true });
  fs.writeFileSync(path.join(cfg, 'agent-manifest.csv'), [
    HEADER,
    '"drawio","DrawIO","t","i","r","id","A","A","bmb","_byan/bmb/agents/drawio.md"',
    '"drawio","DrawIO","t","i","r","id","B","B","bmb","_byan/bmb/agents/drawio.md"',
  ].join('\n') + '\n');
  return root;
}

test('reconcile dry-run reports but does not write', () => {
  const root = tmpRepo();
  const before = fs.readFileSync(path.join(root, '_byan/_config/agent-manifest.csv'), 'utf8');
  const report = reconcile({ projectRoot: root });
  assert.equal(report.applied, false);
  assert.ok(report.manifests['agent-manifest.csv'].removed >= 1);
  assert.equal(fs.readFileSync(path.join(root, '_byan/_config/agent-manifest.csv'), 'utf8'), before);
});

test('reconcile apply removes the duplicate row from the file', () => {
  const root = tmpRepo();
  const report = reconcile({ projectRoot: root, apply: true });
  const after = fs.readFileSync(path.join(root, '_byan/_config/agent-manifest.csv'), 'utf8');
  assert.equal(after.match(/"drawio"/g).length, 1, 'one drawio row left');
  assert.ok(after.includes('"A","A"'), 'first occurrence kept');
  assert.ok(!after.includes('"B","B"'), 'duplicate dropped');
  assert.equal(report.applied, true);
});
