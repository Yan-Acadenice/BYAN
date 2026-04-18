#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { dispatch } from './lib/dispatch.js';
import { readSoul, appendSoulMemory } from './lib/soul.js';

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
