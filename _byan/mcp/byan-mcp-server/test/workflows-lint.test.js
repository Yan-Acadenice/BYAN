import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lintSource, lintWorkflowsDir, stripComments } from '../lib/workflows-lint.js';

test('positive: import of fd-state is a violation', () => {
  const src = `import { advance } from '../_byan/mcp/byan-mcp-server/lib/fd-state.js'\nexport const meta = {}\n`;
  const v = lintSource(src);
  assert.equal(v.length >= 1, true);
  assert.ok(v.some((x) => x.id === 'import-fd-state'));
});

test('positive: require of fd-state is a violation', () => {
  const v = lintSource(`const fd = require('./lib/fd-state.js')\n`);
  assert.ok(v.some((x) => x.id === 'require-fd-state'));
});

test('positive: dynamic import of fd-state is a violation', () => {
  const v = lintSource(`const fd = await import('../lib/fd-state.js')\n`);
  assert.ok(v.some((x) => x.id === 'dynamic-import-fd-state'));
});

test('positive: import of the strict-mode lib is a violation', () => {
  const v = lintSource(`import { lock } from '../lib/strict-mode.js'\n`);
  assert.ok(v.some((x) => x.id === 'import-strict-mode-lib'));
});

test('negative: a clean native script has no violations', () => {
  const src = `export const meta = { name: 'x', description: 'y' }\nconst r = await agent('do work')\nreturn { ok: true }\n`;
  assert.deepEqual(lintSource(src), []);
});

test('negative: a CONTRACT COMMENT that NAMES fd-state.js does not self-trip', () => {
  // This is exactly the contract comment shipped in dev-story.js.
  const src = [
    '// FD / STRICT STATE CONTRACT',
    '//   - NEVER imports/requires _byan/.../lib/fd-state.js and NEVER writes',
    '//     fd-state.json directly (enforced by byan-lint-workflows.js).',
    "export const meta = { name: 'dev-story', description: 'z' }",
    "const r = await agent('do work')",
    'return { ok: true }',
  ].join('\n');
  assert.deepEqual(lintSource(src), []);
});

test('stripComments removes // and /* */ but keeps URLs', () => {
  const out = stripComments("const u = 'https://example.com' // trailing\n/* block */ const x = 1");
  assert.match(out, /https:\/\/example\.com/);
  assert.doesNotMatch(out, /trailing/);
  assert.doesNotMatch(out, /block/);
});

test('lintWorkflowsDir flags a bad script and ignores a clean one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-lint-'));
  fs.writeFileSync(path.join(dir, 'good.js'), "export const meta = {}\nreturn 1\n");
  fs.writeFileSync(path.join(dir, 'bad.js'), "import x from './lib/fd-state.js'\n");
  const results = lintWorkflowsDir(dir);
  assert.equal(results.length, 1);
  assert.match(results[0].file, /bad\.js$/);
});

test('lintWorkflowsDir on a missing dir returns empty (no throw)', () => {
  assert.deepEqual(lintWorkflowsDir('/nonexistent/path/byan-xyz'), []);
});
