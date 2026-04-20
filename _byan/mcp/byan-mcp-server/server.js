#!/usr/bin/env node
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
  eloSummary,
  eloContext,
  eloDashboard,
  eloRecord,
  fcCheck,
  fcParse,
} from './lib/cli.js';

const BYAN_API_URL = process.env.BYAN_API_URL || 'http://localhost:3737';
const BYAN_API_TOKEN = process.env.BYAN_API_TOKEN || '';

const authHeaders = () =>
  BYAN_API_TOKEN ? { Authorization: `Bearer ${BYAN_API_TOKEN}` } : {};

async function apiRequest(path, options = {}) {
  const url = `${BYAN_API_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders(),
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
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
  return body;
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
      'Import a local project directory into byan_web. Scans BMAD artifacts (_bmad-output/, docs/, _bmad/_memory/). Requires auth.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the project directory to import.',
        },
        name: { type: 'string', description: 'Optional project name override.' },
        type: {
          type: 'string',
          enum: ['dev', 'training'],
          description: 'Project type. Default: dev.',
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
      const body = await apiRequest('/api/import/project', {
        method: 'POST',
        body: JSON.stringify({
          path: args.path,
          ...(args.name ? { name: args.name } : {}),
          ...(args.type ? { type: args.type } : {}),
        }),
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
