# Patch — enforce `raw_ideas.length >= 10` on BRAINSTORM → next

Target : `_byan/mcp/byan-mcp-server/lib/fd-state.js`

Goal : mechanically block `advance()` out of BRAINSTORM unless the FD state
holds at least 10 raw ideas. Add a `force` escape hatch for edge cases.

## 1. Add constant near top of file

```js
const BRAINSTORM_MIN_IDEAS = 10;
```

## 2. `start()` — initialise the new field

Inside the `state` object returned by `start()` :

```js
const state = {
  fd_id: stampId(now, featureName),
  feature_name: featureName || 'unnamed',
  phase: 'BRAINSTORM',
  started_at: now.toISOString(),
  updated_at: now.toISOString(),
  phase_history: [{ phase: 'BRAINSTORM', entered_at: now.toISOString() }],
  raw_ideas: [],          // NEW — brainstorm buffer
  backlog: [],
  dispatch_table: [],
  commits: [],
  notes: [],
};
```

## 3. `advance()` — add `force` param and gate

```js
export function advance({ to, note, projectRoot, now = new Date(), force = false } = {}) {
  // ... existing validation ...

  // BRAINSTORM exit gate
  if (
    state.phase === 'BRAINSTORM' &&
    to !== 'BRAINSTORM' &&
    to !== 'ABORTED' &&
    !force
  ) {
    const n = Array.isArray(state.raw_ideas) ? state.raw_ideas.length : 0;
    if (n < BRAINSTORM_MIN_IDEAS) {
      throw new Error(
        `BRAINSTORM requires at least ${BRAINSTORM_MIN_IDEAS} raw ideas before advancing (currently ${n}). Pass force=true to bypass.`
      );
    }
  }

  // ... existing state.phase = to; writeState(...) ...
}
```

## 4. `update()` — allow `raw_ideas` in patchable keys

```js
const allowed = [
  'raw_ideas',     // NEW
  'backlog',
  'dispatch_table',
  'commits',
  'notes',
  'feature_name',
];
```

## 5. Exports

```js
export const BRAINSTORM_MIN = BRAINSTORM_MIN_IDEAS;
```

Consumers (MCP tool `byan_fd_advance`) should expose a `force` flag and surface
the thrown error verbatim so the user sees the idea count.
