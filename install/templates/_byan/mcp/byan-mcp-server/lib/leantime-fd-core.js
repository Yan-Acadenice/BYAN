// Pure decision core for the FD -> Leantime auto-sync hook.
//
// WHY a separate pure module: a Claude Code hook is an I/O shell (stdin payload,
// network, disk) that is awkward to unit-test. The risky logic — which Leantime
// calls a phase transition implies, and the idempotence that stops duplicates —
// lives here with ZERO I/O, so every transition is testable as a data
// transform. The shell (.claude/hooks/leantime-fd-sync.js) feeds this the parsed
// fd-state + the sidecar map and executes the returned intents against
// lib/leantime-sync.js.
//
// State-coupling: this module reads fd-state echoed by the MCP tool; it does not
// read or write fd-state.json. The Leantime id mapping is the caller's sidecar.

// The two FD MCP tools whose result carries the post-transition fd-state.
export const FD_ADVANCE = 'byan_fd_advance';
export const FD_UPDATE = 'byan_fd_update';

// Recognize the FD tool regardless of the mcp__<server>__ prefix or snake/camel
// casing; the endsWith fallback keeps it working if the server key is renamed.
export function fdToolKind(toolName) {
  if (typeof toolName !== 'string') return null;
  if (toolName === FD_ADVANCE || toolName.endsWith(`__${FD_ADVANCE}`) || toolName.endsWith(FD_ADVANCE)) {
    return 'advance';
  }
  if (toolName === FD_UPDATE || toolName.endsWith(`__${FD_UPDATE}`) || toolName.endsWith(FD_UPDATE)) {
    return 'update';
  }
  return null;
}

// Parse the fd-state the MCP tool echoed. The byan_fd_* handlers return
// JSON.stringify(state); an MCP tool_response wraps it as
// { content: [{ type:'text', text:'<json>' }] }. Accept that envelope, a raw
// JSON string, or an already-parsed object. Returns the state object, or null
// when the shape is unrecognized (the shell then degrades to a file fallback).
export function parseFdState(toolResponse) {
  if (!toolResponse) return null;
  let candidate = toolResponse;
  if (candidate && typeof candidate === 'object' && Array.isArray(candidate.content)) {
    const textPart = candidate.content.find((p) => p && typeof p.text === 'string');
    if (textPart) candidate = textPart.text;
  }
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (candidate && typeof candidate === 'object' && typeof candidate.phase === 'string') {
    return candidate;
  }
  return null;
}

// FD phase order. Used to gate task creation to DISPATCH-onward (a feature's
// task carries its assigned specialist, set at DISPATCH) and to recognize
// terminal phases.
const PHASE_RANK = {
  DISCOVERY: 0,
  BRAINSTORM: 1,
  PRUNE: 2,
  DISPATCH: 3,
  BUILD: 4,
  REVIEW: 5,
  VALIDATE: 6,
  REFACTOR: 7,
  DOC: 8,
  COMPLETED: 9,
  ABORTED: 9,
};

// Map an FD backlog item's priority (P1/P2/P3) to a Leantime priority int.
// Leantime priority is high=3 .. low=1; an unknown priority yields undefined so
// the caller can OMIT the key (an absent priority must not be forced to a value).
export function priorityToLeantime(priority) {
  switch (priority) {
    case 'P1':
      return 3;
    case 'P2':
      return 2;
    case 'P3':
      return 1;
    default:
      return undefined;
  }
}

// Map an FD backlog item to a Leantime story-points effort estimate. Prefers a
// finite numeric `complexity` (0-100 scale, bucketed onto the Fibonacci scale
// Leantime uses for estimates), and falls back to the coarse priority signal
// when complexity is absent. ALWAYS returns a number so the caller can post a
// non-null estimate on every created task.
export function complexityToStorypoints(item) {
  if (item && Number.isFinite(item.complexity)) {
    const c = item.complexity;
    if (c <= 15) return 2;
    if (c <= 39) return 5;
    if (c <= 69) return 8;
    return 13;
  }
  switch (item && item.priority) {
    case 'P1':
      return 8;
    case 'P2':
      return 5;
    case 'P3':
      return 3;
    default:
      return 3;
  }
}

function lastReviewStatus(state) {
  const arr = Array.isArray(state.review_findings) ? state.review_findings : [];
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    if (arr[i] && typeof arr[i].status === 'string') return arr[i].status;
  }
  return null;
}

// The board column the mapped tasks should reflect for the current fd-state.
// Board-wide (not per-feature): a BYAN FD builds its backlog together, and the
// per-item backlog status is agent-maintained and can lag a phase. Mirrors the
// SKILL section 2.5 fire points. Returns a column name or null (no move).
export function columnForState(state) {
  switch (state.phase) {
    case 'ABORTED':
      return null; // leave the board verbatim: the diagnostic of where it died
    case 'COMPLETED':
      return 'done';
    case 'DOC':
      return 'review'; // validated, awaiting the COMPLETED sweep to done
    case 'BUILD':
      return 'doing';
    case 'REFACTOR':
      return 'blocked';
    case 'VALIDATE': {
      const v = state.validate_verdict;
      if (v && v.status === 'KO') return 'blocked';
      if (v && v.status === 'OK') return 'review';
      return 'doing';
    }
    case 'REVIEW': {
      const last = lastReviewStatus(state);
      if (last === 'needs-rework') return 'blocked';
      if (last === 'ready-for-validate') return 'review';
      return 'doing';
    }
    default:
      // DISCOVERY, BRAINSTORM, PRUNE, DISPATCH
      return 'todo';
  }
}

// Decide the ordered Leantime intents for one hook fire. Reconcile-from-state:
// each fire (re)ensures the project exists, ensures every backlog task exists
// (DISPATCH onward), and drives all mapped tasks to the column the current
// fd-state implies. Idempotence is the sidecar's job — project_ensure/task_create
// are emitted only when the id is absent, so a dropped call last fire is retried
// and a duplicate is not created.
//
//   args: { toolName, state, sidecar, assignUserConfigured }
//   sidecar: { projectId?, tasks?: { <backlogId>: taskId } } for THIS fd_id
//   returns: { skip?: reason, intents: [...] }
//
// Intent ops (the shell maps each to a leantime-sync call):
//   { op:'project_ensure', name, slug, details }
//   { op:'assign_user' }                              // only if configured (shell sequences it after project_ensure)
//   { op:'task_create', backlogId, headline, storypoints, description, priority? }
//   { op:'task_move', backlogId, column }
export function decideActions({ toolName, state, sidecar = {}, assignUserConfigured = false } = {}) {
  const kind = fdToolKind(toolName);
  if (!kind) return { skip: 'not-fd-tool', intents: [] };
  if (!state || typeof state.phase !== 'string') return { skip: 'no-state', intents: [] };

  const projectName =
    (state.project_context && state.project_context.name) || state.feature_name || null;
  if (!projectName) return { skip: 'no-project-name', intents: [] };

  const intents = [];
  const tasks = sidecar.tasks || {};

  // 1. Ensure the project. Emitted only when the sidecar has no projectId yet.
  if (!sidecar.projectId) {
    intents.push({
      op: 'project_ensure',
      name: projectName,
      slug: (state.project_context && state.project_context.slug) || undefined,
      details: `BYAN FD ${state.fd_id || ''} — auto-synced board.`.trim(),
    });
    if (assignUserConfigured) intents.push({ op: 'assign_user' });
  }

  const rank = PHASE_RANK[state.phase] ?? 0;
  const backlog = Array.isArray(state.backlog) ? state.backlog : [];

  // 2. Create a task per backlog item once the FD has reached DISPATCH (the task
  //    then carries the dispatched specialist). Skipped items are not created.
  if (rank >= PHASE_RANK.DISPATCH && state.phase !== 'ABORTED') {
    for (const item of backlog) {
      if (!item || !item.id) continue;
      if (item.status === 'skipped') continue;
      if (!tasks[item.id]) {
        const headline = item.title || item.id;
        // Enrich the create with effort + priority + a traceable description so
        // the board item carries the BYAN signal, not just a bare title.
        const priority = priorityToLeantime(item.priority);
        const hasComplexity = Number.isFinite(item.complexity);
        const description =
          `BYAN FD ${state.fd_id || ''} -- ${headline}`.trim() +
          (hasComplexity ? ` [complexity:${item.complexity}]` : '');
        const intent = {
          op: 'task_create',
          backlogId: item.id,
          headline,
          storypoints: complexityToStorypoints(item),
          description,
        };
        // priority is OMITTED when unknown (do not force an absent priority).
        if (priority !== undefined) intent.priority = priority;
        intents.push(intent);
      }
    }
  }

  // 3. Move every task (already-mapped + just-created) to the column the current
  //    state implies. ABORTED yields no column -> no move. To bound RPC volume
  //    (byan_fd_update fires several times per phase), moves are emitted only when
  //    the target column changed since the last applied fire (sidecar.lastColumn),
  //    OR a task was just created, OR the prior fire left a move unsynced
  //    (sidecar.moveFailed) so a dropped move self-heals on the next event.
  const column = columnForState(state);
  const createdThisFire = intents.some((i) => i.op === 'task_create');
  const moveNeeded = column && (column !== sidecar.lastColumn || createdThisFire || sidecar.moveFailed === true);
  if (moveNeeded) {
    const seen = new Set();
    for (const item of backlog) {
      if (!item || !item.id || item.status === 'skipped') continue;
      // a just-created task is moved in the same fire; an already-mapped one is
      // reconciled to the current column (self-heals a dropped earlier move).
      const willExist = tasks[item.id] || intents.some((i) => i.op === 'task_create' && i.backlogId === item.id);
      if (willExist && !seen.has(item.id)) {
        intents.push({ op: 'task_move', backlogId: item.id, column });
        seen.add(item.id);
      }
    }
    // tasks in the sidecar that are no longer in the backlog still get swept to a
    // terminal column on COMPLETED, so the board does not strand a renamed item.
    if (state.phase === 'COMPLETED') {
      for (const backlogId of Object.keys(tasks)) {
        if (!seen.has(backlogId)) {
          intents.push({ op: 'task_move', backlogId, column });
          seen.add(backlogId);
        }
      }
    }
  }

  // `column` is the current target; the shell persists it as sidecar.lastColumn so
  // the next fire can skip a redundant move sweep.
  return { intents, column };
}
