import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeScript,
  decideTierGate,
  hashScript,
  formatGateReason,
  ACK_RE,
} from '../lib/tier-script.js';

// --- analyzeScript: per-leaf report ----------------------------------------

test('analyzeScript: a clean deep-only script has no gaps and no violations', () => {
  const src = [
    "export const meta = { name: 'x', description: 'y' }",
    "const a = await agent('implement it', { label: 'rgr-cycle-1', phase: 'RGR' })",
    "const b = await agent('verify it', { label: 'verify-result', phase: 'VERIFY' })",
  ].join('\n');
  const r = analyzeScript(src);
  assert.equal(r.gaps.length, 0, JSON.stringify(r.gaps));
  assert.equal(r.violations.length, 0, JSON.stringify(r.violations));
  assert.equal(r.acknowledged, false);
  assert.equal(r.leaves.length, 2);
  assert.ok(r.leaves.every((l) => l.verdict === 'ok'));
});

test('analyzeScript: an exploration leaf without model is a gap with expectedModel haiku', () => {
  const src = "const a = await agent('read it', { label: 'load-story', phase: 'LOAD' })";
  const r = analyzeScript(src);
  assert.equal(r.gaps.length, 1);
  assert.equal(r.gaps[0].label, 'load-story');
  assert.equal(r.gaps[0].expectedModel, 'haiku');
  assert.equal(r.gaps[0].verdict, 'missing-tier');
});

test('analyzeScript: a mech- leaf without model is a gap with expectedModel sonnet', () => {
  const src = "const a = await agent('check json', { label: 'mech-validate-json' })";
  const r = analyzeScript(src);
  assert.equal(r.gaps.length, 1);
  assert.equal(r.gaps[0].expectedModel, 'sonnet');
});

test('analyzeScript: tiered exploration and mech leaves are ok', () => {
  const src = [
    "const a = await agent('read', { label: 'load-story', model: 'haiku' })",
    "const b = await agent('check', { label: 'mech-json-validate', model: 'sonnet' })",
  ].join('\n');
  const r = analyzeScript(src);
  assert.equal(r.gaps.length, 0, JSON.stringify(r.gaps));
  assert.equal(r.violations.length, 0);
});

test('analyzeScript: a downgrade on a protected leaf is a violation', () => {
  const src = "const a = await agent('verify', { label: 'verify-adversarial', model: 'haiku' })";
  const r = analyzeScript(src);
  assert.equal(r.violations.length, 1);
  assert.equal(r.violations[0].verdict, 'violation');
});

test('analyzeScript: haiku on a mech- leaf is a violation (below its tier)', () => {
  const src = "const a = await agent('check', { label: 'mech-schema-check', model: 'haiku' })";
  const r = analyzeScript(src);
  assert.equal(r.violations.length, 1, JSON.stringify(r));
});

test('analyzeScript: unlabelled agent calls are counted but never gap (deep default)', () => {
  const src = [
    "const a = await agent('just do the thing')",
    "const b = await agent('other thing', { schema: S })",
  ].join('\n');
  const r = analyzeScript(src);
  assert.equal(r.agentCalls, 2);
  assert.equal(r.leaves.length, 0);
  assert.equal(r.gaps.length, 0);
  assert.equal(r.violations.length, 0);
});

test('analyzeScript: the acknowledgment marker is detected (raw text, comment form)', () => {
  const src = "// BYAN-TIER: reviewed\nconst a = await agent('read', { label: 'load-story' })";
  const r = analyzeScript(src);
  assert.equal(r.acknowledged, true);
  // the gap is still REPORTED (the marker acknowledges it, it does not erase it)
  assert.equal(r.gaps.length, 1);
});

test('analyzeScript: model in a comment does not count (comment-stripped)', () => {
  const src = "// model: 'haiku'\nconst a = await agent('read', { label: 'scan-files' })";
  const r = analyzeScript(src);
  assert.equal(r.gaps.length, 1);
});

test('ACK_RE: matches the exact marker, not lookalikes', () => {
  assert.ok(ACK_RE.test('// BYAN-TIER: reviewed'));
  assert.ok(ACK_RE.test('/* BYAN-TIER:reviewed */'));
  assert.ok(!ACK_RE.test('// BYAN-TIER: pending'));
  assert.ok(!ACK_RE.test('// TIER: reviewed'));
});

// --- decideTierGate: the hook's pure decision -------------------------------

const gapAnalysis = () =>
  analyzeScript("const a = await agent('read', { label: 'load-story' })");
const cleanAnalysis = () =>
  analyzeScript("const a = await agent('do', { label: 'rgr-cycle-1' })");

test('decideTierGate: clean script -> allow (clean)', () => {
  const d = decideTierGate({ analysis: cleanAnalysis() });
  assert.equal(d.decision, 'allow');
  assert.equal(d.code, 'clean');
});

test('decideTierGate: gaps -> deny once with the exact leaf list', () => {
  const d = decideTierGate({ analysis: gapAnalysis(), scriptHash: 'h1', priorDenyHash: null });
  assert.equal(d.decision, 'deny');
  assert.equal(d.code, 'gaps');
  assert.match(d.reason, /load-story/);
  assert.match(d.reason, /haiku/);
  assert.match(d.reason, /BYAN-TIER: reviewed/);
});

test('decideTierGate: same script resubmitted after a deny -> allow (deny once, never trap)', () => {
  const d = decideTierGate({ analysis: gapAnalysis(), scriptHash: 'h1', priorDenyHash: 'h1' });
  assert.equal(d.decision, 'allow');
  assert.equal(d.code, 'unchanged-after-deny');
});

test('decideTierGate: a CHANGED script that still gaps -> deny again (new hash)', () => {
  const d = decideTierGate({ analysis: gapAnalysis(), scriptHash: 'h2', priorDenyHash: 'h1' });
  assert.equal(d.decision, 'deny');
});

test('decideTierGate: acknowledged script -> allow even with gaps', () => {
  const src = "// BYAN-TIER: reviewed\nconst a = await agent('read', { label: 'load-story' })";
  const d = decideTierGate({ analysis: analyzeScript(src) });
  assert.equal(d.decision, 'allow');
  assert.equal(d.code, 'acknowledged');
});

test('decideTierGate: escape hatch -> allow, auditable code', () => {
  const d = decideTierGate({ analysis: gapAnalysis(), escaped: true });
  assert.equal(d.decision, 'allow');
  assert.equal(d.code, 'escape-hatch');
});

test('decideTierGate: violations deny even when gaps are absent', () => {
  const a = analyzeScript("const x = await agent('v', { label: 'verify-it', model: 'haiku' })");
  const d = decideTierGate({ analysis: a, scriptHash: 'h', priorDenyHash: null });
  assert.equal(d.decision, 'deny');
  assert.equal(d.code, 'violations');
});

test('formatGateReason: lists each gap with its expected model, one line per leaf', () => {
  const a = analyzeScript(
    [
      "const x = await agent('r', { label: 'load-story' })",
      "const y = await agent('c', { label: 'mech-lint-run' })",
    ].join('\n')
  );
  const msg = formatGateReason(a);
  assert.match(msg, /load-story.*haiku/);
  assert.match(msg, /mech-lint-run.*sonnet/);
});

// --- hashScript --------------------------------------------------------------

test('hashScript: stable for identical input, differs on change', () => {
  assert.equal(hashScript('abc'), hashScript('abc'));
  assert.notEqual(hashScript('abc'), hashScript('abd'));
  assert.equal(typeof hashScript('abc'), 'string');
});
