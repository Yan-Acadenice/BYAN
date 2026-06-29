// BYAN <-> Leantime sync layer.
//
// Leantime (self-hosted project-management tool) is the authority for the
// projects/tasks that the FD workflow mirrors. This module is the only place
// that talks to the Leantime JSON-RPC API; the FD skill drives it through the
// byan_leantime_* MCP tools, never by importing this file from a workflow.
//
// Best-effort, like lib/strict-sync.js: a missing token/base, an unreachable
// instance, a non-2xx, a JSON-RPC error envelope, or a non-JSON (HTML login)
// body degrades to { ok:false, synced:false, reason } and never throws. A down
// Leantime must not break an FD phase transition.
//
// API shape (Leantime JSON-RPC 2.0):
//   POST <base>/api/jsonrpc  with header  x-api-key: <token>
//   body { jsonrpc:"2.0", id, method:"leantime.rpc.<domain>.<method>", params }
//   Auth is the x-api-key header ONLY — never the byan_/ApiKey/Bearer scheme.
//
// Method names + param wrapping are read from the Leantime master source (L2).
// The single METHODS table below is the one place to correct them once the F0
// live-verify (one real POST with a Personal Access Token) confirms the wire
// format against projets.acadenice.com. Items tagged VERIFY@F0 are the ones the
// recon could not confirm without a live call.

const DEFAULT_TIMEOUT_MS = 5000;
const RPC_PATH = '/api/jsonrpc';

// Canonical FD lifecycle columns. Resolved to per-project Leantime status ids at
// call time via resolveStatusMap (Leantime statuses are configurable per project,
// so a fixed int map would drift). Mirrors lib/kanban.js COLUMNS.
const COLUMNS = ['todo', 'doing', 'blocked', 'review', 'done'];

// Single source of truth for the JSON-RPC method names (L2: Leantime master
// Projects.php / Tickets.php). Correct here after F0 if the live wire differs.
const METHODS = {
  addProject: 'leantime.rpc.projects.addProject',
  getAllProjects: 'leantime.rpc.projects.getAllProjects',
  getUsersAssignedToProject: 'leantime.rpc.projects.getUsersAssignedToProject',
  addTicket: 'leantime.rpc.tickets.addTicket',
  updateTicket: 'leantime.rpc.tickets.updateTicket',
  getTicket: 'leantime.rpc.tickets.getTicket', // VERIFY@F0 (single-ticket getter name)
  getAllTickets: 'leantime.rpc.tickets.getAll',
  getStatusLabels: 'leantime.rpc.tickets.getStatusLabels',
  getAllClients: 'leantime.rpc.clients.getAllClients',
  // F0-confirmed (Leantime 3.7.1 source): the JSON-RPC resolves SERVICE methods
  // only. editUserProjectRelations is keyed by USER and RECONCILES the user's
  // project list (adds the absent, deletes those not passed), so
  // assignUserToProject reads the full list first. getProjectsAssignedToUser is
  // that read.
  editUserProjectRelations: 'leantime.rpc.projects.editUserProjectRelations',
  getProjectsAssignedToUser: 'leantime.rpc.projects.getProjectsAssignedToUser',
};

// Conservative fallback when resolveStatusMap cannot read the project's labels
// (Leantime default seed: 3=new). Confirmed/overridden at F0. Used only as a
// last resort so a status move degrades to a plausible id rather than throwing.
const DEFAULT_STATUS_MAP = {
  todo: 3,
  doing: 1,
  blocked: 4,
  review: 2,
  done: 0,
};

function apiBase() {
  return (process.env.LEANTIME_API_URL || '').replace(/\/+$/, '');
}

function apiToken() {
  return process.env.LEANTIME_API_TOKEN || '';
}

// Leantime authenticates the JSON-RPC API with its own header, NOT an
// Authorization scheme. Reusing the byan_/ApiKey/Bearer switch would send a
// header Leantime ignores -> the call goes through unauthenticated (likely a
// 401, or a fall-through to the HTML login that the non_json guard catches; the
// exact code is confirmed at F0, see VERIFY@F0).
function authHeader(token) {
  if (!token) return {};
  return { 'x-api-key': token };
}

export function syncEnabled({ token = apiToken(), base = apiBase() } = {}) {
  return Boolean(token && base);
}

// Low-level JSON-RPC call. Best-effort, never throws.
// Returns { ok, synced, reason?, data?, status?, error?, hint? }.
export async function rpc(
  method,
  params = {},
  { base = apiBase(), token = apiToken(), fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS, id = 'byan' } = {},
) {
  if (!base) return { ok: false, synced: false, reason: 'no_base' };
  if (!token) return { ok: false, synced: false, reason: 'no_token' };
  if (typeof fetchImpl !== 'function') return { ok: false, synced: false, reason: 'no_fetch' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${base}${RPC_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return { ok: false, synced: false, reason: `http_${res.status}`, status: res.status };
    }

    // Wrong-host guard (the BYAN_API_URL lesson): Leantime serves the HTML app
    // AND the JSON-RPC API on the same domain. A 200 carrying HTML means
    // LEANTIME_API_URL points at the UI, not the API. A parse failure (or a
    // non-object body) is treated as a wrong-host/non-JSON response, never read
    // as an empty result.
    const contentType = (res.headers && typeof res.headers.get === 'function'
      ? (res.headers.get('content-type') || '')
      : '').toLowerCase();
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (data === null || typeof data !== 'object') {
      const hint = contentType.includes('text/html')
        ? 'Expected JSON-RPC, got HTML. LEANTIME_API_URL likely points at the Leantime UI, not the /api/jsonrpc backend.'
        : 'Expected a JSON-RPC envelope.';
      return { ok: false, synced: false, reason: 'non_json', hint };
    }

    // `error` carries the Leantime envelope verbatim for the caller's own logic;
    // a caller logging to a shared file must record `reason` only, never `error`,
    // to keep a server message (which could echo input) out of the log.
    if (data.error) {
      return { ok: false, synced: false, reason: 'rpc_error', error: data.error, status: res.status };
    }
    // Leantime returns { jsonrpc, id, result }. `result` may legitimately be
    // false/0/'' on a failed-but-200 op, so expose it verbatim.
    return { ok: true, synced: true, status: res.status, data: data.result };
  } catch (err) {
    return {
      ok: false,
      synced: false,
      reason: err && err.name === 'AbortError' ? 'timeout' : 'network_error',
      error: err ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

// addProject takes `array $values`; addTicket takes `$values`. The recon read
// the named PHP arg as the params key (params:{values:{...}}). F0 (2026-06-15)
// confirmed live that the server expects params:{values:{...}} for both.
function wrapValues(values) {
  return { values };
}

// Leantime project/ticket ids are positive auto-increment integers. rpc() exposes
// a falsy JSON-RPC result verbatim (a 200 carrying result false/0/'' is a
// failed-but-not-errored op), so a create path must reject a non-positive id
// instead of persisting it back into fd-state as a real id.
function isValidId(v) {
  if (typeof v === 'boolean') return false;
  const n = Number(v);
  if (Number.isFinite(n)) return n > 0;
  return typeof v === 'string' && v.length > 0;
}

// Leantime's addProject / addTicket return the new id wrapped in a
// single-element array (result:[id]) on 3.7.x, confirmed live at F0
// (2026-06-15: addProject -> [69], addTicket -> [770]). Other shapes give a
// scalar id or an { id } object. Normalize all three to the scalar id, so a
// create does not propagate an array (isValidId would accept Number([69])===69)
// and does not mis-read [id].id as undefined.
function firstId(data) {
  if (Array.isArray(data)) return data.length ? data[0] : undefined;
  if (data && typeof data === 'object') return data.id;
  return data;
}

// Idempotent create-or-fetch of a Leantime project from the FD project_context.
// Matches an existing project by exact name first (so re-running an FD or a
// REFACTOR loop does not duplicate). Returns { ok, id, created, synced, reason }.
export async function ensureProject({ name, slug, clientId, details } = {}, opts = {}) {
  const term = name || slug;
  if (!term) return { ok: false, synced: false, reason: 'no_name' };

  const existing = await rpc(METHODS.getAllProjects, {}, opts);
  if (existing.ok && Array.isArray(existing.data)) {
    const hit = existing.data.find((p) => p && (p.name === term || p.name === name || p.name === slug));
    if (hit) return { ok: true, synced: true, id: hit.id, created: false };
  } else if (!existing.ok) {
    // A failed list (not an empty one) means "is it absent?" is unknown. Creating
    // here would mint a duplicate on the next FD re-run that hits the same
    // transient error, breaking the idempotency contract. Surface the failure.
    return { ...existing, created: false };
  }

  const resolvedClientId = clientId != null ? clientId : await resolveClientId(opts);
  const created = await rpc(
    METHODS.addProject,
    wrapValues({ name: term, clientId: resolvedClientId, details: details || `Created by BYAN FD (slug: ${slug || term}).` }),
    opts,
  );
  if (!created.ok) return created;
  const newId = firstId(created.data);
  if (!isValidId(newId)) {
    return { ok: false, synced: false, reason: 'create_rejected', data: created.data };
  }
  return { ok: true, synced: true, id: newId, created: true };
}

// Create one Leantime task from an FD backlog item. Returns the new task id in
// `id` so the caller can store it back into fd-state (idempotency lives in the
// caller: create-only-if the backlog item has no leantime_task_id yet).
export async function createTask(
  { projectId, headline, description, status, priority, storypoints, editorId, tags, type = 'task' } = {},
  opts = {},
) {
  if (!projectId) return { ok: false, synced: false, reason: 'no_project_id' };
  if (!headline) return { ok: false, synced: false, reason: 'no_headline' };

  const values = { projectId, headline, type };
  if (description != null) values.description = description;
  if (status != null) values.status = status;
  if (priority != null) values.priority = priority;
  // storypoints is the presumed Leantime effort field (UNVERIFIED against a live
  // instance); an unknown key is at worst ignored by addTicket, so this is safe.
  if (storypoints != null) values.storypoints = storypoints;
  // Default the assignee to the configured human (LEANTIME_ASSIGN_USER_ID) so an
  // auto-created task shows on a person's board, not only the API service user.
  const resolvedEditor = editorId != null ? editorId : assignUserId();
  if (resolvedEditor != null) values.editorId = resolvedEditor;
  if (tags != null) values.tags = tags;

  const res = await rpc(METHODS.addTicket, wrapValues(values), opts);
  if (!res.ok) return res;
  // addTicket returns the new id wrapped in a single-element array
  // (result:[id], confirmed live at F0); other shapes give a scalar or { id }.
  const id = firstId(res.data);
  // A 200 with a falsy result is a failed-but-not-errored add, not a new id;
  // do not persist it back into fd-state as a real task id.
  if (!isValidId(id)) {
    return { ok: false, synced: false, reason: 'create_rejected', data: res.data };
  }
  return { ok: true, synced: true, id };
}

// Move a task to a lifecycle column. Resolves the column to the project's status
// id, then updates the ticket (Leantime has no dedicated status-change RPC).
export async function moveTask({ taskId, projectId, column, status }, opts = {}) {
  if (!taskId) return { ok: false, synced: false, reason: 'no_task_id' };
  let statusId = status;
  if (statusId == null) {
    if (!COLUMNS.includes(column)) return { ok: false, synced: false, reason: 'bad_column' };
    const map = await resolveStatusMap({ projectId }, opts);
    statusId = map[column];
    // resolveStatusMap leaves a column undefined rather than collapse it onto an
    // id already claimed by another column. Surface that instead of sending an
    // undefined status (which JSON.stringify would silently drop from the body).
    if (statusId == null) return { ok: false, synced: false, reason: 'unresolved_status' };
  }
  return rpc(METHODS.updateTicket, wrapValues({ id: taskId, status: statusId }), opts);
}

// Set the assignee/editor of a task (mirror of byan_kanban_assign).
export async function assignTask({ taskId, editorId }, opts = {}) {
  if (!taskId) return { ok: false, synced: false, reason: 'no_task_id' };
  if (editorId == null) return { ok: false, synced: false, reason: 'no_editor_id' };
  return rpc(METHODS.updateTicket, wrapValues({ id: taskId, editorId }), opts);
}

export async function getTask({ taskId }, opts = {}) {
  if (!taskId) return { ok: false, synced: false, reason: 'no_task_id' };
  return rpc(METHODS.getTicket, { id: taskId }, opts);
}

// List a project's tasks grouped by lifecycle column (mirror of byan_kanban_get).
export async function getBoard({ projectId }, opts = {}) {
  if (!projectId) return { ok: false, synced: false, reason: 'no_project_id' };
  const res = await rpc(METHODS.getAllTickets, { searchCriteria: { currentProject: projectId } }, opts);
  if (!res.ok) return res;
  const tickets = Array.isArray(res.data) ? res.data : [];
  const map = await resolveStatusMap({ projectId }, opts);
  const byStatusId = {};
  // Skip an undefined sid: resolveStatusMap may leave a column unmapped (a
  // would-collide default), and byStatusId[undefined] would coerce to the string
  // key 'undefined', shadowing the 'todo' fallback for a genuinely null-status
  // ticket. Only real status ids become keys.
  for (const [col, sid] of Object.entries(map)) if (sid != null) byStatusId[sid] = col;
  const board = Object.fromEntries(COLUMNS.map((c) => [c, []]));
  for (const t of tickets) {
    const col = byStatusId[t && t.status] || 'todo';
    board[col].push(t);
  }
  return { ok: true, synced: true, data: board };
}

// Build a COLUMN -> Leantime status-id map for a project. Reads the project's
// configured status labels and matches them to the canonical columns by label
// substring; falls back to DEFAULT_STATUS_MAP when the labels cannot be read,
// so a move degrades to a plausible id rather than throwing.
export async function resolveStatusMap({ projectId } = {}, opts = {}) {
  const res = await rpc(METHODS.getStatusLabels, projectId != null ? { projectId } : {}, opts);
  if (!res.ok || !res.data || typeof res.data !== 'object') return { ...DEFAULT_STATUS_MAP };

  // res.data is typically { <statusId>: { name, ... } }. Match by name.
  const entries = Object.entries(res.data);
  // Short, ambiguous needles match on a word boundary so a custom label like
  // 'Renewal' (contains 'new') is not mis-claimed; longer distinctive needles
  // stay plain substrings.
  const WORD_NEEDLES = new Set(['new', 'wip', 'qa']);
  const labelHas = (label, n) => (WORD_NEEDLES.has(n) ? new RegExp(`\\b${n}\\b`).test(label) : label.includes(n));
  const find = (...needles) => {
    for (const [sid, meta] of entries) {
      const label = String((meta && (meta.name || meta.label)) || '').toLowerCase();
      if (needles.some((n) => labelHas(label, n))) return Number(sid);
    }
    return undefined;
  };
  const map = {
    todo: find('todo', 'new', 'backlog', 'to do'),
    doing: find('progress', 'doing', 'wip'),
    blocked: find('block', 'hold'),
    review: find('review', 'qa', 'test'),
    done: find('done', 'closed', 'complete'),
  };
  // Fill any unmatched column from the conservative default, but do not reuse an
  // id already claimed by a real label-matched column: two FD columns collapsing
  // onto one status id would mis-bucket the board and mis-target a move (e.g.
  // review and done both -> 2 when a project defines only 'Done'). A column that
  // would only collide stays undefined; getBoard routes an unmapped status to
  // 'todo' and moveTask surfaces 'unresolved_status'.
  const claimed = new Set(Object.values(map).filter((v) => v != null));
  for (const col of COLUMNS) {
    if (map[col] != null) continue;
    const fallback = DEFAULT_STATUS_MAP[col];
    if (!claimed.has(fallback)) {
      map[col] = fallback;
      claimed.add(fallback);
    }
  }
  return map;
}

// Resolve a clientId for addProject (a project with no client may be orphaned).
// Prefers LEANTIME_CLIENT_ID, else the first client the API returns, else 1.
export async function resolveClientId(opts = {}) {
  const fromEnv = process.env.LEANTIME_CLIENT_ID;
  if (fromEnv) return Number(fromEnv);
  const res = await rpc(METHODS.getAllClients, {}, opts);
  if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
    return res.data[0].id != null ? res.data[0].id : 1;
  }
  return 1;
}

// Resolve a valid editor/assignee id for a project (first assigned user).
export async function resolveEditorId({ projectId } = {}, opts = {}) {
  if (!projectId) return null;
  const res = await rpc(METHODS.getUsersAssignedToProject, { projectId }, opts);
  if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
    return res.data[0].id != null ? res.data[0].id : null;
  }
  return null;
}

// The configured human Leantime user id (LEANTIME_ASSIGN_USER_ID), or null. Used
// to make auto-created projects/tasks visible to a person: an API key creates
// them as a service user, hidden from a human's project selector until related.
export function assignUserId() {
  const v = process.env.LEANTIME_ASSIGN_USER_ID;
  const n = Number(v);
  return v && Number.isFinite(n) && n > 0 ? n : null;
}

// Relate a human user to a project so the project shows in their selector.
//
// SAFETY (F0, Leantime 3.7.1 source): the only RPC-reachable write,
// editUserProjectRelations, is keyed by USER and RECONCILES — it deletes every
// relation NOT in the list it is handed. Passing a bare [projectId] would
// unassign the user from all their other projects. So this reads the user's
// CURRENT projects (projectStatus 'all') and writes the union. FAIL-CLOSED: if
// that read fails, returns empty, or is only partially parseable, it does NOT
// write (a partial list could drop real memberships) and surfaces a reason.
export async function assignUserToProject({ projectId, userId } = {}, opts = {}) {
  const uid = userId != null ? userId : assignUserId();
  if (uid == null) return { ok: false, synced: false, reason: 'no_assign_user' };
  if (!projectId) return { ok: false, synced: false, reason: 'no_project_id' };

  const current = await rpc(METHODS.getProjectsAssignedToUser, { userId: uid, projectStatus: 'all' }, opts);
  if (!current.ok) return { ok: false, synced: false, reason: 'assign_read_failed' };
  const raw = Array.isArray(current.data) ? current.data : [];
  const ids = raw
    .map((p) => (p && p.id != null ? Number(p.id) : null))
    .filter((n) => Number.isFinite(n) && n > 0);
  // Fail-closed on an empty read: "no projects" and a partial/failed read are
  // indistinguishable here, and writing an incomplete list would delete real
  // memberships. A human is in practice already on >= 1 project.
  if (ids.length === 0) return { ok: false, synced: false, reason: 'assign_read_empty' };
  // Fail-closed on a partially-parseable read: if any row did not yield a positive
  // id, the read shape is not trusted. editUserProjectRelations reconciles, so
  // writing the parsed subset would drop the memberships behind the unparsed rows.
  if (ids.length !== raw.length) return { ok: false, synced: false, reason: 'assign_read_partial' };
  if (ids.includes(Number(projectId))) return { ok: true, synced: true, alreadyAssigned: true };

  const res = await rpc(
    METHODS.editUserProjectRelations,
    { id: uid, projects: [...ids, Number(projectId)] },
    opts,
  );
  if (!res.ok) return res;
  return { ok: true, synced: true, assigned: true, userId: uid, projectId: Number(projectId) };
}

export { COLUMNS, METHODS, DEFAULT_STATUS_MAP };
