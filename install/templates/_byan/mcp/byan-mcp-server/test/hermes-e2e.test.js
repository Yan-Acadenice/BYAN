import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { dispatch } from '../lib/dispatch.js';

/**
 * E2E orchestration test (logic level).
 *
 * Simulates the Hermes dispatch skill protocol end-to-end without
 * actually spawning a Claude Code subagent (that would require a live
 * Claude Code session). Validates that for a realistic task, the
 * routing table + dispatcher + session artifact produce a coherent
 * execution plan.
 */

const ROUTING_TABLE = [
  { keywords: ['review', 'audit', 'check'], specialist: 'quinn', subagent_type: 'general-purpose' },
  { keywords: ['code', 'implement', 'develop', 'feature'], specialist: 'dev (Amelia)', subagent_type: 'general-purpose' },
  { keywords: ['architecture', 'design'], specialist: 'architect (Winston)', subagent_type: 'general-purpose' },
  { keywords: ['test', 'qa'], specialist: 'tea (Murat)', subagent_type: 'general-purpose' },
];

function pickSpecialist(task) {
  const lower = task.toLowerCase();
  for (const row of ROUTING_TABLE) {
    if (row.keywords.some((k) => lower.includes(k))) {
      return { specialist: row.specialist, subagent_type: row.subagent_type, matched: row.keywords.find((k) => lower.includes(k)) };
    }
  }
  return { specialist: 'general-purpose', subagent_type: 'general-purpose', matched: null };
}

function simulateHermesDispatch(task, { parallelizable = false } = {}) {
  const pick = pickSpecialist(task);
  const strategy = dispatch({ task, parallelizable });
  return {
    task,
    specialist: pick.specialist,
    subagent_type: pick.subagent_type,
    matched_keyword: pick.matched,
    strategy: strategy.route,
    score: strategy.score,
    reasoning: strategy.reasoning,
    parallelizable: strategy.parallelizable,
  };
}

test('E2E: "review the auth module" routes to quinn via review keyword', () => {
  const plan = simulateHermesDispatch('review the auth module of byan_web');
  assert.equal(plan.specialist, 'quinn');
  assert.equal(plan.matched_keyword, 'review');
  assert.ok(plan.strategy);
  assert.ok(plan.score >= 0 && plan.score <= 100);
});

test('E2E: "implement payment feature" routes to dev', () => {
  const plan = simulateHermesDispatch('implement the new payment feature with stripe');
  assert.equal(plan.specialist, 'dev (Amelia)');
});

test('E2E: unmatched task falls back to general-purpose', () => {
  const plan = simulateHermesDispatch('xyz abc def');
  assert.equal(plan.specialist, 'general-purpose');
  assert.equal(plan.matched_keyword, null);
});

test('E2E: parallelizable medium task routes to agent-subagent-worktree', () => {
  const plan = simulateHermesDispatch(
    'review the auth module and write tests, then document findings in detail for the team so they can follow up on the open issues we discovered during the audit',
    { parallelizable: true }
  );
  assert.equal(plan.parallelizable, true);
  assert.ok(plan.score >= 15, `score too low: ${plan.score}`);
  assert.ok(
    ['agent-subagent-worktree', 'main-thread-opus'].includes(plan.strategy),
    `unexpected strategy: ${plan.strategy}`
  );
});

test('E2E: session artifact is written and parseable', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-e2e-'));
  const sessionDir = path.join(tmpRoot, 'party-mode-sessions', 'test');
  fs.mkdirSync(sessionDir, { recursive: true });

  const plan = simulateHermesDispatch('review the auth module', { parallelizable: false });
  const report = {
    session_id: 'e2e-reference-run',
    created_at: new Date().toISOString(),
    plan,
    executed: false,
    note: 'Simulated orchestration plan. Real spawn requires live Claude Code session.',
  };
  const reportPath = path.join(sessionDir, 'hermes-dispatch-plan.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const parsed = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(parsed.plan.specialist, 'quinn');
  assert.equal(parsed.executed, false);

  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
