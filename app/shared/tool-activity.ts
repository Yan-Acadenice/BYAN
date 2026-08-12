// Turning an engine's raw tool payload into one readable line — and into a step
// that can be PLACED IN TIME.
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
// WHY IT ALSO CARRIES AN IDENTIFIER AND AN INSTANT. A frame that only says
// "Bash started" cannot be drawn on a timeline: without a matching end a step has
// no second bound, and without an identifier an end cannot be matched to its
// start. Both CLIs publish what is needed and it was being dropped on the floor.
//
// Shapes below are MEASURED, not recalled:
//   claude 2.1.220  tool_use          {type,id:'toolu_014Ef…',name:'Bash',input:{command,description},caller}
//   claude 2.1.220  thinking_tokens   {type:'system',subtype:'thinking_tokens',estimated_tokens,...}
//   codex-cli 0.146 command_execution {id:'item_1',type,command:'/usr/bin/zsh -lc ls',aggregated_output,exit_code,status}
// The other codex item types (mcp_tool_call, web_search, file_change, todo_list)
// were NOT captured live; their field names are read defensively and fall back to
// the item type when nothing matches, so an unmeasured shape degrades to a
// correct-but-vague label instead of a wrong one.
//
// MEASURED LIVE ON 2026-07-31 — the four facts this file is built on:
//  1. claude closes the loop in the `user` frame that follows the call:
//     {type:'user',message:{content:[{type:'tool_result',tool_use_id:'toolu_014Ef…',
//     is_error:false,content:…}]}}. The tool_use_id was byte-for-byte the id of
//     the preceding tool_use. The engine used to fall through to `default` and
//     drop it — which is exactly why no step ever had an end.
//  2. `is_error` is NOT always present (a Bash result carried is_error:false, a
//     Read result carried no such field at all), so an absent verdict stays
//     unknown instead of being read as a success.
//  3. claude timestamps its assistant/user frames at the top level
//     ('2026-07-31T09:41:16.116Z'); codex timestamps NOTHING (its frame keys are
//     exactly {item,type}). So one engine can be trusted for the instant and the
//     other is stamped when the line is read.
//  4. codex item ids RESTART at item_0 on every turn: a fresh turn and its
//     `exec resume` follow-up both produced item_0/item_1/item_2. Raw item ids
//     therefore COLLIDE inside one session and must be namespaced per turn.

export interface LocalChatActivity {
  // Short label: 'Bash', 'Read', 'byan.byan_ping', 'commande'.
  name: string;
  // The specific thing being acted on: a command, a path, a pattern. Truncated.
  detail?: string;
  // 'start' — it just began (claude tool_use, codex item.started).
  // 'end'   — it finished (claude tool_result, codex item.completed).
  phase: 'start' | 'end';
  // The engine's own identifier for this call, stable between its start and its
  // end. ABSENT means this frame cannot be paired with anything — it is never
  // an empty string, because two empty strings would look like the same call.
  id?: string;
  // Epoch ms of the observed instant. Required: a frame with no instant cannot
  // be placed on a timeline at all.
  at: number;
  // The verdict the engine reported on the end of the step. ABSENT means the
  // engine said nothing — which is not the same as a success.
  ok?: boolean;
}

// What a start frame told us, so the matching end can be labelled with it. An
// end frame carries an id and a verdict but no name of its own.
export interface StartedCall {
  name: string;
  detail?: string;
}

// Label of last resort for an end whose start was never seen. Vague on purpose:
// naming a tool we did not observe would be an invention.
const UNKNOWN_TOOL = 'outil';

// Long enough to identify the work, short enough to hold one line in the strip.
const DETAIL_MAX = 80;

export function truncateDetail(value: string, max = DETAIL_MAX): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

// A non-empty string id, or nothing. '' and '   ' are rejected on purpose: an
// empty identifier would pair unrelated steps with each other.
function readId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

// The instant a frame claims for itself, when it carries one. claude publishes
// ISO-8601 UTC; a number is accepted too so a future wire format does not need a
// new parser. Anything unparseable yields undefined rather than NaN or 0 — a
// zero would place the step at 1970.
export function parseFrameInstant(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
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

export function claudeToolActivity(item: unknown, at: number): LocalChatActivity | null {
  if (!item || typeof item !== 'object') return null;
  const rec = item as { name?: unknown; input?: unknown; id?: unknown };
  if (typeof rec.name !== 'string' || !rec.name.trim()) return null;
  return {
    name: shortenToolName(rec.name),
    detail: detailFromInput(rec.input),
    phase: 'start',
    id: readId(rec.id),
    at,
  };
}

// The other half of a claude tool call, read from a `tool_result` block of the
// `user` frame. `lookup` hands back what the matching start said, because a
// tool_result carries an id and a verdict but no name.
//
// A block with no tool_use_id yields null: it would close nothing, and a step
// that cannot be attached is noise rather than information.
export function claudeToolResultActivity(
  block: unknown,
  ctx: { at: number; lookup?: (toolUseId: string) => StartedCall | undefined }
): LocalChatActivity | null {
  if (!block || typeof block !== 'object') return null;
  const rec = block as { type?: unknown; tool_use_id?: unknown; is_error?: unknown };
  if (rec.type !== 'tool_result') return null;
  const id = readId(rec.tool_use_id);
  if (!id) return null;
  const started = ctx.lookup?.(id);
  return {
    name: started?.name ?? UNKNOWN_TOOL,
    detail: started?.detail,
    phase: 'end',
    id,
    at: ctx.at,
    // Measured: the field is present on some results and absent on others.
    // Absent -> unknown, never "it went fine".
    ok: typeof rec.is_error === 'boolean' ? !rec.is_error : undefined,
  };
}

// codex runs commands through a login shell, so the raw string carries the
// wrapper. Measured form: '/usr/bin/zsh -lc ls'. Stripping it leaves the command
// the user actually recognises.
export function stripShellWrapper(command: string): string {
  const m = /^\S*(?:sh|zsh|bash|fish)\s+-[a-z]*c\s+(.+)$/s.exec(command.trim());
  return m ? m[1].trim() : command.trim();
}

export interface CodexItemContext {
  phase: 'start' | 'end';
  at: number;
  // codex numbers its items per PROCESS and it runs one process per turn, so
  // 'item_1' comes back on every turn of the same session (measured). The engine
  // passes a per-turn key here so two turns never share an id.
  idPrefix?: string;
}

// Name and detail only — the parts that depend on the item type.
function codexLabel(rec: Record<string, unknown>, type: string): StartedCall {
  if (type === 'command_execution') {
    const raw = typeof rec.command === 'string' ? rec.command : '';
    return { name: 'commande', detail: raw ? truncateDetail(stripShellWrapper(raw)) : undefined };
  }
  if (type === 'mcp_tool_call') {
    // Field names unverified for this item type: try the plausible ones, and if
    // none is a string fall back to the type so the label stays truthful.
    const server = typeof rec.server === 'string' ? rec.server : '';
    const tool = typeof rec.tool === 'string' ? rec.tool
      : typeof rec.name === 'string' ? rec.name : '';
    const name = server && tool ? `${server}.${tool}` : tool || 'outil MCP';
    return { name: shortenToolName(name), detail: detailFromInput(rec.arguments ?? rec.input) };
  }
  if (type === 'web_search') {
    const q = typeof rec.query === 'string' ? rec.query : '';
    return { name: 'recherche web', detail: q ? truncateDetail(q) : undefined };
  }
  if (type === 'file_change') {
    const p = typeof rec.path === 'string' ? rec.path
      : typeof rec.file_path === 'string' ? rec.file_path : '';
    return { name: 'modification de fichier', detail: p ? truncateDetail(p) : undefined };
  }
  if (type === 'todo_list') {
    return { name: 'liste de taches' };
  }
  // An item type added by a future codex release: report it as-is rather than
  // dropping it, so a new kind of work still shows up as work.
  return { name: type.replace(/_/g, ' ') };
}

// Measured: command_execution carries exit_code — null while it runs, an integer
// once it is over. Nothing else was measured, so nothing else is read: an item
// type that reports no code has no verdict, not a passing one.
function codexVerdict(rec: Record<string, unknown>): boolean | undefined {
  return typeof rec.exit_code === 'number' ? rec.exit_code === 0 : undefined;
}

export function codexItemActivity(item: unknown, ctx: CodexItemContext): LocalChatActivity | null {
  if (!item || typeof item !== 'object') return null;
  const rec = item as Record<string, unknown>;
  const type = typeof rec.type === 'string' ? rec.type : '';
  if (!type) return null;

  const rawId = readId(rec.id);
  return {
    ...codexLabel(rec, type),
    phase: ctx.phase,
    id: rawId && ctx.idPrefix ? `${ctx.idPrefix}:${rawId}` : rawId,
    at: ctx.at,
    ok: ctx.phase === 'end' ? codexVerdict(rec) : undefined,
  };
}

// ---------- Placing the steps in time ----------
//
// One step = one unit of work, bounded by whatever was actually observed. The
// whole point of this section is what it REFUSES to do: it never invents a
// missing bound. A step whose end never arrived stays open and keeps no
// duration, because a dash is not a zero.

export interface ToolStep {
  // Unique within the timeline: the engine's id when there is one, a positional
  // key otherwise. Two anonymous steps are never merged into one by accident.
  key: string;
  // The engine's own id, when it gave one.
  id?: string;
  name: string;
  detail?: string;
  // Instant of the observed start. ABSENT when only an end was ever seen.
  startedAt?: number;
  // Instant of the observed end. ABSENT while the step is still open.
  endedAt?: number;
  // Set ONLY when both bounds were observed. Never inferred, never defaulted.
  durationMs?: number;
  // No end arrived. The step is not finished and its duration is unknown.
  open: boolean;
  // The engine's verdict on the end, when it gave one.
  ok?: boolean;
  // Keys of the steps whose known interval intersects this one. Symmetric.
  overlapKeys: string[];
}

export interface ActivityTimeline {
  // In the order the steps were first observed.
  steps: ToolStep[];
  // Earliest and latest observed instants, i.e. the window to draw.
  firstAt?: number;
  lastAt?: number;
  // At least two steps ran at the same time.
  concurrent: boolean;
  // How many steps never got an end.
  openCount: number;
}

// An open step has no upper bound: we did not see it stop, so claiming it
// stopped at the last frame would be an invention. Infinity says exactly that,
// and it makes overlap detection correct for two steps still running.
function stepBounds(step: ToolStep): { lo: number; hi: number } | null {
  const lo = step.startedAt ?? step.endedAt;
  if (lo === undefined) return null;
  const hi = step.open ? Number.POSITIVE_INFINITY : (step.endedAt ?? lo);
  return { lo, hi };
}

// Strict comparison: two steps that merely touch (one ends the very millisecond
// the next starts) run one after the other, not together.
function intersects(a: { lo: number; hi: number }, b: { lo: number; hi: number }): boolean {
  return a.lo < b.hi && b.lo < a.hi;
}

export function buildActivityTimeline(activities: readonly LocalChatActivity[]): ActivityTimeline {
  const steps: ToolStep[] = [];
  // id -> index of the step that id last OPENED. A second start on a live id is
  // a new step, not a reuse: it gets a disambiguated key so neither is lost.
  const openIndexById = new Map<string, number>();
  const usedKeys = new Set<string>();
  let anonymous = 0;

  const nextKey = (id?: string): string => {
    if (!id) return `#${anonymous++}`;
    if (!usedKeys.has(id)) return id;
    let n = 2;
    while (usedKeys.has(`${id}#${n}`)) n += 1;
    return `${id}#${n}`;
  };

  const push = (step: ToolStep): number => {
    usedKeys.add(step.key);
    steps.push(step);
    return steps.length - 1;
  };

  for (const a of activities) {
    if (a.phase === 'start') {
      const index = push({
        key: nextKey(a.id),
        id: a.id,
        name: a.name,
        detail: a.detail,
        startedAt: a.at,
        open: true,
        overlapKeys: [],
      });
      if (a.id) openIndexById.set(a.id, index);
      continue;
    }

    const index = a.id !== undefined ? openIndexById.get(a.id) : undefined;
    if (index !== undefined) {
      const step = steps[index];
      step.endedAt = a.at;
      step.open = false;
      step.ok = a.ok;
      // The start owns the label; the end only fills a hole the start left.
      step.detail = step.detail ?? a.detail;
      // A negative span means the two instants come from clocks that disagree.
      // Reporting it would be worse than reporting nothing.
      if (step.startedAt !== undefined && a.at >= step.startedAt) {
        step.durationMs = a.at - step.startedAt;
      }
      openIndexById.delete(a.id as string);
      continue;
    }

    // An end whose start was never seen. The instant is real, the beginning is
    // not known, so the duration stays unknown with it.
    push({
      key: nextKey(a.id),
      id: a.id,
      name: a.name,
      detail: a.detail,
      endedAt: a.at,
      open: false,
      ok: a.ok,
      overlapKeys: [],
    });
  }

  const bounds = steps.map(stepBounds);
  for (let i = 0; i < steps.length; i += 1) {
    const bi = bounds[i];
    if (!bi) continue;
    for (let j = i + 1; j < steps.length; j += 1) {
      const bj = bounds[j];
      if (!bj || !intersects(bi, bj)) continue;
      steps[i].overlapKeys.push(steps[j].key);
      steps[j].overlapKeys.push(steps[i].key);
    }
  }

  const instants = activities.map((a) => a.at);
  return {
    steps,
    firstAt: instants.length ? Math.min(...instants) : undefined,
    lastAt: instants.length ? Math.max(...instants) : undefined,
    concurrent: steps.some((s) => s.overlapKeys.length > 0),
    openCount: steps.filter((s) => s.open).length,
  };
}
