// Turning an engine's raw tool payload into one readable line.
//
// WHY THIS FILE EXISTS. Both engines already emitted a 'tool' frame carrying the
// raw engine object, and the renderer dropped it ("'tool' is not surfaced yet").
// So during a long turn the interface showed a bare spinner: an agent reading
// files and calling tools for 20-60s looked identical to an agent doing nothing.
//
// The two payload shapes are different, so normalizing in the renderer would mean
// teaching it both engines. It happens here instead, as pure functions, so the
// shapes are pinned by tests rather than by a display component.
//
// Shapes below are MEASURED, not recalled:
//   claude 2.1.220  tool_use          {type,id,name:'Bash',input:{command,description},caller}
//   claude 2.1.220  thinking_tokens   {type:'system',subtype:'thinking_tokens',estimated_tokens,...}
//   codex-cli 0.145 command_execution {id,type,command:'/usr/bin/zsh -lc ls',aggregated_output,exit_code,status}
// The other codex item types (mcp_tool_call, web_search, file_change, todo_list)
// were NOT captured live; their field names are read defensively and fall back to
// the item type when nothing matches, so an unmeasured shape degrades to a
// correct-but-vague label instead of a wrong one.

export interface LocalChatActivity {
  // Short label: 'Bash', 'Read', 'byan.byan_ping', 'commande'.
  name: string;
  // The specific thing being acted on: a command, a path, a pattern. Truncated.
  detail?: string;
  // 'start' — it just began (all claude tool calls, codex item.started).
  // 'end'   — it finished (codex item.completed).
  phase: 'start' | 'end';
}

// Long enough to identify the work, short enough to hold one line in the strip.
const DETAIL_MAX = 80;

export function truncateDetail(value: string, max = DETAIL_MAX): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

// The first field that says something concrete about the call. Order matters:
// a Bash call carries both `command` and `description`, and the command is the
// fact while the description is the model's own paraphrase of it.
const DETAIL_KEYS = [
  'command', 'file_path', 'path', 'pattern', 'url', 'query',
  'notebook_path', 'prompt', 'description',
];

function detailFromInput(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const rec = input as Record<string, unknown>;
  for (const key of DETAIL_KEYS) {
    const v = rec[key];
    if (typeof v === 'string' && v.trim()) return truncateDetail(v);
  }
  return undefined;
}

// 'mcp__byan__byan_ping' -> 'byan.byan_ping'. The double-underscore prefix is
// transport plumbing; showing it raw spends a third of the line on noise.
export function shortenToolName(name: string): string {
  const m = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(name);
  return m ? `${m[1]}.${m[2]}` : name;
}

export function claudeToolActivity(item: unknown): LocalChatActivity | null {
  if (!item || typeof item !== 'object') return null;
  const rec = item as { name?: unknown; input?: unknown };
  if (typeof rec.name !== 'string' || !rec.name.trim()) return null;
  const detail = detailFromInput(rec.input);
  return { name: shortenToolName(rec.name), detail, phase: 'start' };
}

// codex runs commands through a login shell, so the raw string carries the
// wrapper. Measured form: '/usr/bin/zsh -lc ls'. Stripping it leaves the command
// the user actually recognises.
export function stripShellWrapper(command: string): string {
  const m = /^\S*(?:sh|zsh|bash|fish)\s+-[a-z]*c\s+(.+)$/s.exec(command.trim());
  return m ? m[1].trim() : command.trim();
}

export function codexItemActivity(item: unknown, phase: 'start' | 'end'): LocalChatActivity | null {
  if (!item || typeof item !== 'object') return null;
  const rec = item as Record<string, unknown>;
  const type = typeof rec.type === 'string' ? rec.type : '';
  if (!type) return null;

  if (type === 'command_execution') {
    const raw = typeof rec.command === 'string' ? rec.command : '';
    return { name: 'commande', detail: raw ? truncateDetail(stripShellWrapper(raw)) : undefined, phase };
  }
  if (type === 'mcp_tool_call') {
    // Field names unverified for this item type: try the plausible ones, and if
    // none is a string fall back to the type so the label stays truthful.
    const server = typeof rec.server === 'string' ? rec.server : '';
    const tool = typeof rec.tool === 'string' ? rec.tool
      : typeof rec.name === 'string' ? rec.name : '';
    const name = server && tool ? `${server}.${tool}` : tool || 'outil MCP';
    return { name: shortenToolName(name), detail: detailFromInput(rec.arguments ?? rec.input), phase };
  }
  if (type === 'web_search') {
    const q = typeof rec.query === 'string' ? rec.query : '';
    return { name: 'recherche web', detail: q ? truncateDetail(q) : undefined, phase };
  }
  if (type === 'file_change') {
    const p = typeof rec.path === 'string' ? rec.path
      : typeof rec.file_path === 'string' ? rec.file_path : '';
    return { name: 'modification de fichier', detail: p ? truncateDetail(p) : undefined, phase };
  }
  if (type === 'todo_list') {
    return { name: 'liste de taches', phase };
  }
  // An item type added by a future codex release: report it as-is rather than
  // dropping it, so a new kind of work still shows up as work.
  return { name: type.replace(/_/g, ' '), phase };
}
