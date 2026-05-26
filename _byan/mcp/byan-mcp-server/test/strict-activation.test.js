import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectActivation } from '../lib/strict-activation.js';
import { start } from '../lib/fd-state.js';

const CONFIG_YAML = `
activation:
  auto_keywords: [prod, production, client, "template officiel", livrable]
`;

function tmpRootWithConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-act-'));
  const cfgDir = path.join(root, '_byan', '_config');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(path.join(cfgDir, 'strict-mode.yaml'), CONFIG_YAML);
  return root;
}

test('detectActivation suggests on a keyword', () => {
  const r = detectActivation({ text: 'build me a production app', projectRoot: tmpRootWithConfig() });
  assert.equal(r.suggested, true);
  assert.ok(r.matched.includes('production'));
  assert.match(r.message, /byan_strict_lock_scope/);
});

test('detectActivation matches multi-word keyword', () => {
  const r = detectActivation({
    text: 'remplis ce template officiel pour le client',
    projectRoot: tmpRootWithConfig(),
  });
  assert.equal(r.suggested, true);
  assert.ok(r.matched.includes('template officiel'));
  assert.ok(r.matched.includes('client'));
});

test('detectActivation is word-bounded (no false positive)', () => {
  const r = detectActivation({ text: 'reproduction of the bug', projectRoot: tmpRootWithConfig() });
  assert.equal(r.suggested, false);
});

test('detectActivation returns not-suggested on neutral text', () => {
  const r = detectActivation({ text: 'fix a small typo', projectRoot: tmpRootWithConfig() });
  assert.equal(r.suggested, false);
  assert.equal(r.matched.length, 0);
});

test('detectActivation falls back to default keywords without config', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-act-noconf-'));
  const r = detectActivation({ text: 'ship to production', projectRoot: root });
  assert.equal(r.suggested, true);
});

test('fd start records strict_mode flag', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-fd-strict-'));
  const state = start({ featureName: 'x', projectRoot: root, strict: true });
  assert.equal(state.strict_mode, true);
  const plain = start({ featureName: 'y', projectRoot: root, force: true });
  assert.equal(plain.strict_mode, false);
});
