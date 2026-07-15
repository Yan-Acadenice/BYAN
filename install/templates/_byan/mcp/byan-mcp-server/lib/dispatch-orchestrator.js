// F4 — the ORCHESTRATOR core: the loop that makes an architect (Claude) and a
// dev (Codex or Claude, per F1) exchange turn by turn through the shared board
// (F3) until the exchange converges, then returns the result. This is the durable,
// unit-testable heart of "launch a workflow and the agents talk to each other".
//
// It runs as full Node (main thread or an MCP worker), NOT inside a sandboxed
// .claude/workflows script — that sandbox has no imports and no filesystem, so it
// could never use F1/F2/F3. A native workflow script can only be a THIN launch
// façade over this core (see docs). The core here owns the routing, the loop, and
// the convergence rule.
//
// Executors are INJECTED so the loop is testable without real agents or Codex:
//   executors.architect(ctx) -> { content, question? }   (always Claude)
//   executors.claude(ctx)    -> { content, question? }   (dev work on Claude)
//   executors.codex(ctx)     -> { content, question?, diff? }  (dev work on Codex)
// The orchestrator picks executors[route.runtime] for the dev turn; the architect
// is always Claude (judgment stays on Claude — the verification red line's sibling).
//
// Pure control flow: no direct I/O beyond the injected board writer/reader, which
// default to F3's fs-backed pair but are overridable in tests.

import { dispatch } from './dispatch-router.js';
import {
  KINDS,
  makeEntry,
  renderForAgent,
  pendingQuestions,
  appendEntry as fsAppend,
  readEntries as fsRead,
} from './dispatch-blackboard.js';

export const ARCHITECT = 'claude-architect';
export const DEV = 'dev';
export const DEFAULT_MAX_ROUNDS = 4;

// A board handle backed by F3's fs sidecar. Tests pass an in-memory one.
export function fsBoard(projectDir, sessionId) {
  return {
    append: (entry) => fsAppend(projectDir, sessionId, entry),
    read: () => fsRead(projectDir, sessionId),
  };
}

// An in-memory board (no I/O) — the default when no projectDir is given, and what
// tests use. Same shape as fsBoard.
export function memoryBoard(seed = []) {
  const entries = seed.map(makeEntry);
  return {
    append: (raw) => { const e = makeEntry(raw); entries.push(e); return e; },
    read: () => entries.slice(),
  };
}

// orchestrateTask — run ONE task to convergence. Returns
//   { route, rounds, entries, status, diffs }
// status: 'converged' (dev produced a result with no open question)
//       | 'max-rounds' (hit the round cap still exchanging)
//       | 'dev-failed' (the dev executor reported a failure -> caller may fall back)
export function orchestrateTask({ task = {}, board, executors = {}, maxRounds = DEFAULT_MAX_ROUNDS } = {}) {
  const route = dispatch({ nature: task.nature, complexity: task.complexity });
  const devExec = executors[route.runtime];
  const architectExec = executors.architect;
  if (typeof devExec !== 'function' || typeof architectExec !== 'function') {
    throw new Error(`orchestrateTask: missing executor for runtime "${route.runtime}" or architect`);
  }

  // Monotonic message counter (NOT per-round): each append gets the next turn, so
  // an architect ANSWER always carries a turn strictly greater than the dev
  // QUESTION it follows — which is what pendingQuestions needs to mark it resolved.
  let turn = 0;
  const post = (from, to, kind, content) => board.append({ turn: turn++, from, to, kind, content: content || '' });

  // The architect opens with the design brief (addressed to dev).
  const opening = architectExec({ task, route, round: 0, transcript: renderForAgent(board.read(), ARCHITECT) });
  post(ARCHITECT, DEV, KINDS.DESIGN, (opening && opening.content) || task.brief || '');

  const diffs = [];
  let status = 'max-rounds';
  for (let round = 1; round <= maxRounds; round++) {
    // Dev turn: reads the board, does the work on its routed runtime.
    const devOut = devExec({ task, route, round, transcript: renderForAgent(board.read(), DEV) }) || {};
    if (devOut.ok === false || devOut.failed === true) {
      post(DEV, ARCHITECT, KINDS.NOTE, `dev failed: ${devOut.detail || 'unknown'}`);
      status = 'dev-failed';
      break;
    }
    if (devOut.diff) diffs.push(devOut.diff);
    post(DEV, ARCHITECT, devOut.question ? KINDS.WORK : KINDS.RESULT, devOut.content);
    if (devOut.question) post(DEV, ARCHITECT, KINDS.QUESTION, devOut.question);

    // Converged: dev delivered a result and left no open question.
    if (!pendingQuestions(board.read()).length) { status = 'converged'; break; }

    // Architect answers the open question(s); the higher turn resolves them.
    const archOut = architectExec({ task, route, round, transcript: renderForAgent(board.read(), ARCHITECT) }) || {};
    post(ARCHITECT, DEV, KINDS.ANSWER, archOut.content);
  }

  return { route, messages: board.read().filter((e) => e.turn > 0).length, entries: board.read(), status, diffs };
}

// orchestrate — run a whole task list. Each task gets its own board namespace when
// an fs board factory is supplied; otherwise an in-memory board per task. Returns
// one result per task, in order. Never routes verification to Codex (guaranteed by
// F1's router, re-asserted here as defence in depth).
export function orchestrate({ tasks = [], executors = {}, maxRounds = DEFAULT_MAX_ROUNDS, boardFor } = {}) {
  return (Array.isArray(tasks) ? tasks : []).map((task, i) => {
    const board = typeof boardFor === 'function' ? boardFor(task, i) : memoryBoard();
    const result = orchestrateTask({ task, board, executors, maxRounds });
    if (result.route.runtime === 'codex' && /verif|review|validate|audit/i.test(String(task.nature || ''))) {
      // Should be impossible (router forces Claude), but fail loud if it ever regresses.
      throw new Error(`orchestrate: verification task "${task.id || i}" routed to Codex — red line breached`);
    }
    return { taskId: task.id != null ? task.id : i, ...result };
  });
}
