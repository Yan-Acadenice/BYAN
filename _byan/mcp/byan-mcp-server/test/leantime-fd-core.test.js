import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fdToolKind,
  parseFdState,
  columnForState,
  decideActions,
  priorityToLeantime,
  complexityToStorypoints,
  FD_ADVANCE,
  FD_UPDATE,
} from '../lib/leantime-fd-core.js';

// --- fdToolKind ------------------------------------------------------------

test('fdToolKind recognizes both FD tools, prefixed or bare, else null', () => {
  assert.equal(fdToolKind('mcp__byan__byan_fd_advance'), 'advance');
  assert.equal(fdToolKind('mcp__byan__byan_fd_update'), 'update');
  assert.equal(fdToolKind(FD_ADVANCE), 'advance');
  assert.equal(fdToolKind(FD_UPDATE), 'update');
  assert.equal(fdToolKind('mcp__other__byan_fd_advance'), 'advance'); // endsWith fallback
  assert.equal(fdToolKind('mcp__byan__byan_fd_status'), null);
  assert.equal(fdToolKind('Read'), null);
  assert.equal(fdToolKind(undefined), null);
});

// --- parseFdState ----------------------------------------------------------

test('parseFdState accepts MCP content envelope, raw string, parsed object; rejects junk', () => {
  const state = { phase: 'BUILD', backlog: [] };
  assert.deepEqual(parseFdState({ content: [{ type: 'text', text: JSON.stringify(state) }] }), state);
  assert.deepEqual(parseFdState(JSON.stringify(state)), state);
  assert.deepEqual(parseFdState(state), state);
  assert.equal(parseFdState('not json'), null);
  assert.equal(parseFdState({ content: [{ type: 'text', text: '{bad' }] }), null);
  assert.equal(parseFdState({ no: 'phase' }), null);
  assert.equal(parseFdState(null), null);
});

// --- columnForState --------------------------------------------------------

test('columnForState maps each phase to the SKILL 2.5 column', () => {
  assert.equal(columnForState({ phase: 'DISCOVERY' }), 'todo');
  assert.equal(columnForState({ phase: 'PRUNE' }), 'todo');
  assert.equal(columnForState({ phase: 'DISPATCH' }), 'todo');
  assert.equal(columnForState({ phase: 'BUILD' }), 'doing');
  assert.equal(columnForState({ phase: 'REFACTOR' }), 'blocked');
  assert.equal(columnForState({ phase: 'DOC' }), 'review');
  assert.equal(columnForState({ phase: 'COMPLETED' }), 'done');
  assert.equal(columnForState({ phase: 'ABORTED' }), null);
});

test('columnForState reads the verdict for REVIEW and VALIDATE', () => {
  assert.equal(columnForState({ phase: 'REVIEW', review_findings: [{ status: 'needs-rework' }] }), 'blocked');
  assert.equal(columnForState({ phase: 'REVIEW', review_findings: [{ status: 'ready-for-validate' }] }), 'review');
  assert.equal(columnForState({ phase: 'REVIEW' }), 'doing');
  assert.equal(columnForState({ phase: 'VALIDATE', validate_verdict: { status: 'KO' } }), 'blocked');
  assert.equal(columnForState({ phase: 'VALIDATE', validate_verdict: { status: 'OK' } }), 'review');
  assert.equal(columnForState({ phase: 'VALIDATE' }), 'doing');
});

test('columnForState uses the LAST review finding when several rounds exist', () => {
  const state = {
    phase: 'REVIEW',
    review_findings: [{ status: 'needs-rework' }, { status: 'ready-for-validate' }],
  };
  assert.equal(columnForState(state), 'review');
});

// --- priorityToLeantime ----------------------------------------------------

test('priorityToLeantime maps P1/P2/P3 to 3/2/1 and an unknown to undefined', () => {
  assert.equal(priorityToLeantime('P1'), 3);
  assert.equal(priorityToLeantime('P2'), 2);
  assert.equal(priorityToLeantime('P3'), 1);
  assert.equal(priorityToLeantime('P9'), undefined);
  assert.equal(priorityToLeantime(undefined), undefined);
});

// --- complexityToStorypoints -----------------------------------------------

test('complexityToStorypoints buckets a finite complexity onto the Fibonacci scale', () => {
  assert.equal(complexityToStorypoints({ complexity: 0 }), 2);
  assert.equal(complexityToStorypoints({ complexity: 15 }), 2);
  assert.equal(complexityToStorypoints({ complexity: 16 }), 5);
  assert.equal(complexityToStorypoints({ complexity: 39 }), 5);
  assert.equal(complexityToStorypoints({ complexity: 40 }), 8);
  assert.equal(complexityToStorypoints({ complexity: 69 }), 8);
  assert.equal(complexityToStorypoints({ complexity: 70 }), 13);
  assert.equal(complexityToStorypoints({ complexity: 100 }), 13);
});

test('complexityToStorypoints falls back to priority then to a default, always a number', () => {
  assert.equal(complexityToStorypoints({ priority: 'P1' }), 8);
  assert.equal(complexityToStorypoints({ priority: 'P2' }), 5);
  assert.equal(complexityToStorypoints({ priority: 'P3' }), 3);
  assert.equal(complexityToStorypoints({ priority: 'P9' }), 3); // unknown priority -> default
  assert.equal(complexityToStorypoints({}), 3); // no complexity, no priority -> default
  assert.equal(complexityToStorypoints(undefined), 3); // no item at all -> default
  // a non-finite complexity must not short-circuit the Fibonacci path
  assert.equal(complexityToStorypoints({ complexity: NaN, priority: 'P1' }), 8);
});

// --- decideActions: gating -------------------------------------------------

test('decideActions skips a non-FD tool and a stateless payload', () => {
  assert.equal(decideActions({ toolName: 'Read', state: { phase: 'BUILD' } }).skip, 'not-fd-tool');
  assert.equal(decideActions({ toolName: FD_ADVANCE, state: null }).skip, 'no-state');
  assert.equal(
    decideActions({ toolName: FD_ADVANCE, state: { phase: 'BUILD', project_context: {} } }).skip,
    'no-project-name',
  );
});

test('decideActions falls back to feature_name when project_context.name is absent', () => {
  const state = { phase: 'DISCOVERY', feature_name: 'my-feature', project_context: {}, backlog: [] };
  const { intents } = decideActions({ toolName: FD_ADVANCE, state, sidecar: {} });
  assert.equal(intents.length, 1);
  assert.equal(intents[0].op, 'project_ensure');
  assert.equal(intents[0].name, 'my-feature');
});

// --- decideActions: project_ensure + assign --------------------------------

test('DISCOVERY with an empty sidecar ensures the project (no tasks before DISPATCH)', () => {
  const state = { phase: 'DISCOVERY', fd_id: 'fd1', project_context: { name: 'Demo', slug: 'demo' }, backlog: [] };
  const { intents } = decideActions({ toolName: FD_ADVANCE, state, sidecar: {} });
  assert.equal(intents.length, 1);
  assert.equal(intents[0].op, 'project_ensure');
  assert.equal(intents[0].name, 'Demo');
});

test('assign_user intent rides project_ensure only when configured', () => {
  const state = { phase: 'DISCOVERY', project_context: { name: 'Demo' }, backlog: [] };
  const off = decideActions({ toolName: FD_ADVANCE, state, sidecar: {} });
  assert.ok(!off.intents.some((i) => i.op === 'assign_user'));
  const on = decideActions({ toolName: FD_ADVANCE, state, sidecar: {}, assignUserConfigured: true });
  assert.deepEqual(on.intents.map((i) => i.op), ['project_ensure', 'assign_user']);
});

test('a mapped project is not re-ensured (idempotence)', () => {
  const state = { phase: 'BUILD', project_context: { name: 'Demo' }, backlog: [{ id: 'F1', title: 'x', status: 'building' }] };
  const { intents } = decideActions({ toolName: FD_ADVANCE, state, sidecar: { projectId: 9, tasks: { F1: 100 } } });
  assert.ok(!intents.some((i) => i.op === 'project_ensure'));
});

// --- decideActions: create on DISPATCH onward ------------------------------

test('DISPATCH creates a task per unmapped backlog item in todo, skips skipped items', () => {
  const state = {
    phase: 'DISPATCH',
    project_context: { name: 'Demo' },
    backlog: [
      { id: 'F1', title: 'One', status: 'pending' },
      { id: 'F2', title: 'Two', status: 'pending' },
      { id: 'F3', title: 'Nope', status: 'skipped' },
    ],
  };
  const { intents } = decideActions({ toolName: FD_UPDATE, state, sidecar: { projectId: 9, tasks: {} } });
  const creates = intents.filter((i) => i.op === 'task_create');
  assert.deepEqual(creates.map((i) => i.backlogId), ['F1', 'F2']);
  const moves = intents.filter((i) => i.op === 'task_move');
  assert.ok(moves.every((m) => m.column === 'todo'));
  assert.deepEqual(moves.map((m) => m.backlogId), ['F1', 'F2']);
});

test('DISPATCH task_create carries storypoints + priority + a traceable description', () => {
  const state = {
    phase: 'DISPATCH',
    fd_id: 'fd42',
    project_context: { name: 'Demo' },
    backlog: [{ id: 'F1', title: 'Build the thing', status: 'pending', priority: 'P1', complexity: 50 }],
  };
  const { intents } = decideActions({ toolName: FD_UPDATE, state, sidecar: { projectId: 9, tasks: {} } });
  const create = intents.find((i) => i.op === 'task_create');
  assert.equal(create.backlogId, 'F1');
  assert.equal(create.headline, 'Build the thing');
  assert.equal(create.storypoints, 8); // complexity 50 -> 8 (40..69 bucket)
  assert.equal(create.priority, 3); // P1 -> 3
  assert.equal(create.description, 'BYAN FD fd42 -- Build the thing [complexity:50]');
});

test('task_create OMITS priority for an unknown priority and the complexity tag when absent', () => {
  const state = {
    phase: 'DISPATCH',
    fd_id: 'fd7',
    project_context: { name: 'Demo' },
    backlog: [{ id: 'F1', title: 'No prio', status: 'pending' }],
  };
  const { intents } = decideActions({ toolName: FD_ADVANCE, state, sidecar: { projectId: 9, tasks: {} } });
  const create = intents.find((i) => i.op === 'task_create');
  assert.ok(!('priority' in create)); // unknown priority -> key omitted
  assert.equal(create.storypoints, 3); // no complexity, no priority -> default
  assert.equal(create.description, 'BYAN FD fd7 -- No prio'); // no [complexity:..] tag
});

test('before DISPATCH, backlog items are NOT created (create gated to DISPATCH onward)', () => {
  const state = {
    phase: 'PRUNE',
    project_context: { name: 'Demo' },
    backlog: [{ id: 'F1', title: 'One', status: 'pending' }],
  };
  const { intents } = decideActions({ toolName: FD_UPDATE, state, sidecar: { projectId: 9, tasks: {} } });
  assert.ok(!intents.some((i) => i.op === 'task_create'));
});

test('an already-mapped task is not recreated, only moved (idempotence across REFACTOR loop)', () => {
  const state = {
    phase: 'BUILD',
    project_context: { name: 'Demo' },
    backlog: [{ id: 'F1', title: 'One', status: 'building' }],
  };
  const { intents } = decideActions({ toolName: FD_ADVANCE, state, sidecar: { projectId: 9, tasks: { F1: 100 } } });
  assert.ok(!intents.some((i) => i.op === 'task_create'));
  assert.deepEqual(
    intents.filter((i) => i.op === 'task_move'),
    [{ op: 'task_move', backlogId: 'F1', column: 'doing' }],
  );
});

// --- decideActions: lifecycle moves ----------------------------------------

test('REVIEW needs-rework blocks; VALIDATE OK reviews; VALIDATE KO blocks', () => {
  const base = { project_context: { name: 'Demo' }, backlog: [{ id: 'F1', title: 'x', status: 'building' }] };
  const sidecar = { projectId: 9, tasks: { F1: 100 } };
  const block = decideActions({ toolName: FD_UPDATE, state: { ...base, phase: 'REVIEW', review_findings: [{ status: 'needs-rework' }] }, sidecar });
  assert.equal(block.intents.find((i) => i.op === 'task_move').column, 'blocked');
  const review = decideActions({ toolName: FD_UPDATE, state: { ...base, phase: 'VALIDATE', validate_verdict: { status: 'OK' } }, sidecar });
  assert.equal(review.intents.find((i) => i.op === 'task_move').column, 'review');
  const ko = decideActions({ toolName: FD_UPDATE, state: { ...base, phase: 'VALIDATE', validate_verdict: { status: 'KO' } }, sidecar });
  assert.equal(ko.intents.find((i) => i.op === 'task_move').column, 'blocked');
});

test('COMPLETED sweeps every mapped task to done, including one no longer in the backlog', () => {
  const state = {
    phase: 'COMPLETED',
    project_context: { name: 'Demo' },
    backlog: [{ id: 'F1', title: 'One', status: 'done' }],
  };
  const { intents } = decideActions({
    toolName: FD_ADVANCE,
    state,
    sidecar: { projectId: 9, tasks: { F1: 100, F2: 101 } },
  });
  const moves = intents.filter((i) => i.op === 'task_move');
  assert.ok(moves.every((m) => m.column === 'done'));
  assert.deepEqual(moves.map((m) => m.backlogId).sort(), ['F1', 'F2']);
});

test('ABORTED leaves the board verbatim: no project_ensure, no create, no move', () => {
  const state = {
    phase: 'ABORTED',
    project_context: { name: 'Demo' },
    backlog: [{ id: 'F1', title: 'One', status: 'building' }],
  };
  const { intents } = decideActions({ toolName: FD_ADVANCE, state, sidecar: { projectId: 9, tasks: { F1: 100 } } });
  assert.equal(intents.length, 0);
});

// --- decideActions: bounded moves (anti-RPC-storm + self-heal) -------------

test('no redundant move when the column is unchanged and nothing was created/failed', () => {
  const state = { phase: 'BUILD', project_context: { name: 'Demo' }, backlog: [{ id: 'F1', title: 'x', status: 'building' }] };
  const { intents } = decideActions({
    toolName: FD_ADVANCE,
    state,
    sidecar: { projectId: 9, tasks: { F1: 100 }, lastColumn: 'doing' },
  });
  assert.equal(intents.length, 0);
});

test('a move re-fires when the prior fire left it unsynced (self-heal via moveFailed)', () => {
  const state = { phase: 'BUILD', project_context: { name: 'Demo' }, backlog: [{ id: 'F1', title: 'x', status: 'building' }] };
  const { intents } = decideActions({
    toolName: FD_ADVANCE,
    state,
    sidecar: { projectId: 9, tasks: { F1: 100 }, lastColumn: 'doing', moveFailed: true },
  });
  assert.deepEqual(intents, [{ op: 'task_move', backlogId: 'F1', column: 'doing' }]);
});

test('decideActions returns the current column for the shell to persist as lastColumn', () => {
  const state = { phase: 'BUILD', project_context: { name: 'Demo' }, backlog: [] };
  assert.equal(decideActions({ toolName: FD_ADVANCE, state, sidecar: { projectId: 9 } }).column, 'doing');
});
