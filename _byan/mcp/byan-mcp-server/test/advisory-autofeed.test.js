import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOutcomes,
  planDrain,
  classifyOutcome,
  validateForLog,
} from '../lib/advisory-autofeed.js';

// ── parseOutcomes ────────────────────────────────────────────────────────────

test('parseOutcomes: empty string -> []', () => {
  assert.deepEqual(parseOutcomes(''), []);
});

test('parseOutcomes: null/undefined -> []', () => {
  assert.deepEqual(parseOutcomes(null), []);
  assert.deepEqual(parseOutcomes(undefined), []);
});

test('parseOutcomes: single valid elo line', () => {
  const line = JSON.stringify({ kind: 'elo', domain: 'security', result: 'VALIDATED' });
  assert.deepEqual(parseOutcomes(line), [{ kind: 'elo', domain: 'security', result: 'VALIDATED' }]);
});

test('parseOutcomes: single valid suitability line', () => {
  const line = JSON.stringify({ kind: 'suitability', model: 'haiku', leafId: 'leaf1', success: true });
  assert.deepEqual(parseOutcomes(line), [
    { kind: 'suitability', model: 'haiku', leafId: 'leaf1', success: true },
  ]);
});

test('parseOutcomes: multiple valid lines', () => {
  const lines = [
    JSON.stringify({ kind: 'elo', domain: 'javascript', result: 'BLOCKED' }),
    JSON.stringify({ kind: 'suitability', model: 'sonnet', leafId: 'leaf2', success: false }),
  ].join('\n');
  const result = parseOutcomes(lines);
  assert.equal(result.length, 2);
  assert.equal(result[0].kind, 'elo');
  assert.equal(result[1].kind, 'suitability');
});

test('parseOutcomes: skips malformed JSON lines', () => {
  const lines = [
    'not-json',
    JSON.stringify({ kind: 'elo', domain: 'python', result: 'VALIDATED' }),
    '{broken',
  ].join('\n');
  const result = parseOutcomes(lines);
  assert.equal(result.length, 1);
  assert.equal(result[0].domain, 'python');
});

test('parseOutcomes: skips blank lines', () => {
  const lines = [
    '',
    JSON.stringify({ kind: 'elo', domain: 'rust', result: 'BLOCKED' }),
    '   ',
  ].join('\n');
  const result = parseOutcomes(lines);
  assert.equal(result.length, 1);
});

test('parseOutcomes: all malformed -> []', () => {
  assert.deepEqual(parseOutcomes('garbage\n{also garbage\nnot valid'), []);
});

// ── planDrain ────────────────────────────────────────────────────────────────

test('planDrain: cursor=0, outcomes non-empty -> all pending', () => {
  const outcomes = [
    { kind: 'elo', domain: 'security', result: 'VALIDATED' },
    { kind: 'suitability', model: 'haiku', leafId: 'x', success: true },
  ];
  const { pending, newCursor } = planDrain(outcomes, 0);
  assert.deepEqual(pending, outcomes);
  assert.equal(newCursor, 2);
});

test('planDrain: cursor at end -> empty pending (idempotency)', () => {
  const outcomes = [{ kind: 'elo', domain: 'js', result: 'BLOCKED' }];
  const { pending, newCursor } = planDrain(outcomes, 1);
  assert.deepEqual(pending, []);
  assert.equal(newCursor, 1);
});

test('planDrain: cursor > length clamps to end -> empty pending', () => {
  const outcomes = [{ kind: 'elo', domain: 'js', result: 'BLOCKED' }];
  const { pending, newCursor } = planDrain(outcomes, 99);
  assert.deepEqual(pending, []);
  assert.equal(newCursor, 1);
});

test('planDrain: cursor=0 on empty outcomes -> empty pending', () => {
  const { pending, newCursor } = planDrain([], 0);
  assert.deepEqual(pending, []);
  assert.equal(newCursor, 0);
});

test('planDrain: default cursor=0', () => {
  const outcomes = [{ kind: 'elo', domain: 'go', result: 'VALIDATED' }];
  const { pending } = planDrain(outcomes);
  assert.equal(pending.length, 1);
});

test('planDrain: negative cursor treated as 0', () => {
  const outcomes = [
    { kind: 'elo', domain: 'a', result: 'VALIDATED' },
    { kind: 'elo', domain: 'b', result: 'BLOCKED' },
  ];
  const { pending, newCursor } = planDrain(outcomes, -5);
  assert.deepEqual(pending, outcomes);
  assert.equal(newCursor, 2);
});

test('planDrain: NaN cursor treated as 0', () => {
  const outcomes = [{ kind: 'elo', domain: 'x', result: 'VALIDATED' }];
  const { pending } = planDrain(outcomes, NaN);
  assert.equal(pending.length, 1);
});

test('planDrain: new lines picked up when cursor saved from previous drain', () => {
  const outcomes = [
    { kind: 'elo', domain: 'security', result: 'VALIDATED' },
    { kind: 'elo', domain: 'performance', result: 'BLOCKED' },
  ];
  // First drain
  const first = planDrain(outcomes, 0);
  assert.equal(first.pending.length, 2);
  // Simulate new line appended
  outcomes.push({ kind: 'elo', domain: 'javascript', result: 'VALIDATED' });
  // Second drain using saved cursor
  const second = planDrain(outcomes, first.newCursor);
  assert.equal(second.pending.length, 1);
  assert.equal(second.pending[0].domain, 'javascript');
  assert.equal(second.newCursor, 3);
});

// ── classifyOutcome ──────────────────────────────────────────────────────────

test('classifyOutcome: valid elo VALIDATED', () => {
  assert.deepEqual(
    classifyOutcome({ kind: 'elo', domain: 'security', result: 'VALIDATED' }),
    { kind: 'elo', domain: 'security', result: 'VALIDATED' },
  );
});

test('classifyOutcome: valid elo BLOCKED', () => {
  assert.deepEqual(
    classifyOutcome({ kind: 'elo', domain: 'performance', result: 'BLOCKED' }),
    { kind: 'elo', domain: 'performance', result: 'BLOCKED' },
  );
});

test('classifyOutcome: PARTIAL normalized to PARTIALLY_VALID', () => {
  assert.deepEqual(
    classifyOutcome({ kind: 'elo', domain: 'javascript', result: 'PARTIAL' }),
    { kind: 'elo', domain: 'javascript', result: 'PARTIALLY_VALID' },
  );
});

test('classifyOutcome: valid elo PARTIALLY_VALID passthrough', () => {
  assert.deepEqual(
    classifyOutcome({ kind: 'elo', domain: 'typescript', result: 'PARTIALLY_VALID' }),
    { kind: 'elo', domain: 'typescript', result: 'PARTIALLY_VALID' },
  );
});

test('classifyOutcome: elo domain gets trimmed', () => {
  const r = classifyOutcome({ kind: 'elo', domain: '  rust  ', result: 'VALIDATED' });
  assert.equal(r.domain, 'rust');
});

test('classifyOutcome: elo with unknown result -> null', () => {
  assert.equal(classifyOutcome({ kind: 'elo', domain: 'security', result: 'MAYBE' }), null);
});

test('classifyOutcome: elo with empty domain -> null', () => {
  assert.equal(classifyOutcome({ kind: 'elo', domain: '', result: 'VALIDATED' }), null);
});

test('classifyOutcome: elo with non-string domain -> null', () => {
  assert.equal(classifyOutcome({ kind: 'elo', domain: 42, result: 'VALIDATED' }), null);
});

test('classifyOutcome: elo missing result -> null', () => {
  assert.equal(classifyOutcome({ kind: 'elo', domain: 'js' }), null);
});

test('classifyOutcome: elo missing domain -> null', () => {
  assert.equal(classifyOutcome({ kind: 'elo', result: 'VALIDATED' }), null);
});

test('classifyOutcome: valid suitability success=true', () => {
  assert.deepEqual(
    classifyOutcome({ kind: 'suitability', model: 'haiku', leafId: 'leaf-1', success: true }),
    { kind: 'suitability', model: 'haiku', leafId: 'leaf-1', success: true },
  );
});

test('classifyOutcome: valid suitability success=false', () => {
  assert.deepEqual(
    classifyOutcome({ kind: 'suitability', model: 'sonnet', leafId: 'leaf-2', success: false }),
    { kind: 'suitability', model: 'sonnet', leafId: 'leaf-2', success: false },
  );
});

test('classifyOutcome: suitability model trimmed', () => {
  const r = classifyOutcome({ kind: 'suitability', model: ' opus ', leafId: 'x', success: true });
  assert.equal(r.model, 'opus');
});

test('classifyOutcome: suitability leafId trimmed', () => {
  const r = classifyOutcome({ kind: 'suitability', model: 'haiku', leafId: ' abc ', success: false });
  assert.equal(r.leafId, 'abc');
});

test('classifyOutcome: suitability with success non-boolean -> null', () => {
  assert.equal(
    classifyOutcome({ kind: 'suitability', model: 'haiku', leafId: 'x', success: 'true' }),
    null,
  );
});

test('classifyOutcome: suitability with success=1 (number) -> null', () => {
  assert.equal(
    classifyOutcome({ kind: 'suitability', model: 'haiku', leafId: 'x', success: 1 }),
    null,
  );
});

test('classifyOutcome: suitability missing model -> null', () => {
  assert.equal(
    classifyOutcome({ kind: 'suitability', leafId: 'x', success: true }),
    null,
  );
});

test('classifyOutcome: suitability empty model -> null', () => {
  assert.equal(
    classifyOutcome({ kind: 'suitability', model: '', leafId: 'x', success: true }),
    null,
  );
});

test('classifyOutcome: suitability missing leafId -> null', () => {
  assert.equal(
    classifyOutcome({ kind: 'suitability', model: 'haiku', success: true }),
    null,
  );
});

test('classifyOutcome: suitability empty leafId -> null', () => {
  assert.equal(
    classifyOutcome({ kind: 'suitability', model: 'haiku', leafId: '', success: true }),
    null,
  );
});

test('classifyOutcome: unknown kind -> null', () => {
  assert.equal(classifyOutcome({ kind: 'unknown', domain: 'x', result: 'VALIDATED' }), null);
});

test('classifyOutcome: null input -> null', () => {
  assert.equal(classifyOutcome(null), null);
});

test('classifyOutcome: non-object input -> null', () => {
  assert.equal(classifyOutcome('string'), null);
  assert.equal(classifyOutcome(42), null);
  assert.equal(classifyOutcome(true), null);
});

test('classifyOutcome: empty object -> null', () => {
  assert.equal(classifyOutcome({}), null);
});

test('classifyOutcome: missing kind -> null', () => {
  assert.equal(classifyOutcome({ domain: 'security', result: 'VALIDATED' }), null);
});

// ── validateForLog ───────────────────────────────────────────────────────────

test('validateForLog: valid elo -> canonical elo object', () => {
  assert.deepEqual(
    validateForLog({ kind: 'elo', domain: 'security', result: 'VALIDATED' }),
    { kind: 'elo', domain: 'security', result: 'VALIDATED' },
  );
});

test('validateForLog: valid elo PARTIAL -> canonical with PARTIALLY_VALID', () => {
  assert.deepEqual(
    validateForLog({ kind: 'elo', domain: 'js', result: 'PARTIAL' }),
    { kind: 'elo', domain: 'js', result: 'PARTIALLY_VALID' },
  );
});

test('validateForLog: valid suitability -> canonical suitability object', () => {
  assert.deepEqual(
    validateForLog({ kind: 'suitability', model: 'haiku', leafId: 'leaf-x', success: false }),
    { kind: 'suitability', model: 'haiku', leafId: 'leaf-x', success: false },
  );
});

test('validateForLog: canonical elo has only kind/domain/result fields', () => {
  const result = validateForLog({ kind: 'elo', domain: 'go', result: 'BLOCKED', extra: 'noise' });
  assert.deepEqual(Object.keys(result).sort(), ['domain', 'kind', 'result']);
});

test('validateForLog: canonical suitability has only kind/model/leafId/success fields', () => {
  const result = validateForLog({
    kind: 'suitability', model: 'opus', leafId: 'y', success: true, junk: 123,
  });
  assert.deepEqual(Object.keys(result).sort(), ['kind', 'leafId', 'model', 'success']);
});

test('validateForLog: invalid elo (bad result) -> null', () => {
  assert.equal(validateForLog({ kind: 'elo', domain: 'x', result: 'WRONG' }), null);
});

test('validateForLog: invalid suitability (success non-boolean) -> null', () => {
  assert.equal(
    validateForLog({ kind: 'suitability', model: 'haiku', leafId: 'x', success: 'yes' }),
    null,
  );
});

test('validateForLog: unknown kind -> null', () => {
  assert.equal(validateForLog({ kind: 'other' }), null);
});

test('validateForLog: null input -> null', () => {
  assert.equal(validateForLog(null), null);
});
