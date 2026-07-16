import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  FIT_THRESHOLD,
  deburr,
  scoreAgent,
  matchAgents,
  parseCsv,
  rosterFromCsv,
  loadRoster,
} from '../lib/agent-matcher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(__dirname, '..', '..', '..', '_config', 'agent-manifest.csv');

// A small hand roster (subset of the real one) for deterministic scoring tests.
const ROSTER = [
  { name: 'dev', title: 'Developer Agent', role: 'Senior Software Engineer' },
  { name: 'analyst', title: 'Business Analyst', role: 'Strategic Business Analyst + Requirements Expert' },
  { name: 'architect', title: 'Architect', role: 'System Architect + Technical Design Leader' },
  { name: 'quinn', title: 'Test Architect', role: 'QA engineer, coverage' },
];

// --- deburr ---------------------------------------------------------------

test('deburr lowercases and strips French accents', () => {
  assert.equal(deburr('Marché Créé Systéme'), 'marche cree systeme');
  assert.equal(deburr(null), '');
});

// --- scoreAgent -----------------------------------------------------------

test('scoreAgent weights curated keywords x3 above raw text overlap', () => {
  const s = scoreAgent('code un module', { name: 'dev', title: 'Developer', role: '' });
  assert.ok(s.keywordScore >= 2); // "code" + "module"
  assert.ok(s.score >= 6);
  assert.ok(s.hits.includes('code'));
});

// --- matchAgents: fit path ------------------------------------------------

test('a dev task fits the dev agent', () => {
  const r = matchAgents('implemente un endpoint et corrige le bug', ROSTER);
  assert.equal(r.fit, true);
  assert.equal(r.best.name, 'dev');
  assert.equal(r.needsInterview, false);
});

test('an analysis task fits the analyst', () => {
  const r = matchAgents('analyse le marche et les concurrents', ROSTER);
  assert.equal(r.best.name, 'analyst');
  assert.equal(r.fit, true);
});

test('an architecture task fits the architect', () => {
  const r = matchAgents("concois l'architecture du systeme et l'api", ROSTER);
  assert.equal(r.best.name, 'architect');
  assert.equal(r.fit, true);
});

// --- matchAgents: no-fit path (the interview trigger) ---------------------

test('a need with no matching agent yields no-fit -> interview', () => {
  const r = matchAgents('peins une fresque art moderne pour le hall', ROSTER);
  assert.equal(r.fit, false);
  assert.equal(r.needsInterview, true);
  assert.match(r.recommendation, /interview/i);
});

test('the fit verdict respects the threshold', () => {
  // a single weak text overlap stays below FIT_THRESHOLD
  const r = matchAgents('leader', ROSTER, { threshold: FIT_THRESHOLD });
  assert.equal(r.fit, false);
});

test('candidates are ranked desc and capped by limit', () => {
  const r = matchAgents('code et test et architecture', ROSTER, { limit: 2 });
  assert.ok(r.candidates.length <= 2);
  for (let i = 1; i < r.candidates.length; i++) {
    assert.ok(r.candidates[i - 1].score >= r.candidates[i].score);
  }
});

// --- CSV parsing ----------------------------------------------------------

test('parseCsv handles quoted fields with embedded commas and escaped quotes', () => {
  const rows = parseCsv('name,role\n"dev","code, test, ship"\n"q","say ""hi"" now"');
  assert.deepEqual(rows[1], ['dev', 'code, test, ship']);
  assert.deepEqual(rows[2], ['q', 'say "hi" now']);
});

test('rosterFromCsv maps the header columns', () => {
  const roster = rosterFromCsv('name,displayName,title,role\n"dev","Amelia","Developer","Engineer"');
  assert.deepEqual(roster[0], { name: 'dev', displayName: 'Amelia', title: 'Developer', role: 'Engineer' });
});

// --- loader on the real manifest ------------------------------------------

test('loadRoster reads the real agent-manifest and finds core agents', () => {
  const roster = loadRoster(MANIFEST);
  assert.ok(roster.length >= 10, `expected a populated roster, got ${roster.length}`);
  const names = roster.map((a) => a.name);
  for (const core of ['dev', 'analyst', 'architect']) {
    assert.ok(names.includes(core), `roster should include ${core}`);
  }
});

test('loadRoster on a missing file returns [] (no throw)', () => {
  assert.deepEqual(loadRoster('/nope/does-not-exist.csv'), []);
});

test('end-to-end: a real-manifest match routes a dev task to dev', () => {
  const roster = loadRoster(MANIFEST);
  const r = matchAgents('code une nouvelle fonction et corrige un bug', roster);
  assert.equal(r.fit, true);
  assert.equal(r.best.name, 'dev');
});
