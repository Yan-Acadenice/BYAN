import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkSoul, syncSoul, SOUL_PAIRS, soulDir } from '../lib/sync-soul.js';

// Builds a tmp project with an active soul/tao/memory and their shippable
// prefixed copies, all initially in sync. Returns the root.
function tmpRoot({ syncedShippable = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-soul-'));
  const dir = path.join(root, '_byan', 'agent', 'byan');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'soul.md'), '# Soul\nactive soul v1\n');
  fs.writeFileSync(path.join(dir, 'tao.md'), '# Tao\nactive tao v1\n');
  fs.writeFileSync(path.join(dir, 'soul-memory.md'), '# Journal\nrepo-local entry\n');
  fs.writeFileSync(
    path.join(dir, 'byan-soul.md'),
    syncedShippable ? '# Soul\nactive soul v1\n' : '# Soul\nSTALE shippable soul\n'
  );
  fs.writeFileSync(path.join(dir, 'byan-tao.md'), '# Tao\nactive tao v1\n');
  // Curated seed journal — deliberately DIFFERENT from the active journal.
  fs.writeFileSync(path.join(dir, 'byan-soul-memory.md'), '# Seed journal\ncanonical seed, distinct\n');
  return root;
}

test('SOUL_PAIRS covers soul + tao and NOT soul-memory (curated seed)', () => {
  const shippables = SOUL_PAIRS.map((p) => p.shippable);
  assert.deepEqual(shippables.sort(), ['byan-soul.md', 'byan-tao.md']);
  assert.ok(!shippables.includes('byan-soul-memory.md'));
});

test('checkSoul reports ok when shippable matches active', () => {
  const root = tmpRoot({ syncedShippable: true });
  const res = checkSoul({ projectRoot: root });
  assert.deepEqual(res.drifted, []);
  assert.deepEqual(res.missingActive, []);
  assert.equal(res.ok, true);
});

test('checkSoul detects an injected drift on the shippable soul', () => {
  const root = tmpRoot({ syncedShippable: false });
  const res = checkSoul({ projectRoot: root });
  assert.ok(res.drifted.includes('byan-soul.md'));
  assert.equal(res.ok, false);
});

test('syncSoul restores parity and is idempotent', () => {
  const root = tmpRoot({ syncedShippable: false });
  const first = syncSoul({ projectRoot: root });
  assert.equal(first['byan-soul.md'], 'written');
  assert.equal(first['byan-tao.md'], 'unchanged');
  // Parity restored.
  assert.equal(checkSoul({ projectRoot: root }).ok, true);
  const dir = soulDir(root);
  assert.equal(
    fs.readFileSync(path.join(dir, 'byan-soul.md'), 'utf8'),
    fs.readFileSync(path.join(dir, 'soul.md'), 'utf8')
  );
  // Idempotent: a second run changes nothing.
  const second = syncSoul({ projectRoot: root });
  assert.equal(second['byan-soul.md'], 'unchanged');
  assert.equal(second['byan-tao.md'], 'unchanged');
});

test('syncSoul never touches soul-memory (curated seed stays out of scope)', () => {
  const root = tmpRoot({ syncedShippable: false });
  const dir = soulDir(root);
  const seedBefore = fs.readFileSync(path.join(dir, 'byan-soul-memory.md'), 'utf8');
  syncSoul({ projectRoot: root });
  const seedAfter = fs.readFileSync(path.join(dir, 'byan-soul-memory.md'), 'utf8');
  assert.equal(seedAfter, seedBefore, 'byan-soul-memory.md must not be mirrored');
  // And a divergent seed does not make checkSoul fail (soul-memory is not checked).
  assert.equal(checkSoul({ projectRoot: root }).ok, true);
});

test('checkSoul flags a missing active source rather than silently passing', () => {
  const root = tmpRoot({ syncedShippable: true });
  fs.rmSync(path.join(soulDir(root), 'soul.md'));
  const res = checkSoul({ projectRoot: root });
  assert.ok(res.missingActive.includes('soul.md'));
  assert.equal(res.ok, false);
});

// Anti-drift guard against the REAL repo: after the build ran the sync, the
// shippable soul must be byte-faithful to the active soul. Fails if a future
// edit drifts them (the whole point of the pre-commit gate).
test('the real repo keeps its shippable soul faithful to the active soul', () => {
  const repoRoot = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '..',
    '..',
    '..',
    '..'
  );
  const res = checkSoul({ projectRoot: repoRoot });
  assert.deepEqual(res.drifted, [], `shippable soul drifted: ${res.drifted.join(', ')}`);
  assert.deepEqual(res.missingActive, []);
  assert.equal(res.ok, true);
});
