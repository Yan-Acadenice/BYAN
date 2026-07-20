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
  isUpTierModel,
  UP_TIER_MODELS,
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

test('tierFor: exploration -> cheap, analysis + mechanical -> balanced, verif/impl -> deep', () => {
  assert.equal(tierFor(LEAF_TYPES.EXPLORATION), TIERS.CHEAP);
  assert.equal(tierFor(LEAF_TYPES.MECHANICAL), TIERS.BALANCED);
  assert.equal(tierFor(LEAF_TYPES.ANALYSIS), TIERS.BALANCED); // revived Sonnet tier
  assert.equal(tierFor(LEAF_TYPES.IMPLEMENTATION), TIERS.DEEP);
  assert.equal(tierFor(LEAF_TYPES.VERIFICATION), TIERS.DEEP);
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

test('modelForLeaf: analysis leaf -> sonnet (revived balanced tier)', () => {
  assert.equal(modelForLeaf({ label: 'assess-risk' }), 'sonnet');
  assert.equal(modelForLeaf({ label: 'recommend-backlog' }), 'sonnet');
  assert.equal(modelForLeaf({ label: 'nfr-security' }), 'sonnet');
  assert.equal(modelForLeaf({ label: 'synthesize-verdict' }), 'sonnet'); // synthes keyword
});

test('modelForLeaf: the deep- prefix opts an analysis leaf back to deep (inherit)', () => {
  assert.equal(classifyLeaf({ label: 'deep-assess-architecture' }), LEAF_TYPES.IMPLEMENTATION);
  assert.equal(modelForLeaf({ label: 'deep-assess-architecture' }), null);
  // the un-prefixed twin still rides sonnet
  assert.equal(modelForLeaf({ label: 'assess-architecture' }), 'sonnet');
});

// --- linter helpers -------------------------------------------------------

test('isKnownTierModel: downgrade AND up-tier models are known (v3)', () => {
  assert.equal(isKnownTierModel('haiku'), true);
  assert.equal(isKnownTierModel('sonnet'), true);
  assert.equal(isKnownTierModel('opus'), true);   // up-tier now known (v3)
  assert.equal(isKnownTierModel('fable'), true);  // up-tier last resort
  assert.equal(isKnownTierModel('claude-opus-4-8'), false); // not an alias in the vocab
  assert.equal(isKnownTierModel('gpt-5.4'), false);
  assert.equal(isKnownTierModel(null), false);
  assert.equal(isKnownTierModel(''), false);
});

test('isUpTierModel: opus/fable are up-tiers, everything else is not', () => {
  assert.deepEqual([...UP_TIER_MODELS], ['opus', 'fable']);
  assert.equal(isUpTierModel('opus'), true);
  assert.equal(isUpTierModel('fable'), true);
  assert.equal(isUpTierModel('haiku'), false);
  assert.equal(isUpTierModel('sonnet'), false);
  assert.equal(isUpTierModel(null), false);
});

test('isDowngradeModel: cheap/balanced are downgrades, deep/omit and up-tiers are not', () => {
  assert.equal(isDowngradeModel('haiku'), true);
  assert.equal(isDowngradeModel('sonnet'), true);
  assert.equal(isDowngradeModel(null), false);
  assert.equal(isDowngradeModel('opus'), false);
  assert.equal(isDowngradeModel('fable'), false);
});

// --- invariants (the anti-downgrade contract) -----------------------------

test('INVARIANT: no protected leaf ever resolves to a downgrade model', () => {
  const protectedLabels = [
    'verify-cycle-1', 'validate-content', 'validate-docs', 'rgr-cycle-2',
    'build-elements', 'write-story', 'quality-gates',
    'self-check', 'generate-report', 'optimize-save', 'preflight', 'plan-structure',
  ];
  // NOTE: analysis labels (assess/risk/nfr/recommend/synthes) are NO LONGER in this
  // list — they are the revived downgrade class (balanced/sonnet), covered above.
  for (const label of protectedLabels) {
    const model = modelForLeaf({ label });
    assert.equal(isDowngradeModel(model), false, `${label} must NOT be downgraded (got ${model})`);
  }
});

test('determinism: same label yields the same tier across calls', () => {
  assert.equal(modelForLeaf({ label: 'load-story' }), modelForLeaf({ label: 'load-story' }));
  assert.equal(classifyLeaf({ label: 'verify-cycle-9' }), classifyLeaf({ label: 'verify-cycle-9' }));
});

// --- MECHANICAL: explicit mech- opt-in activates the balanced tier ---------

test('LEAF_TYPES exposes MECHANICAL', () => {
  assert.equal(LEAF_TYPES.MECHANICAL, 'mechanical');
});

test('classifyLeaf: a mech- prefixed label is MECHANICAL (explicit opt-in wins over keywords)', () => {
  // 'mech-validate-json' contains 'validate' (a VERIFICATION keyword) — the
  // explicit mech- prefix must win, that is the whole point of the opt-in.
  assert.equal(classifyLeaf({ label: 'mech-validate-json' }), LEAF_TYPES.MECHANICAL);
  assert.equal(classifyLeaf({ label: 'mech-json-validate' }), LEAF_TYPES.MECHANICAL);
  assert.equal(classifyLeaf({ label: 'mech-syntax-check' }), LEAF_TYPES.MECHANICAL);
  assert.equal(classifyLeaf({ label: 'MECH-schema-check' }), LEAF_TYPES.MECHANICAL);
});

test('classifyLeaf: NO fuzzy mechanical matching — only the mech- prefix opts in', () => {
  // mechanical-sounding labels WITHOUT the prefix keep their protected class.
  assert.equal(classifyLeaf({ label: 'json-validate' }), LEAF_TYPES.VERIFICATION);
  assert.equal(classifyLeaf({ label: 'validate-json' }), LEAF_TYPES.VERIFICATION);
  assert.equal(classifyLeaf({ label: 'syntax-check' }), LEAF_TYPES.VERIFICATION);
  // prefix must be at the START with the hyphen: neither of these opts in.
  assert.notEqual(classifyLeaf({ label: 'validate-mech-json' }), LEAF_TYPES.MECHANICAL);
  assert.notEqual(classifyLeaf({ label: 'mechanics-report' }), LEAF_TYPES.MECHANICAL);
});

test('tierFor: mechanical -> balanced; exploration -> cheap; everything else deep', () => {
  assert.equal(tierFor(LEAF_TYPES.MECHANICAL), TIERS.BALANCED);
  assert.equal(tierFor(LEAF_TYPES.EXPLORATION), TIERS.CHEAP);
  assert.equal(tierFor(LEAF_TYPES.VERIFICATION), TIERS.DEEP);
});

test('modelForLeaf: mech- leaf -> sonnet', () => {
  assert.equal(modelForLeaf({ label: 'mech-validate-json' }), 'sonnet');
  assert.equal(modelForLeaf({ label: 'mech-lint-run' }), 'sonnet');
});

test('INVARIANT holds with MECHANICAL in the vocabulary: protected labels still never downgrade', () => {
  for (const label of ['verify-cycle-1', 'validate-content', 'build-elements']) {
    assert.equal(isDowngradeModel(modelForLeaf({ label })), false, `${label} must stay deep`);
  }
});
