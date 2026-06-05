import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIERS,
  TIER_MODEL,
  LEAF_TYPES,
  classifyLeaf,
  tierFor,
  modelForLeaf,
  isKnownTierModel,
  isDowngradeModel,
} from '../lib/native-tiers.js';

// --- Vocabulary -----------------------------------------------------------

test('TIERS exposes the three-tier vocabulary, frozen', () => {
  assert.deepEqual({ ...TIERS }, { CHEAP: 'cheap', BALANCED: 'balanced', DEEP: 'deep' });
  assert.ok(Object.isFrozen(TIERS));
});

test('TIER_MODEL: deep is null (omit = inherit main-loop), only cheap/balanced carry a model', () => {
  assert.equal(TIER_MODEL.cheap, 'haiku');
  assert.equal(TIER_MODEL.balanced, 'sonnet');
  assert.equal(TIER_MODEL.deep, null);
  assert.ok(Object.isFrozen(TIER_MODEL));
});

// --- classifyLeaf: label-driven (NOT prompt-driven) -----------------------

test('classifyLeaf keys off the label: exploration labels', () => {
  for (const label of [
    'load-story', 'load-context', 'load-resources', 'source-tree',
    'detect-mode', 'detect-framework', 'discover-tests', 'parse-epics',
    'mode-detection',
  ]) {
    assert.equal(classifyLeaf({ label }), LEAF_TYPES.EXPLORATION, `${label} should be exploration`);
  }
});

test('classifyLeaf: protected labels never read as exploration', () => {
  assert.equal(classifyLeaf({ label: 'verify-cycle-1' }), LEAF_TYPES.VERIFICATION);
  assert.equal(classifyLeaf({ label: 'validate-content' }), LEAF_TYPES.VERIFICATION);
  assert.equal(classifyLeaf({ label: 'rgr-cycle-1' }), LEAF_TYPES.IMPLEMENTATION);
  assert.equal(classifyLeaf({ label: 'build-elements' }), LEAF_TYPES.IMPLEMENTATION);
  assert.equal(classifyLeaf({ label: 'write-story' }), LEAF_TYPES.IMPLEMENTATION);
  assert.equal(classifyLeaf({ label: 'risk-and-testability' }), LEAF_TYPES.ANALYSIS);
  assert.equal(classifyLeaf({ label: 'integration-architecture' }), LEAF_TYPES.ANALYSIS);
});

test('classifyLeaf: a label that loads AND verifies is protected (protect wins)', () => {
  // conservative: any protected signal beats an exploration signal
  assert.notEqual(classifyLeaf({ label: 'load-and-validate' }), LEAF_TYPES.EXPLORATION);
});

test('classifyLeaf: unknown / missing label defaults to implementation (deep, no downgrade)', () => {
  assert.equal(classifyLeaf({ label: 'preflight' }), LEAF_TYPES.IMPLEMENTATION);
  assert.equal(classifyLeaf({ label: 'map-criteria' }), LEAF_TYPES.IMPLEMENTATION);
  assert.equal(classifyLeaf({ label: 'xyzzy' }), LEAF_TYPES.IMPLEMENTATION);
  assert.equal(classifyLeaf({}), LEAF_TYPES.IMPLEMENTATION);
  assert.equal(classifyLeaf(), LEAF_TYPES.IMPLEMENTATION);
});

test('classifyLeaf: does NOT key off the prompt (prompt noise must not flip the type)', () => {
  // load-story's real prompt contains "Report the story key" — 'report' must
  // NOT pull it to implementation; the label decides.
  const leaf = { label: 'load-story', prompt: 'Read the file. Parse it. Report the story key and build a summary.' };
  assert.equal(classifyLeaf(leaf), LEAF_TYPES.EXPLORATION);
});

// --- tierFor: only exploration is downgraded ------------------------------

test('tierFor: exploration -> cheap, everything else -> deep', () => {
  assert.equal(tierFor(LEAF_TYPES.EXPLORATION), TIERS.CHEAP);
  assert.equal(tierFor(LEAF_TYPES.IMPLEMENTATION), TIERS.DEEP);
  assert.equal(tierFor(LEAF_TYPES.VERIFICATION), TIERS.DEEP);
  assert.equal(tierFor(LEAF_TYPES.ANALYSIS), TIERS.DEEP);
  assert.equal(tierFor('something-unknown'), TIERS.DEEP);
});

// --- modelForLeaf: the value F2 writes into agent() opts ------------------

test('modelForLeaf: exploration leaf -> haiku, protected leaf -> null (omit)', () => {
  assert.equal(modelForLeaf({ label: 'load-story' }), 'haiku');
  assert.equal(modelForLeaf({ label: 'detect-mode' }), 'haiku');
  assert.equal(modelForLeaf({ label: 'verify-cycle-1' }), null);
  assert.equal(modelForLeaf({ label: 'rgr-cycle-1' }), null);
  assert.equal(modelForLeaf({ label: 'preflight' }), null);
});

// --- linter helpers -------------------------------------------------------

test('isKnownTierModel: only the concrete tier models are known', () => {
  assert.equal(isKnownTierModel('haiku'), true);
  assert.equal(isKnownTierModel('sonnet'), true);
  assert.equal(isKnownTierModel('opus'), false); // never pin up
  assert.equal(isKnownTierModel('claude-opus-4-8'), false);
  assert.equal(isKnownTierModel(null), false);
  assert.equal(isKnownTierModel(''), false);
});

test('isDowngradeModel: cheap/balanced are downgrades, deep/omit is not', () => {
  assert.equal(isDowngradeModel('haiku'), true);
  assert.equal(isDowngradeModel('sonnet'), true);
  assert.equal(isDowngradeModel(null), false);
  assert.equal(isDowngradeModel('opus'), false);
});

// --- invariants (the anti-downgrade contract) -----------------------------

test('INVARIANT: no protected leaf ever resolves to a downgrade model', () => {
  const protectedLabels = [
    'verify-cycle-1', 'validate-content', 'validate-docs', 'rgr-cycle-2',
    'build-elements', 'write-story', 'risk-and-testability', 'quality-gates',
    'self-check', 'generate-report', 'optimize-save', 'preflight', 'plan-structure',
  ];
  for (const label of protectedLabels) {
    const model = modelForLeaf({ label });
    assert.equal(isDowngradeModel(model), false, `${label} must NOT be downgraded (got ${model})`);
  }
});

test('determinism: same label yields the same tier across calls', () => {
  assert.equal(modelForLeaf({ label: 'load-story' }), modelForLeaf({ label: 'load-story' }));
  assert.equal(classifyLeaf({ label: 'verify-cycle-9' }), classifyLeaf({ label: 'verify-cycle-9' }));
});
