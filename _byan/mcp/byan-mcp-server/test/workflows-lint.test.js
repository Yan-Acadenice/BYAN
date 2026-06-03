import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  lintSource,
  lintWorkflowsDir,
  stripComments,
  clockRngViolations,
  metaLiteralViolations,
  validateContract,
} from '../lib/workflows-lint.js';

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

test('clockRngViolations: flags a clock token even inside a COMMENT (raw scan)', () => {
  // The launch validator scans raw text, so a token in a comment breaks invocation.
  const v = clockRngViolations('// note: never use Date.now() here\nexport const meta = {}');
  assert.equal(v.length, 1);
  assert.equal(v[0].id, 'clock-or-rng');
});

test('clockRngViolations: flags a clock token inside a string', () => {
  assert.equal(clockRngViolations("const p = 'uses new Date()'").length, 1);
});

test('clockRngViolations: clean script has none', () => {
  assert.deepEqual(clockRngViolations('export const meta = {}\nconst r = await agent("x")'), []);
});

test('metaLiteralViolations: clean when first real line is the meta literal', () => {
  assert.deepEqual(metaLiteralViolations('export const meta = { name: "x" }\nreturn 1'), []);
});

test('metaLiteralViolations: tolerates a shebang and leading blank lines', () => {
  assert.deepEqual(metaLiteralViolations('#!/usr/bin/env node\n\nexport const meta = { name: "x" }'), []);
});

test('metaLiteralViolations: flags a script that does not start with the meta literal', () => {
  const v = metaLiteralViolations('const x = 1\nexport const meta = {}');
  assert.equal(v.length, 1);
  assert.equal(v[0].id, 'meta-literal-first');
});

test('validateContract: a clean native script passes the full contract', () => {
  const src = 'export const meta = { name: "x", description: "y" }\nconst r = await agent("do")\nreturn { ok: true }\n';
  assert.deepEqual(validateContract(src), []);
});

test('validateContract: catches the clock-in-comment bug that broke the ports', () => {
  // Exactly the failure a manual review caught: a contract comment naming the
  // banned token. node --check would pass, but the launch validator would not.
  const src = [
    '// CONTRACT: this script uses no wall-clock such as Date.now() ...',
    'export const meta = { name: "x", description: "y" }',
    'return 1',
  ].join('\n');
  const v = validateContract(src);
  assert.ok(v.some((x) => x.id === 'clock-or-rng'));
});

test('validateContract: aggregates state + clock + meta violations', () => {
  const src = "import x from './lib/fd-state.js'\nconst t = Date.now()\n";
  const ids = validateContract(src).map((x) => x.id);
  assert.ok(ids.includes('import-fd-state'));
  assert.ok(ids.includes('clock-or-rng'));
  assert.ok(ids.includes('meta-literal-first'));
});
