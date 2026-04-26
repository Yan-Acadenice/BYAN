#!/usr/bin/env node
import fsSync from 'node:fs';
import fsPromises from 'node:fs/promises';
import nodePath from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { dispatch } from './lib/dispatch.js';
import { readSoul, appendSoulMemory } from './lib/soul.js';
import { listSessions, readSessionEvents, searchSessions } from './lib/copilot.js';
import {
  start as fdStart,
  status as fdStatus,
  advance as fdAdvance,
  update as fdUpdate,
  abort as fdAbort,
  ALL_PHASES as FD_PHASES,
} from './lib/fd-state.js';
import {
  requestReview,
  recordVerdict,
  getReview,
  listPending,
  pickReviewer,
} from './lib/peer-review.js';
import {
  createBoard,
  addCard,
  moveCard,
  assignCard,
  getBoard,
  postStandup,
  readStandups,
  detectBlockedStreaks,
  KANBAN_COLUMNS,
} from './lib/kanban.js';
import {
  eloSummary,
  eloContext,
  eloDashboard,
  eloRecord,
  fcCheck,
  fcParse,
} from './lib/cli.js';

const BYAN_API_URL = process.env.BYAN_API_URL || 'http://localhost:3737';
const BYAN_API_TOKEN = process.env.BYAN_API_TOKEN || '';

const authHeaders = () => {
  if (!BYAN_API_TOKEN) return {};
  // byan_web issues API keys prefixed with `byan_` and requires the
  // `ApiKey` scheme. Any other token (JWT, etc.) falls back to Bearer.
  const scheme = BYAN_API_TOKEN.startsWith('byan_') ? 'ApiKey' : 'Bearer';
  return { Authorization: `${scheme} ${BYAN_API_TOKEN}` };
};

function buildQuery(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

function requireToken() {
  if (!BYAN_API_TOKEN) {
    throw new Error('BYAN_API_TOKEN env var is required for this tool.');
  }
}

async function apiRequest(path, options = {}) {
  const url = `${BYAN_API_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders(),
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const isJson = contentType.includes('application/json');
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const err = new Error(`${res.status} ${res.statusText}: ${text}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  // A 200 carrying HTML almost certainly means BYAN_API_URL points at the
  // WebUI host (behind Authentik SSO) instead of the API backend.
  // Never let a non-JSON response through — it used to fall back to
  // `body.data || []` and silently pretend the API was empty.
  if (!isJson) {
    const hint = contentType.includes('text/html')
      ? 'Expected JSON, got HTML. Likely BYAN_API_URL points at the WebUI (byan.<domain>) instead of the API (byan-api.<domain>).'
      : `Expected JSON, got content-type: ${contentType || '(none)'}.`;
    const err = new Error(`${hint} URL=${url}`);
    err.status = res.status;
    err.nonJson = true;
    throw err;
  }
  return body;
}

// Default filters — skip common build/vcs artifacts that pollute payload.
const DEFAULT_SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.next', 'coverage',
  '__pycache__', '.venv', 'venv', '.pytest_cache', '.mypy_cache',
  'target', 'out', '.turbo', '.cache', '.DS_Store',
]);
const DEFAULT_SKIP_FILE_PATTERNS = [
  /\.log$/i, /\.sqlite$/i, /\.sqlite-journal$/i, /\.sqlite-wal$/i,
  /\.lock$/i, /\.pid$/i,
];
// Heuristic: treat as binary if content has NUL byte in first 8KB.
function looksBinary(buf) {
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  for (const b of sample) if (b === 0) return true;
  return false;
}

// Hard limits — match W1's API guards so we fail fast client-side.
const MAX_FILES = 10000;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024; // 100 MB

async function buildFilesPayload(absRoot, opts = {}) {
  const skipDirs = opts.skipDirs || DEFAULT_SKIP_DIRS;
  const skipPatterns = opts.skipPatterns || DEFAULT_SKIP_FILE_PATTERNS;
  const maxFiles = opts.maxFiles || MAX_FILES;
  const maxBytes = opts.maxBytes || MAX_TOTAL_BYTES;

  const stat = await fsPromises.stat(absRoot);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${absRoot}`);
  }

  const files = [];
  let totalBytes = 0;

  async function walk(dir) {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = nodePath.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (skipPatterns.some((re) => re.test(entry.name))) continue;

      const rel = nodePath.relative(absRoot, full).split(nodePath.sep).join('/');
      const buf = await fsPromises.readFile(full);

      totalBytes += buf.length;
      if (files.length + 1 > maxFiles) {
        throw new Error(
          `Too many files (>${maxFiles}). Add to skipDirs or increase maxFiles.`
        );
      }
      if (totalBytes > maxBytes) {
        throw new Error(
          `Total size exceeds ${(maxBytes / 1024 / 1024).toFixed(0)}MB. ` +
          `Prune node_modules/dist/build dirs or increase maxBytes.`
        );
      }

      if (looksBinary(buf)) {
        files.push({ path: rel, content: buf.toString('base64'), encoding: 'base64' });
      } else {
        files.push({ path: rel, content: buf.toString('utf8'), encoding: 'utf8' });
      }
    }
  }

  await walk(absRoot);
  return { files, count: files.length, totalBytes };
}

const tools = [
  {
    name: 'byan_ping',
    description:
      'Healthcheck the byan_web API. Returns status and version. No auth required. Also reports round-trip latency and whether BYAN_API_TOKEN is configured.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'byan_list_projects',
    description:
      'List all BYAN projects stored in byan_web. Returns projects ordered by creation date (most recent first). Requires BYAN_API_TOKEN env var set to a valid JWT.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description:
            'Optional client-side limit (server returns all, truncated here). Default: 50.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'byan_import_project',
    description:
      'Import a local project directory into byan_web. Reads files from the local filesystem (client-side) and uploads them as a payload; works whether byan_web is local or remote. Skips .git, node_modules, dist, build, coverage, *.log, *.sqlite. Limits: 10000 files, 100MB total. Requires auth. If projectId is provided, files attach to that project ; otherwise a new project is created from name (or directory basename).',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the project directory on THIS machine (the MCP client). The API does not need filesystem access to this path.',
        },
        projectId: {
          type: 'string',
          description: 'Existing project id to attach the files to. If absent, a new project is created.',
        },
        name: { type: 'string', description: 'Project name override (used only when projectId is absent).' },
        type: {
          type: 'string',
          enum: ['dev', 'training'],
          description: 'Project type for new project creation. Default: dev. Ignored when projectId is provided.',
        },
        autoCreateNodes: {
          type: 'boolean',
          description: 'When true, auto-create knowledge nodes from file directory structure. Default: false.',
        },
        maxFiles: {
          type: 'number',
          description: 'Override max file count (default 10000).',
        },
        maxBytes: {
          type: 'number',
          description: 'Override max total bytes (default 104857600 = 100MB).',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_dispatch',
    description:
      'BYAN Dispatcher: given a task description and complexity score (0-100), route it to the optimal execution target. Rule-based, no API call. Returns route and reasoning.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Short task description.' },
        complexity: {
          type: 'number',
          description: 'Complexity score 0-100 (optional, will estimate from task length if absent).',
        },
        parallelizable: {
          type: 'boolean',
          description: 'Is the task parallelizable with other tasks?',
        },
      },
      required: ['task'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_soul_read',
    description:
      'Read the BYAN soul/tao/soul-memory files from the current project. No auth. Useful when the agent needs to reference the current soul configuration mid-session without relying solely on the SessionStart hook injection.',
    inputSchema: {
      type: 'object',
      properties: {
        which: {
          type: 'string',
          enum: ['soul', 'tao', 'soul-memory', 'all'],
          description: 'Which file to read. Default: all.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'byan_soul_memory_append',
    description:
      'Append a validated entry to _byan/soul-memory.md. Requires validated=true — the caller must have explicit user confirmation before invoking this tool (per BYAN rule: never write silently to soul-memory).',
    inputSchema: {
      type: 'object',
      properties: {
        entry: { type: 'string', description: 'The entry text (markdown allowed).' },
        validated: {
          type: 'boolean',
          description: 'Must be true. Confirms the entry was validated by the user.',
        },
      },
      required: ['entry', 'validated'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_elo_summary',
    description:
      'ELO trust summary across all technical domains. Wraps `byan-v2-cli elo summary`. No auth. Returns ratings, trends, session counts.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'byan_elo_context',
    description:
      'Challenge-context for a specific domain (returns promptInstructions BYAN should apply when challenging a claim). Wraps `byan-v2-cli elo context <domain>`.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Domain name (security|javascript|performance|...)' },
      },
      required: ['domain'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_elo_record',
    description:
      'Record the outcome of a user claim on a domain. Wraps `byan-v2-cli elo record <domain> <VALIDATED|BLOCKED|PARTIAL>`.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string' },
        result: { type: 'string', enum: ['VALIDATED', 'BLOCKED', 'PARTIAL'] },
        reason: { type: 'string' },
      },
      required: ['domain', 'result'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_fc_check',
    description:
      'Run fact-check on a claim string. Returns assertion type (REASONING|HYPOTHESIS|CLAIM L{n}|FACT), level, score. Wraps `byan-v2-cli fc check <text>`.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Assertion to fact-check.' } },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_fc_parse',
    description:
      'Parse a text for auto-detection patterns (absolutes, superlatives, unsourced best-practice claims). Wraps `byan-v2-cli fc parse <text>`.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_copilot_sessions',
    description:
      'List GitHub Copilot CLI sessions stored locally at ~/.copilot/session-state/. Returns sessionId, start/end time, cwd, branch, agent name, message and tool call counts. Sorted most-recent-first. Use to discover past Copilot CLI conversations for reference or import.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max sessions to return (default 20).' },
        sinceIso: { type: 'string', description: 'ISO timestamp filter — only sessions started after this.' },
        cwdFilter: { type: 'string', description: 'Substring match on session cwd (e.g. "byan_web").' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'byan_copilot_session_events',
    description:
      'Read events of a specific Copilot CLI session (events.jsonl). Optionally filter by event type (user.message, assistant.message, tool.execution_start, etc.). Useful to inspect the flow of a past session.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session UUID from byan_copilot_sessions.' },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter to these event types only.',
        },
        limit: { type: 'number', description: 'Max events (default 200).' },
      },
      required: ['sessionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_fd_start',
    description:
      'Start a new Feature Development (FD) cycle for BYAN. Writes _byan-output/fd-state.json with phase=BRAINSTORM. Rejects if another FD is already in progress (unless force=true).',
    inputSchema: {
      type: 'object',
      properties: {
        featureName: { type: 'string', description: 'Short slug for the feature.' },
        force: { type: 'boolean', description: 'Overwrite an existing in-progress FD.' },
      },
      required: ['featureName'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_fd_status',
    description:
      'Return the current FD state (phase, backlog, dispatch_table, history) or { active: false } if none. Use at the start of a turn to know which phase to be in.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'byan_fd_advance',
    description:
      'Transition the current FD session to another phase. Valid targets : BRAINSTORM | PRUNE | DISPATCH | BUILD | VALIDATE | COMPLETED | ABORTED. Rejects backward moves (except abort).',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          enum: ['BRAINSTORM', 'PRUNE', 'DISPATCH', 'BUILD', 'VALIDATE', 'COMPLETED', 'ABORTED'],
        },
        note: { type: 'string', description: 'Optional gate-crossing rationale.' },
      },
      required: ['to'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_fd_update',
    description:
      'Patch fields on the active FD state. Allowed keys : backlog, dispatch_table, commits, notes, feature_name. Rejects unknown keys.',
    inputSchema: {
      type: 'object',
      properties: {
        patch: { type: 'object', description: 'Partial object of allowed keys.' },
      },
      required: ['patch'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_fd_abort',
    description:
      'Abort the current FD session (phase → ABORTED). Preserves the state file for inspection.',
    inputSchema: {
      type: 'object',
      properties: { reason: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'byan_review_request',
    description:
      'Open a peer review request for a task/commit. Another agent (≠ author) must subsequently call byan_review_verdict. Persists under _byan-output/reviews/<task_id>.json.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Unique id (commit sha or feature id).' },
        author: { type: 'string', description: 'Agent name that produced the artefact.' },
        artifact_paths: { type: 'array', items: { type: 'string' } },
        description: { type: 'string' },
      },
      required: ['task_id', 'author'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_review_verdict',
    description:
      'Record a verdict on an open review request. reviewer must differ from author (enforced). Valid verdicts : approve | changes | block.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        reviewer: { type: 'string' },
        verdict: { type: 'string', enum: ['approve', 'changes', 'block'] },
        comments: { type: 'array', items: { type: 'string' } },
        must_fix: { type: 'array', items: { type: 'string' } },
      },
      required: ['task_id', 'reviewer', 'verdict'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_review_get',
    description: 'Fetch the current state of a review by task_id.',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_review_pending',
    description: 'List all open (pending or changes_requested) reviews, newest first.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'byan_review_pick_reviewer',
    description:
      'Suggest a reviewer distinct from the author. Uses domain pairs (dev↔quinn, architect↔tea, pm↔sm, ux↔pm) then falls back to the roster.',
    inputSchema: {
      type: 'object',
      properties: {
        author: { type: 'string' },
        preferredDomain: { type: 'string' },
      },
      required: ['author'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_kanban_create',
    description:
      'Create (or fetch existing) kanban board for a party-mode session. Columns : todo | doing | blocked | review | done. Persisted under _byan-output/party-mode-sessions/<session_id>/kanban.json.',
    inputSchema: {
      type: 'object',
      properties: { sessionId: { type: 'string' } },
      required: ['sessionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_kanban_add',
    description: 'Add a card to the kanban. card = { id, title, assignee?, priority? (P1|P2|P3), column? }.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        card: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            assignee: { type: 'string' },
            priority: { type: 'string' },
            column: { type: 'string' },
          },
          required: ['id', 'title'],
        },
      },
      required: ['sessionId', 'card'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_kanban_move',
    description:
      'Move a card between columns. toColumn must be one of todo | doing | blocked | review | done. Provide blocker_reason when moving to blocked.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        cardId: { type: 'string' },
        toColumn: { type: 'string', enum: ['todo', 'doing', 'blocked', 'review', 'done'] },
        blocker_reason: { type: 'string' },
      },
      required: ['sessionId', 'cardId', 'toColumn'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_kanban_assign',
    description: 'Assign a card to an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        cardId: { type: 'string' },
        assignee: { type: 'string' },
      },
      required: ['sessionId', 'cardId', 'assignee'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_kanban_get',
    description: 'Fetch the current kanban board for a session.',
    inputSchema: {
      type: 'object',
      properties: { sessionId: { type: 'string' } },
      required: ['sessionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_standup_post',
    description:
      'Append a stand-up entry to _byan-output/party-mode-sessions/<session_id>/standup.jsonl. Format : { agent, did, blockers[], next }.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        agent: { type: 'string' },
        did: { type: 'string' },
        blockers: { type: 'array', items: { type: 'string' } },
        next: { type: 'string' },
      },
      required: ['sessionId', 'agent'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_standup_read',
    description: 'Read the stand-up feed for a session, newest entries last.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['sessionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_standup_blocked',
    description:
      'Return agents with >= minStreak consecutive blocked stand-ups (default minStreak=2). Hermes uses this to trigger redispatch.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        minStreak: { type: 'number' },
      },
      required: ['sessionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_copilot_search',
    description:
      'Full-text search across all Copilot CLI sessions. Finds messages (user + assistant by default) containing the query string. Returns sessionId + timestamp + excerpt. Use to recall past discussions without knowing which session they were in.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Substring to search for (case-insensitive).' },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Event types to scan (default: user.message, assistant.message).',
        },
        limit: { type: 'number', description: 'Max matches (default 50).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },

  // ─── Projects ─────────────────────────────────────────────────────────
  {
    name: 'byan_api_projects_get',
    description:
      'Fetch a single byan_web project by id. GET /api/projects/:id. Requires BYAN_API_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Project id.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_api_projects_create',
    description:
      'Create a new byan_web project. POST /api/projects. Requires BYAN_API_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name.' },
        type: { type: 'string', description: 'Project type (e.g. dev, training).' },
        description: { type: 'string' },
        visibility: { type: 'string', description: 'e.g. private | public | team.' },
        taxonomyType: { type: 'string' },
        seedTaxonomy: { type: 'boolean' },
      },
      required: ['name', 'type'],
      additionalProperties: false,
    },
  },

  // ─── Workflows ────────────────────────────────────────────────────────
  {
    name: 'byan_api_workflows_list',
    description:
      'List workflows, optionally filtered by scope, project, or status. GET /api/workflows. Requires BYAN_API_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'Filter by scope.' },
        projectId: { type: 'string', description: 'Filter by project id.' },
        status: { type: 'string', description: 'Filter by status.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'byan_api_workflows_get',
    description:
      'Fetch a single workflow by id. GET /api/workflows/:id. Requires BYAN_API_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Workflow id.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_api_workflows_run',
    description:
      'Trigger a workflow run. POST /api/workflows/:id/run. Requires BYAN_API_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Workflow id.' },
        trigger: { type: 'object', description: 'Optional trigger payload forwarded to the workflow.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_api_workflow_runs_list',
    description:
      'List runs of a given workflow. GET /api/workflows/:id/runs. Requires BYAN_API_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Workflow id.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_api_workflow_runs_get',
    description:
      'Fetch a single workflow run by runId. GET /api/workflow-runs/:runId. Requires BYAN_API_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: { runId: { type: 'string', description: 'Workflow run id.' } },
      required: ['runId'],
      additionalProperties: false,
    },
  },

  // ─── Knowledge ────────────────────────────────────────────────────────
  {
    name: 'byan_api_knowledge_list',
    description:
      'List knowledge entries, optionally filtered by project, category, tags, or limit. GET /api/knowledge. Requires BYAN_API_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        category: { type: 'string' },
        tags: { type: 'string', description: 'Comma-separated tag list.' },
        limit: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'byan_api_knowledge_get',
    description:
      'Fetch a single knowledge entry by id. GET /api/knowledge/:id. Requires BYAN_API_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Knowledge entry id.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },

  // ─── Memory ───────────────────────────────────────────────────────────
  {
    name: 'byan_api_memory_list',
    description:
      'List memory entries, optionally filtered by project, category, type, or limit. GET /api/memory. Requires BYAN_API_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        category: { type: 'string' },
        type: { type: 'string' },
        limit: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'byan_api_memory_search',
    description:
      'Full-text search across memory entries. GET /api/memory/search. Requires BYAN_API_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: { q: { type: 'string', description: 'Search query.' } },
      required: ['q'],
      additionalProperties: false,
    },
  },

  // ─── Custom Agents ────────────────────────────────────────────────────
  {
    name: 'byan_api_custom_agents_list',
    description:
      'List user custom agents. GET /api/custom-agents. Requires BYAN_API_TOKEN.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'byan_api_custom_agents_get',
    description:
      'Fetch a single custom agent by id. GET /api/custom-agents/:id. Requires BYAN_API_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Custom agent id.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_api_custom_agents_clone_system',
    description:
      'Clone a system agent into the user catalog. POST /api/custom-agents/clone/:systemName. Requires BYAN_API_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: {
        systemName: { type: 'string', description: 'System agent name to clone.' },
      },
      required: ['systemName'],
      additionalProperties: false,
    },
  },

  // ─── Sessions ─────────────────────────────────────────────────────────
  {
    name: 'byan_api_sessions_list',
    description:
      'List byan_web sessions, optionally filtered by project. GET /api/sessions. Requires BYAN_API_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'byan_api_sessions_get',
    description:
      'Fetch a single session by id. GET /api/sessions/:id. Requires BYAN_API_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Session id.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_api_sessions_history',
    description:
      'Fetch the message/event history of a session. GET /api/sessions/:id/history. Requires BYAN_API_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Session id.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },

  // ─── Chat ─────────────────────────────────────────────────────────────
  {
    name: 'byan_api_chat_conversations_list',
    description:
      'List chat conversations for the authenticated user. GET /api/chat/conversations. Requires BYAN_API_TOKEN.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'byan_api_chat_messages_list',
    description:
      'List messages of a chat conversation. GET /api/chat/conversations/:id/messages. Requires BYAN_API_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Conversation id.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_api_chat_send',
    description:
      'Send a message to a chat conversation. POST /api/chat/conversations/:id/messages. Requires BYAN_API_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Conversation id.' },
        content: { type: 'string', description: 'Message content.' },
        role: { type: 'string', description: 'Optional role override (default: user).' },
      },
      required: ['id', 'content'],
      additionalProperties: false,
    },
  },

  // ─── Search ───────────────────────────────────────────────────────────
  {
    name: 'byan_api_search',
    description:
      'Cross-entity search over byan_web. GET /api/search. Requires BYAN_API_TOKEN.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search query.' },
        type: { type: 'string', description: 'Entity type filter.' },
        projectId: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['q'],
      additionalProperties: false,
    },
  },

  // ─── Import ───────────────────────────────────────────────────────────
  {
    name: 'byan_api_import_scan',
    description:
      'Scan a local directory and report what would be imported into byan_web. Reads files from the local filesystem (client-side) and uploads them as a payload; works whether byan_web is local or remote. Skips .git, node_modules, dist, build, coverage, *.log, *.sqlite. Limits: 10000 files, 100MB total. Requires auth.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the directory on THIS machine (the MCP client). The API does not need filesystem access to this path.' },
        maxFiles: { type: 'number', description: 'Override max file count (default 10000).' },
        maxBytes: { type: 'number', description: 'Override max total bytes (default 104857600 = 100MB).' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_api_import_dry_run',
    description:
      'Dry-run an import from a local directory into byan_web (no writes). Reads files from the local filesystem (client-side) and uploads them as a payload; works whether byan_web is local or remote. Skips .git, node_modules, dist, build, coverage, *.log, *.sqlite. Limits: 10000 files, 100MB total. Requires auth.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the directory on THIS machine (the MCP client). The API does not need filesystem access to this path.' },
        maxFiles: { type: 'number', description: 'Override max file count (default 10000).' },
        maxBytes: { type: 'number', description: 'Override max total bytes (default 104857600 = 100MB).' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
];

const server = new Server(
  { name: 'byan-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    if (name === 'byan_ping') {
      const t0 = Date.now();
      const body = await apiRequest('/api/health');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...body,
                latency_ms: Date.now() - t0,
                token_configured: Boolean(BYAN_API_TOKEN),
                api_url: BYAN_API_URL,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === 'byan_list_projects') {
      if (!BYAN_API_TOKEN) {
        throw new Error('BYAN_API_TOKEN env var is required for this tool.');
      }
      const body = await apiRequest('/api/projects');
      const limit = args.limit || 50;
      const projects = (body.data || []).slice(0, limit);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { projects, total: body.total ?? projects.length, returned: projects.length },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === 'byan_import_project') {
      if (!BYAN_API_TOKEN) {
        throw new Error('BYAN_API_TOKEN env var is required for this tool.');
      }
      // Always upload files payload — works for both localhost and remote API.
      // Server contract (post FD api-import-project-files-payload-merge):
      //   { files, projectId? }              -> attach to existing project
      //   { files, projectMeta: { name, type } } -> create new project
      const { files } = await buildFilesPayload(args.path, {
        ...(args.maxFiles ? { maxFiles: args.maxFiles } : {}),
        ...(args.maxBytes ? { maxBytes: args.maxBytes } : {}),
      });
      const payload = { files };
      if (args.projectId) {
        payload.projectId = args.projectId;
      } else if (args.name || args.type) {
        payload.projectMeta = {
          ...(args.name ? { name: args.name } : {}),
          type: args.type || 'dev',
        };
      }
      if (args.autoCreateNodes === true) {
        payload.autoCreateNodes = true;
      }
      const body = await apiRequest('/api/import/project', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(body.data || body, null, 2) }],
      };
    }

    if (name === 'byan_dispatch') {
      const result = dispatch(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    if (name === 'byan_soul_read') {
      const result = readSoul({ which: args.which || 'all' });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    if (name === 'byan_soul_memory_append') {
      const result = appendSoulMemory({
        entry: args.entry,
        validated: args.validated === true,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    if (name === 'byan_elo_summary') {
      const result = await eloSummary();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    if (name === 'byan_elo_context') {
      const result = await eloContext({ domain: args.domain });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    if (name === 'byan_elo_record') {
      const result = await eloRecord({
        domain: args.domain,
        result: args.result,
        reason: args.reason,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    if (name === 'byan_fc_check') {
      const result = await fcCheck({ text: args.text });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    if (name === 'byan_fc_parse') {
      const result = await fcParse({ text: args.text });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    if (name === 'byan_copilot_sessions') {
      const result = listSessions({
        limit: args.limit,
        sinceIso: args.sinceIso,
        cwdFilter: args.cwdFilter,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    if (name === 'byan_copilot_session_events') {
      const result = readSessionEvents({
        sessionId: args.sessionId,
        types: args.types,
        limit: args.limit,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    if (name === 'byan_copilot_search') {
      const result = searchSessions({
        query: args.query,
        types: args.types,
        limit: args.limit,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    if (name === 'byan_fd_start') {
      const state = fdStart({ featureName: args.featureName, force: args.force });
      return { content: [{ type: 'text', text: JSON.stringify(state, null, 2) }] };
    }

    if (name === 'byan_fd_status') {
      const state = fdStatus();
      return { content: [{ type: 'text', text: JSON.stringify(state, null, 2) }] };
    }

    if (name === 'byan_fd_advance') {
      const state = fdAdvance({ to: args.to, note: args.note });
      return { content: [{ type: 'text', text: JSON.stringify(state, null, 2) }] };
    }

    if (name === 'byan_fd_update') {
      const state = fdUpdate({ patch: args.patch });
      return { content: [{ type: 'text', text: JSON.stringify(state, null, 2) }] };
    }

    if (name === 'byan_fd_abort') {
      const state = fdAbort({ reason: args.reason });
      return { content: [{ type: 'text', text: JSON.stringify(state, null, 2) }] };
    }

    if (name === 'byan_review_request') {
      const r = requestReview({
        task_id: args.task_id,
        author: args.author,
        artifact_paths: args.artifact_paths,
        description: args.description,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    }

    if (name === 'byan_review_verdict') {
      const r = recordVerdict({
        task_id: args.task_id,
        reviewer: args.reviewer,
        verdict: args.verdict,
        comments: args.comments,
        must_fix: args.must_fix,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    }

    if (name === 'byan_review_get') {
      const r = getReview({ task_id: args.task_id });
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    }

    if (name === 'byan_review_pending') {
      const r = listPending();
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    }

    if (name === 'byan_review_pick_reviewer') {
      const r = pickReviewer({
        author: args.author,
        preferredDomain: args.preferredDomain,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ reviewer: r }, null, 2) }],
      };
    }

    if (name === 'byan_kanban_create') {
      const r = createBoard({ sessionId: args.sessionId });
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    }
    if (name === 'byan_kanban_add') {
      const r = addCard({ sessionId: args.sessionId, card: args.card });
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    }
    if (name === 'byan_kanban_move') {
      const r = moveCard({
        sessionId: args.sessionId,
        cardId: args.cardId,
        toColumn: args.toColumn,
        blocker_reason: args.blocker_reason,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    }
    if (name === 'byan_kanban_assign') {
      const r = assignCard({
        sessionId: args.sessionId,
        cardId: args.cardId,
        assignee: args.assignee,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    }
    if (name === 'byan_kanban_get') {
      const r = getBoard({ sessionId: args.sessionId });
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    }
    if (name === 'byan_standup_post') {
      const r = postStandup({
        sessionId: args.sessionId,
        agent: args.agent,
        did: args.did,
        blockers: args.blockers,
        next: args.next,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    }
    if (name === 'byan_standup_read') {
      const r = readStandups({ sessionId: args.sessionId, limit: args.limit });
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    }
    if (name === 'byan_standup_blocked') {
      const r = detectBlockedStreaks({
        sessionId: args.sessionId,
        minStreak: args.minStreak,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    }

    // ─── byan_api_* wrappers ────────────────────────────────────────────
    if (name === 'byan_api_projects_get') {
      requireToken();
      const body = await apiRequest(`/api/projects/${encodeURIComponent(args.id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_projects_create') {
      requireToken();
      const payload = {
        name: args.name,
        type: args.type,
        ...(args.description !== undefined ? { description: args.description } : {}),
        ...(args.visibility !== undefined ? { visibility: args.visibility } : {}),
        ...(args.taxonomyType !== undefined ? { taxonomyType: args.taxonomyType } : {}),
        ...(args.seedTaxonomy !== undefined ? { seedTaxonomy: args.seedTaxonomy } : {}),
      };
      const body = await apiRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_workflows_list') {
      requireToken();
      const qs = buildQuery({
        scope: args.scope,
        project_id: args.projectId,
        status: args.status,
      });
      const body = await apiRequest(`/api/workflows${qs}`);
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_workflows_get') {
      requireToken();
      const body = await apiRequest(`/api/workflows/${encodeURIComponent(args.id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_workflows_run') {
      requireToken();
      const payload = args.trigger !== undefined ? { trigger: args.trigger } : {};
      const body = await apiRequest(
        `/api/workflows/${encodeURIComponent(args.id)}/run`,
        { method: 'POST', body: JSON.stringify(payload) }
      );
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_workflow_runs_list') {
      requireToken();
      const body = await apiRequest(
        `/api/workflows/${encodeURIComponent(args.id)}/runs`
      );
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_workflow_runs_get') {
      requireToken();
      const body = await apiRequest(
        `/api/workflow-runs/${encodeURIComponent(args.runId)}`
      );
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_knowledge_list') {
      requireToken();
      const qs = buildQuery({
        project_id: args.projectId,
        category: args.category,
        tags: args.tags,
        limit: args.limit,
      });
      const body = await apiRequest(`/api/knowledge${qs}`);
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_knowledge_get') {
      requireToken();
      const body = await apiRequest(`/api/knowledge/${encodeURIComponent(args.id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_memory_list') {
      requireToken();
      const qs = buildQuery({
        project_id: args.projectId,
        category: args.category,
        type: args.type,
        limit: args.limit,
      });
      const body = await apiRequest(`/api/memory${qs}`);
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_memory_search') {
      requireToken();
      const qs = buildQuery({ q: args.q });
      const body = await apiRequest(`/api/memory/search${qs}`);
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_custom_agents_list') {
      requireToken();
      const body = await apiRequest('/api/custom-agents');
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_custom_agents_get') {
      requireToken();
      const body = await apiRequest(
        `/api/custom-agents/${encodeURIComponent(args.id)}`
      );
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_custom_agents_clone_system') {
      requireToken();
      const body = await apiRequest(
        `/api/custom-agents/clone/${encodeURIComponent(args.systemName)}`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_sessions_list') {
      requireToken();
      const qs = buildQuery({ project_id: args.projectId });
      const body = await apiRequest(`/api/sessions${qs}`);
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_sessions_get') {
      requireToken();
      const body = await apiRequest(`/api/sessions/${encodeURIComponent(args.id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_sessions_history') {
      requireToken();
      const body = await apiRequest(
        `/api/sessions/${encodeURIComponent(args.id)}/history`
      );
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_chat_conversations_list') {
      requireToken();
      const body = await apiRequest('/api/chat/conversations');
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_chat_messages_list') {
      requireToken();
      const body = await apiRequest(
        `/api/chat/conversations/${encodeURIComponent(args.id)}/messages`
      );
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_chat_send') {
      requireToken();
      const payload = {
        content: args.content,
        ...(args.role !== undefined ? { role: args.role } : {}),
      };
      const body = await apiRequest(
        `/api/chat/conversations/${encodeURIComponent(args.id)}/messages`,
        { method: 'POST', body: JSON.stringify(payload) }
      );
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_search') {
      requireToken();
      const qs = buildQuery({
        q: args.q,
        type: args.type,
        project_id: args.projectId,
        limit: args.limit,
      });
      const body = await apiRequest(`/api/search${qs}`);
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_import_scan') {
      requireToken();
      // Build files payload from client filesystem — works for remote byan_web.
      const { files } = await buildFilesPayload(args.path, {
        ...(args.maxFiles ? { maxFiles: args.maxFiles } : {}),
        ...(args.maxBytes ? { maxBytes: args.maxBytes } : {}),
      });
      const body = await apiRequest('/api/import/scan', {
        method: 'POST',
        body: JSON.stringify({ files }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    if (name === 'byan_api_import_dry_run') {
      requireToken();
      // Build files payload from client filesystem — works for remote byan_web.
      const { files } = await buildFilesPayload(args.path, {
        ...(args.maxFiles ? { maxFiles: args.maxFiles } : {}),
        ...(args.maxBytes ? { maxBytes: args.maxBytes } : {}),
      });
      const body = await apiRequest('/api/import/dry-run', {
        method: 'POST',
        body: JSON.stringify({ files }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error: ${err.message}` }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

export { buildFilesPayload };
