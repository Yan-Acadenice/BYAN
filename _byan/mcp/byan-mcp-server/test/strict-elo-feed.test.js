/**
 * C3 — the strict-complete -> ELO learning-loop feed.
 *
 * A completed strict session that carried an EXPLICIT domain must feed exactly
 * one VALIDATED outcome into the buffer drain-advisory drains; a session with no
 * domain must feed nothing; the domain is the user's explicit input, never an
 * agent guess. These tests exercise the real lib path (lock -> verify x3 ->
 * complete) plus the exact emit composition the server handler performs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lockScope, selfVerify, complete, abort } from '../lib/strict-mode.js';
import { validateForLog, eloOutcomeForStrictComplete } from '../lib/advisory-autofeed.js';
import { appendOutcome, readBuffer } from '../lib/outcome-buffer.js';

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'byan-c3-'));
}

function lockVerifyComplete(root, domain) {
  lockScope({
    scopeText: 'a sufficiently long scope text for the strict session',
    acceptanceCriteria: ['deliverable one'],
    domain,
    projectRoot: root,
  });
  selfVerify({ verdict: 'ok', projectRoot: root });
  selfVerify({ verdict: 'ok', projectRoot: root });
  selfVerify({ verdict: 'ok', projectRoot: root });
  return complete({ projectRoot: root });
}

// Exercises the REAL helper the server byan_strict_complete handler calls — not
// a replica — so a handler-vs-test drift is impossible by construction.
function feed(completeResult, rootDir) {
  const line = eloOutcomeForStrictComplete(completeResult);
  if (!line) return { fed: false, reason: 'no-line' };
  return { fed: appendOutcome(line, { rootDir }), line };
}

function bufferLines(root) {
  const raw = readBuffer({ rootDir: root });
  return raw ? raw.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
}

test('complete with an explicit domain returns it and feeds ONE VALIDATED elo line', () => {
  const root = makeRoot();
  const r = lockVerifyComplete(root, 'security');
  assert.equal(r.domain, 'security', 'complete() surfaces the locked domain');

  feed(r, root);
  const lines = bufferLines(root);
  assert.equal(lines.length, 1, 'exactly one outcome buffered');
  assert.deepEqual(lines[0], { kind: 'elo', domain: 'security', result: 'VALIDATED' });
});

test('complete with NO domain returns empty and feeds nothing', () => {
  const root = makeRoot();
  const r = lockVerifyComplete(root, '');
  assert.equal(r.domain, '', 'no domain -> empty string');

  const res = feed(r, root);
  assert.equal(res.fed, false);
  assert.equal(bufferLines(root).length, 0, 'no outcome buffered without a domain');
});

test('validateForLog drops an empty domain (no guessing)', () => {
  assert.equal(validateForLog({ kind: 'elo', domain: '', result: 'VALIDATED' }), null);
  assert.equal(validateForLog({ kind: 'elo', domain: '   ', result: 'VALIDATED' }), null);
});

test('a non-canonical but EXPLICIT domain still feeds (it is the user input, not a guess)', () => {
  // Honest behavior: there is no canonical-domain whitelist in the MCP server.
  // The anti-garbage guarantee is "explicit-only", not "whitelisted". A typo is
  // the user's explicit input, so it feeds — documented, not hidden.
  const line = validateForLog({ kind: 'elo', domain: 'javascrpt', result: 'VALIDATED' });
  assert.deepEqual(line, { kind: 'elo', domain: 'javascrpt', result: 'VALIDATED' });
});

test('abort does NOT carry a domain, so the complete-only feed never fires on abort', () => {
  const root = makeRoot();
  lockScope({
    scopeText: 'a sufficiently long scope text for the strict session',
    acceptanceCriteria: ['deliverable one'],
    domain: 'security',
    projectRoot: root,
  });
  const r = abort({ reason: 'user decision', projectRoot: root });
  assert.equal(r.domain, undefined, 'abort result has no domain field');
  assert.equal(feed(r, root).fed, false, 'abort -> no feed (fork-3: aborts are often user decisions)');
  assert.equal(bufferLines(root).length, 0);
});
