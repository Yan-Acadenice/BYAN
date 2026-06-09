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
import { harvest as harvestInsights, renderDigest as renderInsightDigest } from './lib/insight-harvest.js';
import { appendOutcome } from './lib/outcome-buffer.js';
import { validateForLog } from './lib/advisory-autofeed.js';
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
  record as suitabilityRecord,
  reportLedger as suitabilityReport,
  ledgerPath as suitabilityLedgerPath,
} from './lib/suitability-store.js';
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
import { checkForUpdate, formatApplyInstructions } from './lib/update.js';
import {
  lockScope as strictLockScope,
  selfVerify as strictSelfVerify,
  complete as strictComplete,
  getStatus as strictGetStatus,
  abort as strictAbort,
  checkAuditTrail as strictCheckAuditTrail,
} from './lib/strict-mode.js';
import { detectActivation as strictDetectActivation } from './lib/strict-activation.js';
import {
  pushLock as strictPushLock,
  pushVerify as strictPushVerify,
  pushComplete as strictPushComplete,
  pushAbort as strictPushAbort,
  fetchSession as strictFetchSession,
  syncEnabled as strictSyncEnabled,
  resolveProjectId as strictResolveProjectId,
} from './lib/strict-sync.js';

// Compact view of a best-effort strict-sync result for tool responses.
function syncResult(sync) {
  if (!sync) return { synced: false, reason: 'no_result' };
  return sync.synced ? { synced: true } : { synced: false, reason: sync.reason || 'unknown' };
}
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);
// Resolve the host project root: server.js lives at
// {projectRoot}/_byan/mcp/byan-mcp-server/server.js, so go up three levels.
const PROJECT_ROOT = nodePath.resolve(__dirname, '..', '..', '..');

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
      'BYAN Dispatcher: routes a unit of work along two independent axes. STRATEGY (where it runs: main-thread / agent-subagent-worktree / mcp-worker) from the scalar score + parallelizable. TIER (which model) from the task NATURE via native-tiers (the single source of truth): only exploration downgrades to haiku; implementation/verification/analysis stay deep (inherit the session model); never pins up to opus. Rule-based, no API call. Returns { score, strategy, nature, tier, model, reasoning }.',
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
        nature: {
          type: 'string',
          enum: ['exploration', 'implementation', 'verification', 'analysis'],
          description: 'Optional task nature. A valid value sets the model tier directly; otherwise the nature is classified from the task text. Only exploration is downgrade-safe.',
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
      'Start a new Feature Development (FD) cycle for BYAN. Writes _byan-output/fd-state.json with phase=DISCOVERY. Rejects if another FD is already in progress (unless force=true).',
    inputSchema: {
      type: 'object',
      properties: {
        featureName: { type: 'string', description: 'Short slug for the feature.' },
        force: { type: 'boolean', description: 'Overwrite an existing in-progress FD.' },
        strict: {
          type: 'boolean',
          description:
            'Start the FD under BYAN Strict Mode. Records strict_mode=true and signals that the scope must be locked (byan_strict_lock_scope) before BUILD.',
        },
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
      'Transition the current FD session to another phase. Valid targets : DISCOVERY | BRAINSTORM | PRUNE | DISPATCH | BUILD | REVIEW | VALIDATE | REFACTOR | DOC | COMPLETED | ABORTED. Rejects backward moves except REFACTOR->BUILD (rework loop) and ABORTED/COMPLETED.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          enum: [
            'DISCOVERY',
            'BRAINSTORM',
            'PRUNE',
            'DISPATCH',
            'BUILD',
            'REVIEW',
            'VALIDATE',
            'REFACTOR',
            'DOC',
            'COMPLETED',
            'ABORTED',
          ],
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
      'Patch fields on the active FD state. Allowed keys : project_context, raw_ideas, backlog, dispatch_table, commits, review_findings, validate_verdict, refactor_log, doc_log, notes, feature_name. Rejects unknown keys.',
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
    name: 'byan_suitability_record',
    description:
      'Record one adequacy outcome for a (model x leaf) pair into the model-suitability ledger (advisory only). success=true means the cheap model was adequate on this leaf; false means it was not. Best-effort: a persistence failure degrades to { recorded: false } and never throws. This is the ONLY write path to the ledger (workflow scripts cannot write state).',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model tier/id the leaf ran on (e.g. haiku).' },
        leafId: { type: 'string', description: 'Stable leaf label (e.g. load-story).' },
        success: {
          type: 'boolean',
          description: 'true = cheap model adequate on this leaf; false = inadequate.',
        },
        source: { type: 'string', description: 'Optional provenance tag (e.g. adversarial-pass).' },
      },
      required: ['model', 'leafId', 'success'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_suitability_report',
    description:
      'Read the model-suitability ledger as advisory ratings (most-actionable first). Each row carries the credible LOWER bound and the sample size n, never a bare point estimate, plus a verdict keep-cheap | watch | demote. ADVISORY ONLY: it never edits routing; a human decides. Optional model filter.',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Optional: restrict to this model tier/id.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'byan_insight_digest',
    description:
      'Harvest native Claude Code outcome trails (tool-log, strict-audit gaps, the suitability ledger, ELO) into a GATED improvement digest for BYAN. Read-only: it OBSERVES and PROPOSES; every proposal is gated for a human to ratify, nothing is auto-applied to routing / personas / mantras. Returns { toolHealth, recurringGaps, routingOutcomes, eloTrends, proposals }.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'byan_outcome_log',
    description:
      'Log one ADVISORY outcome to the auto-feed buffer (cheap append; it never writes a ledger directly). The drain-advisory Stop hook records buffered outcomes into the ELO / suitability ledgers at end of turn, so BYAN auto-learns without the agent recording by hand. kind=elo needs { domain, result: VALIDATED|PARTIAL|BLOCKED }; kind=suitability needs { model, leafId, success }. Advisory-only: behavior surfaces (routing / personas / mantras) are never written.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['elo', 'suitability'] },
        domain: { type: 'string', description: 'elo: the technical domain of the claim' },
        result: { type: 'string', enum: ['VALIDATED', 'PARTIAL', 'BLOCKED'], description: 'elo: the claim verdict' },
        model: { type: 'string', description: 'suitability: the cheap model tier/id' },
        leafId: { type: 'string', description: 'suitability: the workflow leaf' },
        success: { type: 'boolean', description: 'suitability: did the cheap model survive adversarial review' },
      },
      required: ['kind'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_strict_lock_scope',
    description:
      'Lock a scope for a BYAN Strict Mode session. Records explicit acceptance criteria and allowed paths. Subsequent work is gated against this scope hash. Pass force=true to relock with a different scope (resets self-verify passes).',
    inputSchema: {
      type: 'object',
      properties: {
        scopeText: {
          type: 'string',
          description: 'Description of the scope (≥ 10 chars). Required.',
        },
        acceptanceCriteria: {
          type: 'array',
          items: { type: 'string' },
          description: 'Non-empty array of explicit deliverable criteria.',
        },
        allowedPaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Glob patterns of paths the agent may modify.',
        },
        force: { type: 'boolean', description: 'Relock with different scope.' },
        projectId: {
          type: 'string',
          description: 'byan_web project id to attach this session to (authority side). Optional; falls back to BYAN_PROJECT_ID env.',
        },
        featureName: {
          type: 'string',
          description: 'Short feature name for the session (e.g. the FD feature slug). Optional.',
        },
      },
      required: ['scopeText', 'acceptanceCriteria'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_strict_self_verify',
    description:
      'Record one self-verify pass against the locked scope. verdict="ok" (zero gaps) or "gap" (findings required). Strict mode requires ≥ 3 passes with the final pass returning "ok" before byan_strict_complete can succeed.',
    inputSchema: {
      type: 'object',
      properties: {
        verdict: {
          type: 'string',
          enum: ['ok', 'gap'],
          description: '"ok" = no gap found ; "gap" = gap found, findings required.',
        },
        findings: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of gap descriptions. Required when verdict="gap".',
        },
      },
      required: ['verdict'],
      additionalProperties: false,
    },
  },
  {
    name: 'byan_strict_complete',
    description:
      'Mark the strict session complete. Requires scope locked, ≥ 3 self-verify passes, last pass verdict="ok". Returns audit_token used by the pre-commit hook to authorize the commit.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'byan_strict_status',
    description:
      'Return current strict mode state : scope_locked, scope_hash, acceptance_criteria, pass_count, min_passes, completed, audit_token.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'byan_strict_abort',
    description:
      'Abort the current strict session. Marks inactive in state.json and appends abort entry to audit.log. State preserved for inspection.',
    inputSchema: {
      type: 'object',
      properties: { reason: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'byan_strict_suggest',
    description:
      'Check whether a piece of text (user request, feature name) signals a production-grade deliverable that should be built under strict mode. Reads activation keywords from _byan/_config/strict-mode.yaml. Returns { suggested, matched, message }. Use on any platform (Codex/Copilot have no in-session hook) to decide whether to lock strict mode.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The request or feature description to scan.' },
      },
      required: ['text'],
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
  {
    name: 'byan_update_check',
    description:
      'Check whether the BYAN platform installed in this project is up to date. Read-only. Reads the installed version from _byan/.manifest.json (fallback: package.json), fetches the latest published version from the npm registry (registry.npmjs.org/create-byan-agent), compares them, and returns { installed, latest, updateAvailable, delta }. Network failures are reported (networkError) and treated as "do not block". Use at agent activation to surface updates without nagging.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'byan_update_apply',
    description:
      'Returns the exact shell command the user must run to apply a BYAN update via the yanstaller pipeline (backup, diff vs latest npm template, merge non-user-modified files). Does NOT execute anything itself — update is destructive and must remain an explicit user action. Use after byan_update_check reports updateAvailable=true and the user has consented.',
    inputSchema: {
      type: 'object',
      properties: {
        preview: {
          type: 'boolean',
          description: 'If true, returns the --preview command (shows the diff without writing). Default: false.',
        },
        force: {
          type: 'boolean',
          description: 'If true, returns the --force command (overrides user-modified files). Default: false. Use with caution.',
        },
      },
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
      const state = fdStart({ featureName: args.featureName, force: args.force, strict: args.strict });
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

    if (name === 'byan_suitability_record') {
      const r = suitabilityRecord({
        model: args.model,
        leafId: args.leafId,
        success: args.success,
        source: args.source,
      });
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    }

    if (name === 'byan_suitability_report') {
      const rows = suitabilityReport({ model: args.model });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ledger: suitabilityLedgerPath(), advisory: true, rows }, null, 2),
          },
        ],
      };
    }

    if (name === 'byan_insight_digest') {
      const rootDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
      const digest = harvestInsights({ rootDir });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ gated: true, digest, render: renderInsightDigest(digest) }, null, 2),
          },
        ],
      };
    }

    if (name === 'byan_outcome_log') {
      const line = validateForLog(args);
      if (!line) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ logged: false, reason: 'invalid_outcome' }) }],
        };
      }
      const rootDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
      const ok = appendOutcome(line, { rootDir });
      return {
        content: [{ type: 'text', text: JSON.stringify({ logged: ok, outcome: line }) }],
      };
    }

    if (name === 'byan_strict_lock_scope') {
      const r = strictLockScope({
        scopeText: args.scopeText,
        acceptanceCriteria: args.acceptanceCriteria,
        allowedPaths: args.allowedPaths,
        force: args.force,
      });
      const st = strictGetStatus();
      // Attach to a byan_web project: explicit arg, else env, else resolve from
      // the active FD project_context (best-effort; null degrades to user-scoped).
      let projectId = args.projectId || process.env.BYAN_PROJECT_ID || null;
      let featureName = args.featureName || null;
      if (strictSyncEnabled()) {
        try {
          const fd = fdStatus();
          const pc = fd && fd.project_context;
          if (pc) {
            if (!projectId && (pc.slug || pc.name)) {
              projectId = await strictResolveProjectId({ slug: pc.slug, name: pc.name });
            }
            if (!featureName && fd.feature_name) featureName = fd.feature_name;
          }
        } catch {
          // FD context unavailable — stay user-scoped.
        }
      }
      const sync = await strictPushLock({
        sessionId: st.strict_session_id,
        scopeLock: r,
        projectId,
        featureName,
      });
      return { content: [{ type: 'text', text: JSON.stringify({ ...r, project_id: projectId, sync: syncResult(sync) }, null, 2) }] };
    }

    if (name === 'byan_strict_self_verify') {
      const r = strictSelfVerify({
        verdict: args.verdict,
        findings: args.findings || [],
      });
      const st = strictGetStatus();
      const lastPass = (st.passes || [])[st.passes.length - 1];
      const sync = await strictPushVerify({ sessionId: st.strict_session_id, pass: lastPass });
      return { content: [{ type: 'text', text: JSON.stringify({ ...r, sync: syncResult(sync) }, null, 2) }] };
    }

    if (name === 'byan_strict_complete') {
      const r = strictComplete();
      const st = strictGetStatus();
      const sync = await strictPushComplete({
        sessionId: st.strict_session_id,
        auditToken: r.audit_token,
        completedAt: r.completed_at,
      });
      return { content: [{ type: 'text', text: JSON.stringify({ ...r, sync: syncResult(sync) }, null, 2) }] };
    }

    if (name === 'byan_strict_status') {
      const local = strictGetStatus();
      // The API is the authority. When a session exists and the API answers,
      // surface its record; otherwise fall back to the local mirror (offline).
      let authority = 'local';
      let r = local;
      if (local.strict_session_id && strictSyncEnabled()) {
        const remote = await strictFetchSession({ sessionId: local.strict_session_id });
        if (remote.ok && remote.data) {
          authority = 'api';
          r = { ...local, api: remote.data };
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify({ ...r, authority }, null, 2) }] };
    }

    if (name === 'byan_strict_abort') {
      const st = strictGetStatus();
      const r = strictAbort({ reason: args.reason });
      const sync = await strictPushAbort({ sessionId: st.strict_session_id, reason: args.reason });
      return { content: [{ type: 'text', text: JSON.stringify({ ...r, sync: syncResult(sync) }, null, 2) }] };
    }

    if (name === 'byan_strict_suggest') {
      const r = strictDetectActivation({ text: args.text });
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
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

    if (name === 'byan_update_check') {
      const status = await checkForUpdate(PROJECT_ROOT);
      return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
    }

    if (name === 'byan_update_apply') {
      const instructions = formatApplyInstructions({
        preview: args.preview === true,
        force: args.force === true,
      });
      return { content: [{ type: 'text', text: JSON.stringify(instructions, null, 2) }] };
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
