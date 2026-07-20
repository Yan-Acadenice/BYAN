import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RUNTIMES,
  CODEX_MODEL,
  EFFORTS,
  FORBIDDEN_MODELS,
  assertNoFable,
  isVerification,
  routeRuntime,
  complexityBucket,
  effortForComplexity,
  claudeModelForComplexity,
  dispatch,
} from '../lib/dispatch-router.js';

// --- vocabulary -----------------------------------------------------------

test('RUNTIMES / EFFORTS are the frozen two/three-value vocabularies', () => {
  assert.deepEqual({ ...RUNTIMES }, { CODEX: 'codex', CLAUDE: 'claude' });
  assert.deepEqual({ ...EFFORTS }, { LOW: 'low', MEDIUM: 'medium', HIGH: 'high' });
  assert.ok(Object.isFrozen(RUNTIMES));
  assert.ok(Object.isFrozen(EFFORTS));
});

// --- red line #1 (v3): Fable on Codex never; on Claude only at the extreme rung -

test('assertNoFable throws on any Fable id (Codex guard), passes anything else through', () => {
  for (const f of FORBIDDEN_MODELS) {
    assert.throws(() => assertNoFable(f), /forbidden model/);
  }
  assert.throws(() => assertNoFable('claude-fable-5'), /forbidden model/);
  assert.equal(assertNoFable('sonnet'), 'sonnet');
  assert.equal(assertNoFable('gpt-5.4'), 'gpt-5.4');
});

test('dispatch never emits Fable on the CODEX side, on any complexity', () => {
  const codexNatures = ['execution', 'deploy', 'shell', 'scripting', 'devops'];
  const complexities = [0, 33, 34, 66, 67, 100, 'low', 'high', 'extreme', undefined];
  for (const nature of codexNatures) {
    for (const complexity of complexities) {
      const d = dispatch({ nature, complexity });
      assert.equal(d.runtime, RUNTIMES.CODEX, `${nature} should route to Codex`);
      assert.doesNotMatch(String(d.model).toLowerCase(), /fable/, `${nature}/${complexity} leaked Fable on Codex`);
    }
  }
});

test('dispatch emits Fable on the CLAUDE side ONLY at extreme complexity (last resort)', () => {
  assert.equal(dispatch({ nature: 'architecture', complexity: 95 }).model, 'fable');
  assert.equal(dispatch({ nature: 'analysis', complexity: 'extreme' }).model, 'fable');
  for (const complexity of [0, 33, 34, 66, 67, 89, 'low', 'high', 'trivial', undefined]) {
    const d = dispatch({ nature: 'architecture', complexity });
    assert.notEqual(d.model, 'fable', `complexity ${complexity} should not reach Fable`);
  }
});

// --- red line #2: verification never on Codex -----------------------------

test('isVerification catches the verification family', () => {
  for (const n of ['verification', 'verify', 'validate', 'review', 'audit', 'qa', 'check']) {
    assert.equal(isVerification(n), true, `${n} should be verification`);
  }
  assert.equal(isVerification('execution'), false);
});

test('a verification nature ALWAYS routes to Claude, even mixed with execution words', () => {
  assert.equal(routeRuntime('verification'), RUNTIMES.CLAUDE);
  assert.equal(routeRuntime('review'), RUNTIMES.CLAUDE);
  // a nature that looks like both run AND verify: the verification red line wins.
  assert.equal(routeRuntime('run-and-verify'), RUNTIMES.CLAUDE);
  const d = dispatch({ nature: 'verify', complexity: 100 });
  assert.equal(d.runtime, RUNTIMES.CLAUDE);
});

// --- runtime routing ------------------------------------------------------

test('Codex natures route to Codex', () => {
  for (const n of ['execution', 'shell', 'terminal', 'deploy', 'devops', 'ci', 'scripting', 'browser', 'automation']) {
    assert.equal(routeRuntime(n), RUNTIMES.CODEX, `${n} should route to Codex`);
  }
});

test('Claude natures + unknown default to Claude', () => {
  for (const n of ['architecture', 'design', 'refactor', 'quality', 'planning', 'analysis', 'exploration', 'wat', '']) {
    assert.equal(routeRuntime(n), RUNTIMES.CLAUDE, `${n} should route to Claude`);
  }
});

// --- complexity -> effort / model -----------------------------------------

test('complexityBucket maps numbers and labels, unknown -> medium', () => {
  assert.equal(complexityBucket(0), EFFORTS.LOW);
  assert.equal(complexityBucket(33), EFFORTS.LOW);
  assert.equal(complexityBucket(34), EFFORTS.MEDIUM);
  assert.equal(complexityBucket(66), EFFORTS.MEDIUM);
  assert.equal(complexityBucket(67), EFFORTS.HIGH);
  assert.equal(complexityBucket(100), EFFORTS.HIGH);
  assert.equal(complexityBucket('trivial'), EFFORTS.LOW);
  assert.equal(complexityBucket('hard'), EFFORTS.HIGH);
  assert.equal(complexityBucket('???'), EFFORTS.MEDIUM);
  assert.equal(complexityBucket(undefined), EFFORTS.MEDIUM);
});

test('claudeModelForComplexity: four-rung ladder haiku->sonnet->opus->fable', () => {
  // numeric
  assert.equal(claudeModelForComplexity(10), 'haiku');
  assert.equal(claudeModelForComplexity(33), 'haiku');
  assert.equal(claudeModelForComplexity(34), 'sonnet');
  assert.equal(claudeModelForComplexity(50), 'sonnet');
  assert.equal(claudeModelForComplexity(66), 'sonnet');
  assert.equal(claudeModelForComplexity(67), 'opus');
  assert.equal(claudeModelForComplexity(89), 'opus');
  assert.equal(claudeModelForComplexity(90), 'fable'); // extreme -> last resort
  assert.equal(claudeModelForComplexity(100), 'fable');
  // labels
  assert.equal(claudeModelForComplexity('low'), 'haiku');
  assert.equal(claudeModelForComplexity('medium'), 'sonnet');
  assert.equal(claudeModelForComplexity('high'), 'opus');
  assert.equal(claudeModelForComplexity('extreme'), 'fable');
  assert.equal(claudeModelForComplexity('???'), 'sonnet'); // unknown -> safe middle
});

test('effortForComplexity mirrors the bucket (Codex effort knob)', () => {
  assert.equal(effortForComplexity(10), EFFORTS.LOW);
  assert.equal(effortForComplexity(50), EFFORTS.MEDIUM);
  assert.equal(effortForComplexity(90), EFFORTS.HIGH);
});

// --- dispatch: the full decision ------------------------------------------

test('dispatch to Codex: fixed model, effort scaled, no Claude effort field leak', () => {
  const d = dispatch({ nature: 'deploy', complexity: 80 });
  assert.equal(d.runtime, RUNTIMES.CODEX);
  assert.equal(d.model, CODEX_MODEL);
  assert.equal(d.effort, EFFORTS.HIGH);
  assert.ok(d.reasoning.includes('Codex'));
});

test('dispatch to Claude: model scaled to complexity, effort is null (tier IS the effort)', () => {
  const simple = dispatch({ nature: 'exploration', complexity: 5 });
  assert.equal(simple.runtime, RUNTIMES.CLAUDE);
  assert.equal(simple.model, 'haiku');
  assert.equal(simple.effort, null);

  const high = dispatch({ nature: 'architecture', complexity: 75 });
  assert.equal(high.runtime, RUNTIMES.CLAUDE);
  assert.equal(high.model, 'opus'); // high -> opus (default frontier)
  assert.equal(high.effort, null);

  const extreme = dispatch({ nature: 'architecture', complexity: 95 });
  assert.equal(extreme.runtime, RUNTIMES.CLAUDE);
  assert.equal(extreme.model, 'fable'); // extreme -> fable, last resort
  assert.equal(extreme.effort, null);
});

test('dispatch is deterministic', () => {
  const a = dispatch({ nature: 'shell', complexity: 50 });
  const b = dispatch({ nature: 'shell', complexity: 50 });
  assert.deepEqual(a, b);
});
