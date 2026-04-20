# MCP tools patch — peer review pipeline

Add these 5 tool definitions to the main BYAN MCP server (same file that already exposes `byan_dispatch`, `byan_fc_check`, etc.). Each tool is a thin wrapper over `peer-review.js`.

## Common import

```js
import {
  requestReview,
  recordVerdict,
  getReview,
  listPending,
  pickReviewer,
  DEFAULT_AGENT_ROSTER,
} from './peer-review.js';

const projectRoot = process.env.BYAN_PROJECT_ROOT || process.cwd();
```

## Tool 1 — `byan_review_request`

```js
server.tool('byan_review_request', {
  description: 'Request peer review of a commit/artefact. Creates a pending review record.',
  inputSchema: {
    type: 'object',
    required: ['task_id', 'author', 'artifact_paths'],
    properties: {
      task_id: { type: 'string' },
      author: { type: 'string' },
      artifact_paths: { type: 'array', items: { type: 'string' } },
      description: { type: 'string' },
    },
  },
}, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await requestReview({ ...args, projectRoot })) }] }));
```

## Tool 2 — `byan_review_verdict`

```js
server.tool('byan_review_verdict', {
  description: 'Record a structured verdict on a pending review. Throws if reviewer === author.',
  inputSchema: {
    type: 'object',
    required: ['task_id', 'reviewer', 'verdict'],
    properties: {
      task_id: { type: 'string' },
      reviewer: { type: 'string' },
      verdict: { type: 'string', enum: ['approve', 'changes', 'block'] },
      comments: { type: 'string' },
      must_fix: { type: 'array', items: { type: 'string' } },
    },
  },
}, async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await recordVerdict({ ...args, projectRoot })) }] }));
```

## Tool 3 — `byan_review_get`

```js
server.tool('byan_review_get', {
  description: 'Fetch the full review record for a task_id.',
  inputSchema: {
    type: 'object',
    required: ['task_id'],
    properties: { task_id: { type: 'string' } },
  },
}, async ({ task_id }) => ({ content: [{ type: 'text', text: JSON.stringify(await getReview({ task_id, projectRoot })) }] }));
```

## Tool 4 — `byan_review_pending`

```js
server.tool('byan_review_pending', {
  description: 'List all pending reviews awaiting a verdict.',
  inputSchema: { type: 'object', properties: {} },
}, async () => ({ content: [{ type: 'text', text: JSON.stringify(await listPending({ projectRoot })) }] }));
```

## Tool 5 — `byan_review_pick_reviewer`

```js
server.tool('byan_review_pick_reviewer', {
  description: 'Pick a reviewer distinct from the author using domain-pair heuristics.',
  inputSchema: {
    type: 'object',
    required: ['author'],
    properties: {
      author: { type: 'string' },
      preferredDomain: { type: 'string' },
      roster: { type: 'array', items: { type: 'string' } },
    },
  },
}, async (args) => ({ content: [{ type: 'text', text: JSON.stringify({ reviewer: pickReviewer({ ...args, roster: args.roster || DEFAULT_AGENT_ROSTER }) }) }] }));
```

Total: ~55 LOC of wrappers. All business logic lives in `peer-review.js`.
