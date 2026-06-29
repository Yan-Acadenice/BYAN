#!/usr/bin/env node
// PostToolUse hook — mirror the BYAN FD lifecycle onto a Leantime board with no
// agent action. Fires on byan_fd_advance / byan_fd_update; reads the fd-state the
// tool echoed; drives lib/leantime-sync.js (ensure project, create tasks, move
// columns) per the pure decision core lib/leantime-fd-core.js.
//
// Best-effort and bounded by design:
//   - exits 0 in every path (a sync issue does not block the turn; this hook
//     does not use the exit-2 blocking path);
//   - no-ops silently when the tool is not an FD tool, no FD is active, or
//     Leantime is not configured (syncEnabled false);
//   - it never WRITES fd-state.json (state-coupling); it reads the state the tool
//     echoed, with a read-only fd-state.json fallback. The Leantime id map lives
//     in the gitignored .byan-leantime/ sidecar;
//   - a per-call timeout plus a hook wall-clock budget keep a slow Leantime from
//     stalling the turn; a dropped call self-heals on the next phase event
//     (reconcile-from-state, tracked by sidecar.moveFailed).
//
// CJS shell + ESM libs reached via dynamic import() (the drain-advisory.js bridge).

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SIDECAR_DIR = path.join(ROOT, '.byan-leantime');
const MAP_PATH = path.join(SIDECAR_DIR, 'map.json');
const LOG_PATH = path.join(SIDECAR_DIR, 'sync.jsonl');
const FD_STATE_PATH = path.join(ROOT, '_byan-output', 'fd-state.json');
const PER_CALL_MS = 2500; // below the lib default (5000) so the hook bounds each call
const HOOK_BUDGET_MS = 8000; // between-stage advisory, checked at each stage boundary (not a hard ceiling); a move issues 2 RPCs so a late stage can overrun it, though no call hangs (each aborts at PER_CALL_MS)

// Reasons that deserve a one-line breadcrumb (a real wire/host issue, not "off").
const LOUD = new Set(['non_json', 'timeout', 'rpc_error']);
const isLoud = (reason) => typeof reason === 'string' && (LOUD.has(reason) || reason.startsWith('http_'));

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

function emit(additionalContext = '') {
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } }),
  );
  process.exit(0);
}

function readMap() {
  try {
    return JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeMap(map) {
  try {
    fs.mkdirSync(SIDECAR_DIR, { recursive: true });
    const tmp = `${MAP_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(map, null, 2));
    fs.renameSync(tmp, MAP_PATH); // atomic swap so a crash mid-write keeps the old map
  } catch {
    // the sidecar is housekeeping; a write failure must not break the hook
  }
}

function logLine(entry) {
  try {
    fs.mkdirSync(SIDECAR_DIR, { recursive: true });
    fs.appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`);
  } catch {
    // the log is housekeeping; swallow
  }
}

(async () => {
  let payload = {};
  try {
    const raw = await readStdin();
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return emit();
  }

  try {
    const toolName = payload.tool_name || payload.toolName || '';
    const esm = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
    const core = await esm('_byan/mcp/byan-mcp-server/lib/leantime-fd-core.js');
    if (!core.fdToolKind(toolName)) return emit(); // not an FD tool

    // Read state from the tool's echoed result (state-coupling: no fd-state write).
    const resp = payload.tool_response ?? payload.toolResponse ?? payload.response ?? null;
    let state = core.parseFdState(resp);
    if (!state) {
      try {
        state = JSON.parse(fs.readFileSync(FD_STATE_PATH, 'utf8'));
      } catch {
        state = null;
      }
    }
    if (!state || typeof state.phase !== 'string') return emit();

    const lt = await esm('_byan/mcp/byan-mcp-server/lib/leantime-sync.js');
    if (!lt.syncEnabled()) return emit(); // Leantime not configured -> silent no-op

    const fdId = state.fd_id || 'unknown';
    const map = readMap();
    const sidecar = map[fdId] || { tasks: {} };
    sidecar.tasks = sidecar.tasks || {};
    const assignUserConfigured = lt.assignUserId() != null;

    const { intents, column } = core.decideActions({ toolName, state, sidecar, assignUserConfigured });

    if (!intents || !intents.length) {
      if (column && sidecar.lastColumn !== column) {
        sidecar.lastColumn = column;
        map[fdId] = sidecar;
        writeMap(map);
      }
      return emit();
    }

    const opts = { timeoutMs: PER_CALL_MS };
    const deadline = Date.now() + HOOK_BUDGET_MS;
    const timeLeft = () => deadline - Date.now();
    let firstLoud = null;
    let moveFailed = false;

    const record = (event, target, r) => {
      const ok = !!(r && r.ok);
      const synced = !!(r && r.synced);
      logLine({ ts: new Date().toISOString(), fd_id: fdId, phase: state.phase, event, target, ok, synced, reason: (r && r.reason) || null });
      if (!synced && isLoud(r && r.reason) && !firstLoud) firstLoud = r.reason;
    };

    // 1. Ensure the project (sequential — every later call needs the projectId).
    const ensureIntent = intents.find((i) => i.op === 'project_ensure');
    if (ensureIntent && !sidecar.projectId) {
      const r = await lt.ensureProject({ name: ensureIntent.name, slug: ensureIntent.slug, details: ensureIntent.details }, opts);
      record('project_ensure', ensureIntent.name, r);
      if (r.ok && r.id) {
        sidecar.projectId = r.id;
        map[fdId] = sidecar;
        writeMap(map); // persist immediately so a crash cannot re-create the project
      }
    }

    // 2. Make the project visible to the configured human (best-effort).
    if (intents.some((i) => i.op === 'assign_user') && sidecar.projectId && timeLeft() > 0) {
      const r = await lt.assignUserToProject({ projectId: sidecar.projectId }, opts);
      record('assign_user', sidecar.projectId, r);
    }

    // 3. Create tasks (parallel, bounded by the wall-clock budget).
    const createIntents = intents.filter((i) => i.op === 'task_create');
    if (createIntents.length && sidecar.projectId && timeLeft() > 0) {
      const results = await Promise.allSettled(
        createIntents.map((i) =>
          lt
            .createTask(
              {
                projectId: sidecar.projectId,
                headline: i.headline,
                description: i.description,
                priority: i.priority,
                storypoints: i.storypoints,
              },
              opts,
            )
            .then((r) => ({ i, r })),
        ),
      );
      for (const s of results) {
        if (s.status === 'fulfilled') {
          const { i, r } = s.value;
          record('task_create', i.backlogId, r);
          if (r.ok && r.id) sidecar.tasks[i.backlogId] = r.id;
        }
      }
      map[fdId] = sidecar;
      writeMap(map);
    }

    // 4. Move tasks to the current column (parallel, bounded).
    const moveIntents = intents.filter((i) => i.op === 'task_move');
    if (moveIntents.length && sidecar.projectId && timeLeft() > 0) {
      const results = await Promise.allSettled(
        moveIntents.map((i) => {
          const taskId = sidecar.tasks[i.backlogId];
          if (!taskId) return Promise.resolve({ i, r: { ok: false, synced: false, reason: 'no_task_id' } });
          return lt.moveTask({ taskId, projectId: sidecar.projectId, column: i.column }, opts).then((r) => ({ i, r }));
        }),
      );
      for (const s of results) {
        if (s.status === 'fulfilled') {
          const { i, r } = s.value;
          record('task_move', i.backlogId, r);
          if (!(r && r.synced)) moveFailed = true;
        } else {
          moveFailed = true;
        }
      }
    } else if (moveIntents.length) {
      // could not run the moves this fire (budget/no project) -> retry next event
      moveFailed = true;
    }

    if (column) sidecar.lastColumn = column;
    sidecar.moveFailed = moveFailed;
    sidecar.updatedAt = new Date().toISOString();
    map[fdId] = sidecar;
    writeMap(map);

    if (firstLoud) {
      return emit(`Leantime sync: ${firstLoud} on ${state.phase} (board may lag; retried next phase). Check LEANTIME_API_URL / token.`);
    }
    return emit();
  } catch {
    return emit(); // any failure degrades silently — the sync is housekeeping
  }
})();
