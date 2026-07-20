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
  modelRoutingViolations,
  untieredExplorationViolations,
  untieredAnalysisViolations,
  mechanicalLabelViolations,
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

// --- F3: model-routing anti-downgrade guard -------------------------------

test('modelRoutingViolations: a leaf with no model: is clean (deep = inherit)', () => {
  const src = "const r = await agent('do', { label: 'rgr-cycle-1', phase: 'RGR' })";
  assert.deepEqual(modelRoutingViolations(src), []);
});

test('modelRoutingViolations: an exploration leaf downgraded to haiku is allowed', () => {
  const src = "const r = await agent('read', { label: 'load-story', phase: 'LOAD', model: 'haiku' })";
  assert.deepEqual(modelRoutingViolations(src), []);
});

test('modelRoutingViolations: a PROTECTED leaf carrying a downgrade is a violation', () => {
  const src = "const r = await agent('verify', { label: 'verify-cycle-1', model: 'haiku' })";
  const v = modelRoutingViolations(src);
  assert.ok(v.some((x) => x.id === 'protected-leaf-downgraded'), JSON.stringify(v));
});

test('modelRoutingViolations: a genuinely unknown model is a violation', () => {
  // an alias outside the vocabulary (haiku/sonnet/opus/fable) is unknown.
  const src = "const r = await agent('x', { label: 'load-story', model: 'gpt-5.4' })";
  const v = modelRoutingViolations(src);
  assert.ok(v.some((x) => x.id === 'unknown-tier-model'), JSON.stringify(v));
});

test('modelRoutingViolations (v3): an up-tier pin (opus/fable) is ALLOWED, even on a protected leaf and without a label', () => {
  // opus on an exploration leaf: allowed up-tier.
  assert.deepEqual(modelRoutingViolations("const r = await agent('x', { label: 'load-story', model: 'opus' })"), []);
  // fable on a protected implementation leaf: allowed up-tier (last resort).
  assert.deepEqual(modelRoutingViolations("const r = await agent('x', { label: 'rgr-cycle-1', model: 'fable' })"), []);
  // opus with no identifiable label: still allowed (the label rule gates downgrades only).
  assert.deepEqual(modelRoutingViolations("const r = await agent('x', { model: 'opus' })"), []);
});

test('modelRoutingViolations: a downgrade without an identifiable label is a violation', () => {
  const src = "const r = await agent('x', { model: 'haiku' })";
  const v = modelRoutingViolations(src);
  assert.ok(v.some((x) => x.id === 'downgrade-without-label'), JSON.stringify(v));
});

test('modelRoutingViolations: works across a multiline opts object (real script style)', () => {
  const ok = [
    'const loaded = await agent(',
    '  `Read the story file. Report the story key.`,',
    "  { label: 'load-story', phase: 'LOAD', model: 'haiku' }",
    ')',
  ].join('\n');
  assert.deepEqual(modelRoutingViolations(ok), []);

  const bad = [
    'const impl = await agent(',
    '  `red-green-refactor cycle`,',
    "  { label: 'rgr-cycle-1', phase: 'RGR', model: 'haiku' }",
    ')',
  ].join('\n');
  assert.ok(modelRoutingViolations(bad).some((x) => x.id === 'protected-leaf-downgraded'));
});

test('modelRoutingViolations: a model token in a COMMENT does not trip (comment-stripped)', () => {
  const src = "// example: model: 'haiku' on a verify leaf would be illegal\nconst r = await agent('x', { label: 'verify-cycle-1' })";
  assert.deepEqual(modelRoutingViolations(src), []);
});

test('validateContract: aggregates a routing violation with the rest', () => {
  const src = [
    'export const meta = { name: "x", description: "y" }',
    "const r = await agent('v', { label: 'validate-content', model: 'haiku' })",
    'return 1',
  ].join('\n');
  const ids = validateContract(src).map((x) => x.id);
  assert.ok(ids.includes('protected-leaf-downgraded'));
});

// --- positive tiering: exploration leaves must downgrade --------------------

test('untieredExplorationViolations: an exploration leaf with no model is a violation', () => {
  const src = "const r = await agent('read the file', { label: 'load-story', phase: 'LOAD' })";
  const v = untieredExplorationViolations(src);
  assert.ok(v.some((x) => x.id === 'untiered-exploration'), JSON.stringify(v));
});

test('untieredExplorationViolations: an exploration leaf pinned to haiku is clean', () => {
  const src = "const r = await agent('read', { label: 'load-story', phase: 'LOAD', model: 'haiku' })";
  assert.deepEqual(untieredExplorationViolations(src), []);
});

test('untieredExplorationViolations: a PROTECTED leaf with no model is clean (deep = inherit)', () => {
  const src = "const r = await agent('do', { label: 'rgr-cycle-1', phase: 'RGR' })";
  assert.deepEqual(untieredExplorationViolations(src), []);
});

// --- analysis routing: the revived Sonnet middle tier ----------------------

test('modelRoutingViolations: an analysis leaf pinned to sonnet is allowed (its tier)', () => {
  const src = "const r = await agent('assess', { label: 'assess-risk', model: 'sonnet' })";
  assert.deepEqual(modelRoutingViolations(src), []);
});

test('modelRoutingViolations: an analysis leaf dropped to haiku is below its tier', () => {
  const src = "const r = await agent('assess', { label: 'assess-risk', model: 'haiku' })";
  const v = modelRoutingViolations(src);
  assert.ok(v.some((x) => x.id === 'analysis-below-tier'), JSON.stringify(v));
});

test('modelRoutingViolations: a deep- analysis leaf pinned to a downgrade is a violation (opted out)', () => {
  const src = "const r = await agent('assess', { label: 'deep-assess-architecture', model: 'sonnet' })";
  const v = modelRoutingViolations(src);
  assert.ok(v.some((x) => x.id === 'protected-leaf-downgraded'), JSON.stringify(v));
});

test('untieredAnalysisViolations: an analysis leaf with no model is flagged (should be sonnet)', () => {
  const src = "const r = await agent('assess', { label: 'assess-risk', phase: 'A' })";
  const v = untieredAnalysisViolations(src);
  assert.ok(v.some((x) => x.id === 'untiered-analysis'), JSON.stringify(v));
});

test('untieredAnalysisViolations: sonnet-pinned or deep- analysis is clean', () => {
  const pinned = "const r = await agent('assess', { label: 'assess-risk', model: 'sonnet' })";
  assert.deepEqual(untieredAnalysisViolations(pinned), []);
  const escaped = "const r = await agent('assess', { label: 'deep-assess-architecture', phase: 'A' })";
  assert.deepEqual(untieredAnalysisViolations(escaped), []);
});

test('untieredExplorationViolations: order-independent (model before label)', () => {
  const src = "const r = await agent('read', { model: 'haiku', label: 'scan-context' })";
  assert.deepEqual(untieredExplorationViolations(src), []);
});

test('untieredExplorationViolations: multiline opts on an exploration leaf', () => {
  const ok = [
    'const loaded = await agent(',
    '  `Read the story file. Report the story key.`,',
    "  { label: 'load-story', phase: 'LOAD', model: 'haiku' }",
    ')',
  ].join('\n');
  assert.deepEqual(untieredExplorationViolations(ok), []);

  const bad = [
    'const loaded = await agent(',
    '  `Read the story file.`,',
    "  { label: 'load-story', phase: 'LOAD' }",
    ')',
  ].join('\n');
  assert.ok(untieredExplorationViolations(bad).some((x) => x.id === 'untiered-exploration'));
});

test('untieredExplorationViolations: a template-literal exploration label still fires', () => {
  const src = "const r = await agent('x', { label: `fetch-evidence:${opt.name}`, phase: 'SOURCE' })";
  assert.ok(untieredExplorationViolations(src).some((x) => x.id === 'untiered-exploration'), src);
});

test('untieredExplorationViolations: a computed (unquoted) label is never flagged (conservative)', () => {
  const src = 'const r = await agent("x", { label: dynamicLabel, phase: "P" })';
  assert.deepEqual(untieredExplorationViolations(src), []);
});

test('untieredExplorationViolations: two sibling objects, only the untiered exploration one fires', () => {
  const src = "const a = [{ label: 'load-a', model: 'haiku' }, { label: 'scan-b' }]";
  const v = untieredExplorationViolations(src);
  assert.equal(v.length, 1, JSON.stringify(v));
  assert.match(v[0].msg, /scan-b/);
});

test('untieredExplorationViolations: a model token in a COMMENT does not satisfy the rule', () => {
  const src = "// model: 'haiku'\nconst r = await agent('x', { label: 'load-story' })";
  assert.ok(untieredExplorationViolations(src).some((x) => x.id === 'untiered-exploration'));
});

test('validateContract: does NOT include untiered-exploration (advisory, not a hard rule)', () => {
  // The positive tiering check is a FLOOR-not-ceiling decision: it must never
  // block a commit by forcing a downgrade onto a judgment-bearing leaf.
  const src = [
    'export const meta = { name: "x", description: "y" }',
    "const r = await agent('read', { label: 'load-story', phase: 'LOAD' })",
    'return 1',
  ].join('\n');
  const ids = validateContract(src).map((x) => x.id);
  assert.ok(!ids.includes('untiered-exploration'), JSON.stringify(ids));
  // ...but the standalone advisory still surfaces it.
  assert.ok(untieredExplorationViolations(src).some((x) => x.id === 'untiered-exploration'));
});

// --- MECHANICAL: the mech- opt-in and its floor -----------------------------

test('modelRoutingViolations: sonnet on a mech- leaf is allowed (the balanced tier in use)', () => {
  const src = "const r = await agent('check json', { label: 'mech-validate-json', model: 'sonnet' })";
  assert.deepEqual(modelRoutingViolations(src), []);
});

test('modelRoutingViolations: haiku on a mech- leaf is below its tier (violation)', () => {
  const src = "const r = await agent('check json', { label: 'mech-validate-json', model: 'haiku' })";
  const v = modelRoutingViolations(src);
  assert.ok(v.some((x) => x.id === 'mechanical-below-tier'), JSON.stringify(v));
});

test('modelRoutingViolations: sonnet on a PROTECTED leaf stays a violation (no fuzzy mechanical)', () => {
  const src = "const r = await agent('verify', { label: 'verify-adversarial', model: 'sonnet' })";
  const v = modelRoutingViolations(src);
  assert.ok(v.some((x) => x.id === 'protected-leaf-downgraded'), JSON.stringify(v));
});

test('modelRoutingViolations: sonnet on an exploration leaf is allowed (above its floor)', () => {
  const src = "const r = await agent('read', { label: 'load-story', model: 'sonnet' })";
  assert.deepEqual(modelRoutingViolations(src), []);
});

test('mechanicalLabelViolations: a mech- label with NO model is a hard violation (half-applied opt-in)', () => {
  const src = "const r = await agent('check', { label: 'mech-validate-json', phase: 'VALIDATE' })";
  const v = mechanicalLabelViolations(src);
  assert.ok(v.some((x) => x.id === 'mechanical-without-model'), JSON.stringify(v));
});

test('mechanicalLabelViolations: a mech- label with sonnet is clean (order-independent)', () => {
  assert.deepEqual(
    mechanicalLabelViolations("const r = await agent('c', { label: 'mech-lint-run', model: 'sonnet' })"),
    []
  );
  assert.deepEqual(
    mechanicalLabelViolations("const r = await agent('c', { model: 'sonnet', label: 'mech-lint-run' })"),
    []
  );
});

test('mechanicalLabelViolations: non-mech labels are never touched', () => {
  const src = "const r = await agent('v', { label: 'validate-content' })\nconst s = await agent('r', { label: 'load-story' })";
  assert.deepEqual(mechanicalLabelViolations(src), []);
});

test('modelRoutingViolations: a model in a meta.phases entry is NOT a leaf downgrade', () => {
  // The harness meta spec allows `model` on a phase entry (display/override
  // declaration). It carries no label by design and must not read as a
  // downgrade-without-label.
  const src = [
    "export const meta = {",
    "  name: 'x',",
    "  description: 'y',",
    "  phases: [",
    "    { title: 'VALIDATE', detail: 'checks', model: 'sonnet' },",
    "    { title: 'BUILD' },",
    "  ],",
    "}",
    "const r = await agent('check', { label: 'mech-validate-status', model: 'sonnet' })",
  ].join('\n');
  assert.deepEqual(modelRoutingViolations(src), []);
});

test('stripMetaLiteral edge: a brace inside a meta string unbalances the walk and fails CLOSED', () => {
  // The walk is string-unaware by choice. An unbalanced brace inside a meta
  // string makes it no-op, so the meta model token stays visible and the scan
  // OVER-reports (a false downgrade-without-label) rather than hiding a real
  // violation. This test locks that benign-degraded direction.
  const src = [
    "export const meta = {",
    "  name: 'x',",
    "  description: 'y',",
    "  phases: [{ title: 'VALIDATE', detail: 'coverage {x', model: 'sonnet' }],",
    "}",
    "const r = await agent('do', { label: 'rgr-cycle-1' })",
  ].join('\n');
  const v = modelRoutingViolations(src);
  assert.ok(v.some((x) => x.id === 'downgrade-without-label'), JSON.stringify(v));
});

test('validateContract: includes the mechanical hard rules', () => {
  const src = [
    'export const meta = { name: "x", description: "y" }',
    "const a = await agent('c', { label: 'mech-validate-json' })",
    "const b = await agent('c2', { label: 'mech-schema-check', model: 'haiku' })",
    'return 1',
  ].join('\n');
  const ids = validateContract(src).map((x) => x.id);
  assert.ok(ids.includes('mechanical-without-model'), JSON.stringify(ids));
  assert.ok(ids.includes('mechanical-below-tier'), JSON.stringify(ids));
});
