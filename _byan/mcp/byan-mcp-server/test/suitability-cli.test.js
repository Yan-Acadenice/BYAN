import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReport } from '../bin/byan-suitability.js';
import { rating } from '../lib/suitability.js';

// The advisory surface is a thin presenter over already-tested functions. These
// tests pin only what the surface itself owns: the advisory framing, the empty
// state, and that it never collapses a rating to a bare percentage.

function row(successes, failures, leafId) {
  let l = {};
  const k = `haiku::${leafId}`;
  l[k] = { model: 'haiku', leafId, successes, failures };
  return rating(l, { model: 'haiku', leafId });
}

test('empty ledger renders the empty-state, not a fake table', () => {
  const out = renderReport([], { ledger: '/x/suitability-ledger.json' });
  assert.match(out, /No outcomes recorded yet/);
  assert.doesNotMatch(out, /->/); // no rating arrows when there is nothing
});

test('populated ledger lists rows and frames them as advisory only', () => {
  const rows = [row(5, 15, 'bad'), row(30, 0, 'safe')];
  const out = renderReport(rows, { ledger: '/x/suitability-ledger.json' });
  assert.match(out, /advisory only/i);
  assert.match(out, /Advisory only — this does not change routing/);
  assert.match(out, /n=20/); // the bad leaf's sample size is surfaced
  assert.match(out, /n=30/);
  assert.match(out, /lower/i); // never a bare percentage
});

test('json mode emits a machine-readable advisory payload', () => {
  const rows = [row(30, 0, 'safe')];
  const out = renderReport(rows, { ledger: '/x/l.json', json: true });
  const parsed = JSON.parse(out);
  assert.equal(parsed.advisory, true);
  assert.equal(parsed.ledger, '/x/l.json');
  assert.equal(parsed.rows.length, 1);
  assert.equal(typeof parsed.rows[0].lower, 'number');
  assert.equal(typeof parsed.rows[0].n, 'number');
});
