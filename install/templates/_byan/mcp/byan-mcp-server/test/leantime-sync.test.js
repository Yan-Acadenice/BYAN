import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rpc, syncEnabled, ensureProject, createTask, moveTask, assignTask,
  getTask, getBoard, resolveStatusMap, resolveClientId, resolveEditorId,
  assignUserToProject, assignUserId,
  METHODS, COLUMNS,
} from '../lib/leantime-sync.js';

// Synthetic shape-only token — never a real key (see feedback_no_real_tokens_in_tests).
const TOKEN = 'lt_test_' + '0'.repeat(40);
const BASE = 'https://leantime.example.test';
const ENV = { base: BASE, token: TOKEN };

const jsonHeaders = { get: (k) => (String(k).toLowerCase() === 'content-type' ? 'application/json' : null) };
const htmlHeaders = { get: (k) => (String(k).toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) };

const rpcOk = (result) => ({ ok: true, status: 200, headers: jsonHeaders, json: async () => ({ jsonrpc: '2.0', id: 'byan', result }) });
const rpcErr = () => ({ ok: true, status: 200, headers: jsonHeaders, json: async () => ({ jsonrpc: '2.0', id: 'byan', error: { code: -32601, message: 'Method not found' } }) });
const htmlPage = () => ({ ok: true, status: 200, headers: htmlHeaders, json: async () => { throw new SyntaxError('Unexpected token <'); } });
const http401 = () => ({ ok: false, status: 401, headers: jsonHeaders, json: async () => ({}) });

// Queue-based recording fetch: returns the next response per call, records calls.
function queueFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, method: opts.method, headers: opts.headers, body: opts.body ? JSON.parse(opts.body) : null });
    return queue.length > 1 ? queue.shift() : queue[0];
  };
  return { calls, fetchImpl };
}

test('syncEnabled requires both token and base', () => {
  assert.equal(syncEnabled({ token: '', base: BASE }), false);
  assert.equal(syncEnabled({ token: TOKEN, base: '' }), false);
  assert.equal(syncEnabled({ token: TOKEN, base: BASE }), true);
});

test('rpc degrades without base / token / fetch (never throws)', async () => {
  assert.equal((await rpc('m', {}, { base: '', token: TOKEN })).reason, 'no_base');
  assert.equal((await rpc('m', {}, { base: BASE, token: '' })).reason, 'no_token');
  assert.equal((await rpc('m', {}, { ...ENV, fetchImpl: null })).reason, 'no_fetch');
});

test('rpc sends x-api-key header (NOT Authorization) and a JSON-RPC body', async () => {
  const { calls, fetchImpl } = queueFetch([rpcOk(42)]);
  const r = await rpc(METHODS.addProject, { values: { name: 'X' } }, { ...ENV, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.data, 42);
  const call = calls[0];
  assert.equal(call.url, `${BASE}/api/jsonrpc`);
  assert.equal(call.method, 'POST');
  assert.equal(call.headers['x-api-key'], TOKEN);
  assert.equal(call.headers.Authorization, undefined);
  assert.equal(call.body.jsonrpc, '2.0');
  assert.equal(call.body.method, METHODS.addProject);
  assert.deepEqual(call.body.params, { values: { name: 'X' } });
});

test('rpc maps a non-2xx to http_<status>', async () => {
  const { fetchImpl } = queueFetch([http401()]);
  const r = await rpc('m', {}, { ...ENV, fetchImpl });
  assert.equal(r.synced, false);
  assert.equal(r.reason, 'http_401');
});

test('rpc rejects an HTML 200 as non_json (wrong-host guard)', async () => {
  const { fetchImpl } = queueFetch([htmlPage()]);
  const r = await rpc('m', {}, { ...ENV, fetchImpl });
  assert.equal(r.synced, false);
  assert.equal(r.reason, 'non_json');
  assert.match(r.hint, /UI|HTML/);
});

test('rpc surfaces a JSON-RPC error envelope as rpc_error', async () => {
  const { fetchImpl } = queueFetch([rpcErr()]);
  const r = await rpc('m', {}, { ...ENV, fetchImpl });
  assert.equal(r.synced, false);
  assert.equal(r.reason, 'rpc_error');
  assert.equal(r.error.code, -32601);
});

test('rpc maps an AbortError to timeout (never throws)', async () => {
  const fetchImpl = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
  const r = await rpc('m', {}, { ...ENV, fetchImpl });
  assert.equal(r.synced, false);
  assert.equal(r.reason, 'timeout');
});

test('ensureProject is idempotent: returns the existing project, no addProject call', async () => {
  const { calls, fetchImpl } = queueFetch([rpcOk([{ id: 7, name: 'BYAN Pilot' }])]);
  const r = await ensureProject({ name: 'BYAN Pilot', clientId: 1 }, { ...ENV, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.id, 7);
  assert.equal(r.created, false);
  assert.equal(calls.length, 1); // only getAllProjects, no addProject
  assert.equal(calls[0].body.method, METHODS.getAllProjects);
});

test('ensureProject creates when absent and returns the new id', async () => {
  const { calls, fetchImpl } = queueFetch([rpcOk([{ id: 7, name: 'Other' }]), rpcOk(99)]);
  const r = await ensureProject({ name: 'BYAN Pilot', clientId: 1 }, { ...ENV, fetchImpl });
  assert.equal(r.created, true);
  assert.equal(r.id, 99);
  assert.equal(calls[1].body.method, METHODS.addProject);
  assert.deepEqual(calls[1].body.params.values.name, 'BYAN Pilot');
  assert.equal(calls[1].body.params.values.clientId, 1);
});

test('createTask requires projectId and headline, wraps values, returns id', async () => {
  assert.equal((await createTask({ headline: 'h' }, ENV)).reason, 'no_project_id');
  assert.equal((await createTask({ projectId: 1 }, ENV)).reason, 'no_headline');
  const { calls, fetchImpl } = queueFetch([rpcOk(123)]);
  const r = await createTask({ projectId: 5, headline: 'Build F1', priority: 3 }, { ...ENV, fetchImpl });
  assert.equal(r.id, 123);
  assert.equal(calls[0].body.method, METHODS.addTicket);
  assert.equal(calls[0].body.params.values.projectId, 5);
  assert.equal(calls[0].body.params.values.headline, 'Build F1');
});

test('moveTask resolves a column to a status id then updates the ticket', async () => {
  // 1st call: getStatusLabels ; 2nd call: updateTicket
  const labels = { 11: { name: 'In Progress' }, 12: { name: 'Done' } };
  const { calls, fetchImpl } = queueFetch([rpcOk(labels), rpcOk(true)]);
  const r = await moveTask({ taskId: 50, projectId: 5, column: 'doing' }, { ...ENV, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(calls[1].body.method, METHODS.updateTicket);
  assert.equal(calls[1].body.params.values.id, 50);
  assert.equal(calls[1].body.params.values.status, 11); // matched "In Progress" -> doing
});

test('moveTask rejects an unknown column', async () => {
  const { fetchImpl } = queueFetch([rpcOk({})]);
  const r = await moveTask({ taskId: 50, column: 'nope' }, { ...ENV, fetchImpl });
  assert.equal(r.reason, 'bad_column');
});

test('assignTask updates the ticket editorId', async () => {
  const { calls, fetchImpl } = queueFetch([rpcOk(true)]);
  const r = await assignTask({ taskId: 50, editorId: 15 }, { ...ENV, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(calls[0].body.params.values.editorId, 15);
});

test('COLUMNS mirrors the kanban lifecycle', () => {
  assert.deepEqual(COLUMNS, ['todo', 'doing', 'blocked', 'review', 'done']);
});

// ─── REFACTOR backfill (REVIEW findings) ──────────────────────────────────────

test('getTask requires taskId and reads a ticket by id', async () => {
  assert.equal((await getTask({}, ENV)).reason, 'no_task_id');
  const { calls, fetchImpl } = queueFetch([rpcOk({ id: 50, headline: 'X' })]);
  const r = await getTask({ taskId: 50 }, { ...ENV, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.data.id, 50);
  assert.equal(calls[0].body.method, METHODS.getTicket);
  assert.equal(calls[0].body.params.id, 50);
});

test('getBoard buckets tickets by resolved column and routes an unknown status to todo', async () => {
  const tickets = [{ id: 1, status: 11 }, { id: 2, status: 12 }, { id: 3, status: 999 }];
  const labels = { 11: { name: 'In Progress' }, 12: { name: 'Done' } };
  const { fetchImpl } = queueFetch([rpcOk(tickets), rpcOk(labels)]);
  const r = await getBoard({ projectId: 5 }, { ...ENV, fetchImpl });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.doing.map((t) => t.id), [1]); // status 11 -> In Progress -> doing
  assert.deepEqual(r.data.done.map((t) => t.id), [2]); // status 12 -> Done -> done
  assert.deepEqual(r.data.todo.map((t) => t.id), [3]); // unknown status 999 -> todo fallback
});

test('getBoard requires a projectId', async () => {
  assert.equal((await getBoard({}, ENV)).reason, 'no_project_id');
});

test('resolveClientId prefers LEANTIME_CLIENT_ID, else the first client, else 1', async () => {
  const saved = process.env.LEANTIME_CLIENT_ID;
  try {
    process.env.LEANTIME_CLIENT_ID = '42';
    assert.equal(await resolveClientId(ENV), 42); // env wins, no rpc call needed
    delete process.env.LEANTIME_CLIENT_ID;
    const first = queueFetch([rpcOk([{ id: 9 }, { id: 10 }])]);
    assert.equal(await resolveClientId({ ...ENV, fetchImpl: first.fetchImpl }), 9);
    const none = queueFetch([rpcOk([])]);
    assert.equal(await resolveClientId({ ...ENV, fetchImpl: none.fetchImpl }), 1);
  } finally {
    if (saved === undefined) delete process.env.LEANTIME_CLIENT_ID;
    else process.env.LEANTIME_CLIENT_ID = saved;
  }
});

test('resolveEditorId returns null without a project, else the first assigned user', async () => {
  assert.equal(await resolveEditorId({}, ENV), null);
  const { fetchImpl } = queueFetch([rpcOk([{ id: 15 }, { id: 16 }])]);
  assert.equal(await resolveEditorId({ projectId: 5 }, { ...ENV, fetchImpl }), 15);
});

test('resolveStatusMap does not collapse two columns onto one status id', async () => {
  // Project defines only In Progress + Done. review would default-fill to 2, but
  // 2 is already the real Done id -> review must stay undefined, not shadow done.
  const labels = { 1: { name: 'In Progress' }, 2: { name: 'Done' } };
  const { fetchImpl } = queueFetch([rpcOk(labels)]);
  const map = await resolveStatusMap({ projectId: 5 }, { ...ENV, fetchImpl });
  assert.equal(map.doing, 1);
  assert.equal(map.done, 2);
  assert.equal(map.review, undefined); // would-collide -> left undefined
  assert.equal(map.todo, 3); // default, no collision
  assert.equal(map.blocked, 4); // default, no collision
});

test('resolveStatusMap matches short needles on a word boundary (Renewal is not todo/new)', async () => {
  const labels = { 10: { name: 'Renewal' }, 11: { name: 'In Progress' } };
  const { fetchImpl } = queueFetch([rpcOk(labels)]);
  const map = await resolveStatusMap({ projectId: 5 }, { ...ENV, fetchImpl });
  assert.equal(map.todo, 3); // 'new' did NOT mis-match 'Renewal' (id 10) -> default 3
  assert.notEqual(map.todo, 10);
  assert.equal(map.doing, 11);
});

test('assignTask requires an editorId', async () => {
  assert.equal((await assignTask({ taskId: 50 }, ENV)).reason, 'no_editor_id');
});

test('ensureProject fails closed when getAllProjects degrades (no blind create)', async () => {
  const { calls, fetchImpl } = queueFetch([http401()]);
  const r = await ensureProject({ name: 'BYAN Pilot', clientId: 1 }, { ...ENV, fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.created, false);
  assert.equal(r.reason, 'http_401'); // surfaced from the failed list
  assert.equal(calls.length, 1); // ONLY getAllProjects — no addProject duplicate
});

test('ensureProject rejects a falsy create result instead of returning it as an id', async () => {
  const { fetchImpl } = queueFetch([rpcOk([{ id: 1, name: 'Other' }]), rpcOk(false)]);
  const r = await ensureProject({ name: 'New', clientId: 1 }, { ...ENV, fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'create_rejected');
});

test('createTask rejects a falsy (0) result instead of persisting it as a task id', async () => {
  const { fetchImpl } = queueFetch([rpcOk(0)]);
  const r = await createTask({ projectId: 5, headline: 'X' }, { ...ENV, fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'create_rejected');
});

// F0 live-verify (2026-06-15): Leantime 3.7.x addProject/addTicket return the
// new id wrapped in a single-element array (result:[id]). The id must be
// unwrapped to the scalar, not propagated as [id] nor mis-read as undefined.
test('ensureProject unwraps a single-element array create result (F0 result:[id])', async () => {
  const { fetchImpl } = queueFetch([rpcOk([{ id: 1, name: 'Other' }]), rpcOk([69])]);
  const r = await ensureProject({ name: 'Byan', clientId: 1 }, { ...ENV, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.created, true);
  assert.equal(r.id, 69);
});

test('createTask unwraps a single-element array result (F0 result:[id])', async () => {
  const { fetchImpl } = queueFetch([rpcOk([770])]);
  const r = await createTask({ projectId: 69, headline: 'Tache test BYAN' }, { ...ENV, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.id, 770);
});

test('moveTask surfaces unresolved_status when a column cannot get a unique id', async () => {
  const labels = { 1: { name: 'In Progress' }, 2: { name: 'Done' } };
  const { calls, fetchImpl } = queueFetch([rpcOk(labels)]);
  const r = await moveTask({ taskId: 50, projectId: 5, column: 'review' }, { ...ENV, fetchImpl });
  assert.equal(r.reason, 'unresolved_status');
  assert.equal(calls.length, 1); // resolveStatusMap only — no updateTicket against a bogus status
});

test('getBoard routes a no-status ticket to todo even when a collision leaves a column unmapped', async () => {
  // Project defines only In Progress + Done -> review default-id collides with done
  // and stays undefined in the status map. A ticket with no status must fall to
  // todo, not leak into review via an 'undefined' byStatusId key.
  const tickets = [{ id: 1, status: undefined }, { id: 2, status: 2 }];
  const labels = { 1: { name: 'In Progress' }, 2: { name: 'Done' } };
  const { fetchImpl } = queueFetch([rpcOk(tickets), rpcOk(labels)]);
  const r = await getBoard({ projectId: 5 }, { ...ENV, fetchImpl });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.todo.map((t) => t.id), [1]); // no status -> todo fallback, NOT review
  assert.deepEqual(r.data.review, []); // unmapped review column stays empty
  assert.deepEqual(r.data.done.map((t) => t.id), [2]);
});

// --- F5 assignUserToProject (read-before-write, fail-closed) ----------------

test('assignUserToProject reads the user current projects then writes the UNION (no wipe)', async () => {
  const { calls, fetchImpl } = queueFetch([rpcOk([{ id: 1 }, { id: 2 }, { id: 3 }]), rpcOk(true)]);
  const r = await assignUserToProject({ projectId: 4, userId: 6 }, { ...ENV, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.assigned, true);
  // read first
  assert.equal(calls[0].body.method, METHODS.getProjectsAssignedToUser);
  assert.deepEqual(calls[0].body.params, { userId: 6, projectStatus: 'all' });
  // then write the FULL list incl the existing ids — never a bare [4]
  assert.equal(calls[1].body.method, METHODS.editUserProjectRelations);
  assert.deepEqual(calls[1].body.params, { id: 6, projects: [1, 2, 3, 4] });
});

test('assignUserToProject is FAIL-CLOSED: a failed read does NOT write', async () => {
  const { calls, fetchImpl } = queueFetch([http401()]);
  const r = await assignUserToProject({ projectId: 4, userId: 6 }, { ...ENV, fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'assign_read_failed');
  assert.equal(calls.length, 1); // no editUserProjectRelations write
});

test('assignUserToProject is FAIL-CLOSED: an empty read does NOT write (avoids a wipe)', async () => {
  const { calls, fetchImpl } = queueFetch([rpcOk([])]);
  const r = await assignUserToProject({ projectId: 4, userId: 6 }, { ...ENV, fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'assign_read_empty');
  assert.equal(calls.length, 1);
});

test('assignUserToProject is FAIL-CLOSED: a partially-parseable read does NOT write a truncated set', async () => {
  // A read where a row has no usable id (null) is not trusted: writing the parsed
  // subset would drop the membership behind the unparsed row (reconcile-wipe).
  const { calls, fetchImpl } = queueFetch([rpcOk([{ id: 7 }, { id: null }])]);
  const r = await assignUserToProject({ projectId: 4, userId: 6 }, { ...ENV, fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'assign_read_partial');
  assert.equal(calls.length, 1); // no editUserProjectRelations write
});

test('assignUserToProject surfaces a write failure after computing the correct union', async () => {
  // read ok -> union computed -> the editUserProjectRelations write fails on the wire.
  const { calls, fetchImpl } = queueFetch([rpcOk([{ id: 1 }]), http401()]);
  const r = await assignUserToProject({ projectId: 4, userId: 6 }, { ...ENV, fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'http_401'); // the write failure is surfaced verbatim
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.method, METHODS.editUserProjectRelations);
  assert.deepEqual(calls[1].body.params, { id: 6, projects: [1, 4] }); // union still correct before the wire failed
});

test('assignUserToProject no-ops when the user is already on the project', async () => {
  const { calls, fetchImpl } = queueFetch([rpcOk([{ id: 1 }, { id: 4 }])]);
  const r = await assignUserToProject({ projectId: 4, userId: 6 }, { ...ENV, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.alreadyAssigned, true);
  assert.equal(calls.length, 1); // no write
});

test('assignUserToProject without a user id (no env) surfaces no_assign_user', async () => {
  const r = await assignUserToProject({ projectId: 4 }, ENV);
  assert.equal(r.reason, 'no_assign_user');
});

test('assignUserId reads LEANTIME_ASSIGN_USER_ID (positive int) else null', () => {
  const prev = process.env.LEANTIME_ASSIGN_USER_ID;
  try {
    delete process.env.LEANTIME_ASSIGN_USER_ID;
    assert.equal(assignUserId(), null);
    process.env.LEANTIME_ASSIGN_USER_ID = '6';
    assert.equal(assignUserId(), 6);
    process.env.LEANTIME_ASSIGN_USER_ID = '0';
    assert.equal(assignUserId(), null);
    process.env.LEANTIME_ASSIGN_USER_ID = 'nope';
    assert.equal(assignUserId(), null);
  } finally {
    if (prev === undefined) delete process.env.LEANTIME_ASSIGN_USER_ID;
    else process.env.LEANTIME_ASSIGN_USER_ID = prev;
  }
});

test('createTask defaults editorId to LEANTIME_ASSIGN_USER_ID when none is passed', async () => {
  const prev = process.env.LEANTIME_ASSIGN_USER_ID;
  try {
    process.env.LEANTIME_ASSIGN_USER_ID = '6';
    const { calls, fetchImpl } = queueFetch([rpcOk([42])]);
    const r = await createTask({ projectId: 5, headline: 'Build F1' }, { ...ENV, fetchImpl });
    assert.equal(r.ok, true);
    assert.equal(calls[0].body.params.values.editorId, 6);
  } finally {
    if (prev === undefined) delete process.env.LEANTIME_ASSIGN_USER_ID;
    else process.env.LEANTIME_ASSIGN_USER_ID = prev;
  }
});

test('createTask keeps an explicit editorId over the env default', async () => {
  const prev = process.env.LEANTIME_ASSIGN_USER_ID;
  try {
    process.env.LEANTIME_ASSIGN_USER_ID = '6';
    const { calls, fetchImpl } = queueFetch([rpcOk([42])]);
    await createTask({ projectId: 5, headline: 'x', editorId: 99 }, { ...ENV, fetchImpl });
    assert.equal(calls[0].body.params.values.editorId, 99);
  } finally {
    if (prev === undefined) delete process.env.LEANTIME_ASSIGN_USER_ID;
    else process.env.LEANTIME_ASSIGN_USER_ID = prev;
  }
});
