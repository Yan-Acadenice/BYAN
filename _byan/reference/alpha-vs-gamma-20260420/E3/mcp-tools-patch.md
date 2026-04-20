# MCP Tool Defs — E3 Kanban + Stand-up

Add these 8 tools to the BYAN MCP server. All import from `./kanban.js`.

```js
import * as K from './kanban.js';
const root = process.env.BYAN_PROJECT_ROOT || process.cwd();
```

## 1. `byan_kanban_create`
Input: `{ sessionId: string }`
Handler: `async ({ sessionId }) => K.createBoard({ sessionId, projectRoot: root })`

## 2. `byan_kanban_add`
Input: `{ sessionId: string, card: { id, title, priority?, column?, assignee? } }`
Required: `sessionId`, `card.id`, `card.title`
Handler: `async ({ sessionId, card }) => K.addCard({ sessionId, card, projectRoot: root })`

## 3. `byan_kanban_move`
Input: `{ sessionId: string, cardId: string, toColumn: enum[todo,doing,blocked,review,done], blocker_reason?: string }`
Handler: `async (a) => K.moveCard({ ...a, projectRoot: root })`

## 4. `byan_kanban_assign`
Input: `{ sessionId: string, cardId: string, assignee: string|null }`
Handler: `async (a) => K.assignCard({ ...a, projectRoot: root })`

## 5. `byan_kanban_get`
Input: `{ sessionId: string }`
Handler: `async ({ sessionId }) => K.getBoard({ sessionId, projectRoot: root })`

## 6. `byan_standup_post`
Input: `{ sessionId: string, agent: string, did?: string[], blockers?: string[], next?: string[] }`
Required: `sessionId`, `agent`
Handler: `async (a) => K.postStandup({ ...a, projectRoot: root })`

## 7. `byan_standup_read`
Input: `{ sessionId: string, limit?: integer (default 50) }`
Handler: `async ({ sessionId, limit }) => K.readStandups({ sessionId, projectRoot: root, limit })`

## 8. `byan_standup_blocked`
Input: `{ sessionId: string, minStreak?: integer (default 2) }`
Returns: `[{ agent, streak, lastAt }]`
Handler: `async ({ sessionId, minStreak }) => K.detectBlockedStreaks({ sessionId, minStreak, projectRoot: root })`

## Hermes integration

After each party-mode tick, Hermes calls `byan_standup_blocked` with `minStreak=2`.
If the result array is non-empty, Hermes triggers redispatch:
```
for each { agent, streak } in result:
  emit redispatch_event(agent, reason=`blocked for ${streak} consecutive stand-ups`)
```

All 8 tools share the same error shape: thrown `Error.message` is returned as the tool error text (MCP default handling).
