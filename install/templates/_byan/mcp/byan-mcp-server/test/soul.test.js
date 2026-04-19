import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readSoul, appendSoulMemory } from '../lib/soul.js';

function tmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-test-'));
  fs.mkdirSync(path.join(root, '_byan'), { recursive: true });
  return root;
}

test('readSoul returns all 3 files when present', () => {
  const root = tmpProject();
  fs.writeFileSync(path.join(root, '_byan', 'soul.md'), 'soul content');
  fs.writeFileSync(path.join(root, '_byan', 'tao.md'), 'tao content');
  fs.writeFileSync(path.join(root, '_byan', 'soul-memory.md'), 'memory content');

  const r = readSoul({ which: 'all', projectRoot: root });
  assert.equal(r.soul.content, 'soul content');
  assert.equal(r.tao.content, 'tao content');
  assert.equal(r['soul-memory'].content, 'memory content');
  fs.rmSync(root, { recursive: true, force: true });
});

test('readSoul marks missing files as missing', () => {
  const root = tmpProject();
  const r = readSoul({ which: 'all', projectRoot: root });
  assert.equal(r.soul.missing, true);
  assert.equal(r.soul.content, null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('readSoul with which=soul returns only that file', () => {
  const root = tmpProject();
  fs.writeFileSync(path.join(root, '_byan', 'soul.md'), 'only soul');
  const r = readSoul({ which: 'soul', projectRoot: root });
  assert.ok(r.soul);
  assert.equal(r.tao, undefined);
  fs.rmSync(root, { recursive: true, force: true });
});

test('readSoul throws on unknown target', () => {
  assert.throws(() => readSoul({ which: 'bogus' }));
});

test('appendSoulMemory rejects when validated=false', () => {
  const root = tmpProject();
  assert.throws(
    () => appendSoulMemory({ entry: 'x', projectRoot: root, validated: false }),
    /validated=true is required/
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('appendSoulMemory rejects empty entry', () => {
  const root = tmpProject();
  assert.throws(
    () => appendSoulMemory({ entry: '', projectRoot: root, validated: true }),
    /non-empty/
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('appendSoulMemory writes to soul-memory.md when validated', () => {
  const root = tmpProject();
  const now = new Date('2026-04-18T12:00:00Z');
  const r = appendSoulMemory({
    entry: 'New realization',
    projectRoot: root,
    validated: true,
    now,
  });
  assert.ok(r.appended_chars > 0);
  const p = path.join(root, '_byan', 'soul-memory.md');
  const content = fs.readFileSync(p, 'utf8');
  assert.match(content, /Entree 2026-04-18/);
  assert.match(content, /New realization/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('appendSoulMemory creates file with header when missing', () => {
  const root = tmpProject();
  appendSoulMemory({ entry: 'first', projectRoot: root, validated: true });
  const p = path.join(root, '_byan', 'soul-memory.md');
  const content = fs.readFileSync(p, 'utf8');
  assert.match(content, /Journal vivant BYAN/);
  assert.match(content, /first/);
  fs.rmSync(root, { recursive: true, force: true });
});
