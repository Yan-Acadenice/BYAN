import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCHITECT,
  DEV,
  memoryBoard,
  orchestrateTask,
  orchestrate,
} from '../lib/dispatch-orchestrator.js';

// Executor factory: records which runtime executors were called.
function spyExecutors(overrides = {}) {
  const called = { architect: 0, claude: 0, codex: 0 };
  const base = {
    architect: (ctx) => { called.architect++; return { content: `design r${ctx.round}` }; },
    claude: (ctx) => { called.claude++; return { content: `claude work r${ctx.round}` }; },
    codex: (ctx) => { called.codex++; return { content: `codex work r${ctx.round}`, diff: 'diff --git a b' }; },
  };
  return { executors: { ...base, ...overrides }, called };
}

// --- runtime selection ----------------------------------------------------

test('a Codex-nature task calls the codex dev executor, not claude', () => {
  const { executors, called } = spyExecutors();
  const r = orchestrateTask({ task: { nature: 'deploy', complexity: 50 }, board: memoryBoard(), executors });
  assert.equal(r.route.runtime, 'codex');
  assert.equal(called.codex, 1);
  assert.equal(called.claude, 0);
  assert.equal(r.status, 'converged'); // dev returned a result, no question
});

test('a Claude-nature task calls the claude dev executor', () => {
  const { executors, called } = spyExecutors();
  const r = orchestrateTask({ task: { nature: 'refactor', complexity: 90 }, board: memoryBoard(), executors });
  assert.equal(r.route.runtime, 'claude');
  assert.equal(called.claude, 1);
  assert.equal(called.codex, 0);
});

// --- the exchange loop ----------------------------------------------------

test('architect opens the board with a design addressed to dev', () => {
  const { executors } = spyExecutors();
  const r = orchestrateTask({ task: { nature: 'shell', complexity: 20 }, board: memoryBoard(), executors });
  const opening = r.entries[0];
  assert.equal(opening.from, ARCHITECT);
  assert.equal(opening.to, DEV);
  assert.equal(opening.kind, 'design');
});

test('a dev question triggers an architect answer and another round, then converges', () => {
  let devTurn = 0;
  const codex = () => {
    devTurn++;
    return devTurn === 1
      ? { content: 'started', question: 'which port?' }   // round 1: asks
      : { content: 'done', diff: 'diff --git a b' };       // round 2: resolves
  };
  const { executors, called } = spyExecutors({ codex });
  const r = orchestrateTask({ task: { nature: 'execution', complexity: 40 }, board: memoryBoard(), executors });
  assert.equal(r.status, 'converged');
  assert.equal(called.architect, 2);          // opening + one answer
  assert.ok(r.entries.some((e) => e.kind === 'question'));
  assert.ok(r.entries.some((e) => e.kind === 'answer'));
  assert.deepEqual(r.diffs, ['diff --git a b']);
});

test('status max-rounds when the dev keeps asking without resolving', () => {
  const codex = () => ({ content: 'still stuck', question: 'and now?' });
  const { executors } = spyExecutors({ codex });
  const r = orchestrateTask({ task: { nature: 'execution', complexity: 40 }, board: memoryBoard(), executors, maxRounds: 3 });
  assert.equal(r.status, 'max-rounds');
});

test('status dev-failed when the dev executor reports a failure (caller may fall back)', () => {
  const codex = () => ({ ok: false, detail: 'codex unavailable' });
  const { executors } = spyExecutors({ codex });
  const r = orchestrateTask({ task: { nature: 'deploy', complexity: 50 }, board: memoryBoard(), executors });
  assert.equal(r.status, 'dev-failed');
});

// --- red line re-assertion ------------------------------------------------

test('a verification task never reaches Codex (routed to Claude by F1)', () => {
  const { executors, called } = spyExecutors();
  const r = orchestrateTask({ task: { nature: 'verification', complexity: 80 }, board: memoryBoard(), executors });
  assert.equal(r.route.runtime, 'claude');
  assert.equal(called.codex, 0);
});

// --- whole list -----------------------------------------------------------

test('orchestrate runs a task list and returns one result per task, in order', () => {
  const { executors } = spyExecutors();
  const results = orchestrate({
    tasks: [
      { id: 'A', nature: 'architecture', complexity: 80 },
      { id: 'B', nature: 'shell', complexity: 10 },
    ],
    executors,
  });
  assert.equal(results.length, 2);
  assert.equal(results[0].taskId, 'A');
  assert.equal(results[0].route.runtime, 'claude');
  assert.equal(results[1].taskId, 'B');
  assert.equal(results[1].route.runtime, 'codex');
});
