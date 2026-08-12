// Claude engine — ONE long-lived `claude` process per session, turns written
// to its stdin as stream-json lines.
//
// Protocol: `claude --print --verbose --output-format stream-json --input-format stream-json`
// (--verbose is mandatory with print + stream-json, else the CLI refuses to
// start). User turns are {type:'user',message:{role:'user',content}} JSON
// lines — the exact stream-json input shape the CLI requires (a flat
// {type,content} triggers "Expected message role 'user', got 'undefined'").
// The MCP channel needs no wiring here: claude reads the project dir's
// .mcp.json on its own.

import type { ChildProcess } from 'child_process';
import { IpcError } from '../ipc-handlers/_error';
import type { Engine, EngineDeps, EngineSession, EngineStartOpts } from './types';
import { killProcTreeNow, stopProcTree } from './kill-tree';
import { LineAccumulator } from './stream-lines';
import { claudeToolActivity, claudeToolResultActivity, parseFrameInstant, type StartedCall } from '../../shared/tool-activity';

// Benign claude stderr prefixes (progress/status). Filtered so only real errors
// surface. Tested per-LINE (never with /m) so an error line that follows a
// benign one in the same chunk is NOT swallowed.
const BENIGN_STDERR = /^(Initializing|Loading|Connected|Session|Warming|Cost:|Token)/;

export class ClaudeEngine implements Engine {
  readonly id = 'claude' as const;

  constructor(private readonly deps: EngineDeps) {}

  start({ sessionId, cwd, agent, model, effort, emit, onClose }: EngineStartOpts): EngineSession {
    const args = ['--print', '--verbose', '--output-format', 'stream-json', '--input-format', 'stream-json'];
    if (agent) args.push('--agent', agent);
    // --model takes an alias ('opus') or a full name ('claude-fable-5'). The
    // token arrives pre-validated: the bridge is the trust boundary and rejects
    // anything isValidModelFor('claude') refuses BEFORE a spawn, so nothing is
    // re-checked here. That guarantee is the bridge's to keep.
    if (model) args.push('--model', model);
    if (effort) args.push('--effort', effort);
    // NOTE: no --resume. A byan session record id is NOT claude's own session
    // uuid; "reprendre" in native mode = reopen claude in the project dir.

    // Resolve claude to an ABSOLUTE path and spawn it with the user's real
    // PATH: a windowed launch (double-click) inherits a truncated PATH and a
    // bare 'claude' raised "spawn claude ENOENT" in the field.
    const bin = this.deps.resolveBin('claude') || 'claude';
    let proc: ChildProcess;
    try {
      // detached on POSIX -> claude leads its own process group so the kill
      // helpers reap it AND its MCP node child at once. NOT unref'd.
      proc = this.deps.spawnFn(bin, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: this.deps.spawnEnv(),
        detached: process.platform !== 'win32',
      });
    } catch (err) {
      throw new IpcError('INTERNAL', `claude introuvable ou non lançable: ${err instanceof Error ? err.message : String(err)}`);
    }

    const lines = new LineAccumulator();

    // claude announces the START of a tool call in the `assistant` frame
    // (tool_use, with its id) and its END in the `user` frame that follows
    // (tool_result, carrying the same id in tool_use_id — measured). This map
    // holds what the start said so the end can be labelled with it: a
    // tool_result has an id and a verdict but no name of its own.
    const openCalls = new Map<string, StartedCall>();
    const remember = (activity: { id?: string; name: string; detail?: string }): void => {
      if (activity.id) openCalls.set(activity.id, { name: activity.name, detail: activity.detail });
    };

    const parseLine = (line: string): void => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line) as Record<string, unknown>;
      } catch {
        // Non-JSON line — treat as a raw assistant chunk.
        emit({ type: 'chunk', sessionId, delta: line, role: 'assistant' });
        return;
      }
      // claude timestamps its assistant/user frames (measured: ISO-8601 UTC with
      // milliseconds). Its clock is preferred over ours because it dates the
      // production of the frame, not the moment the pipe handed it over.
      const at = parseFrameInstant(event.timestamp) ?? Date.now();
      switch (event.type) {
        case 'assistant': {
          const msg = (event.message as { content?: unknown })?.content ?? event.content ?? [];
          const items = Array.isArray(msg) ? msg : [msg];
          for (const item of items) {
            if (typeof item === 'string') emit({ type: 'chunk', sessionId, delta: item, role: 'assistant' });
            else if (item && (item as { type?: string }).type === 'text') emit({ type: 'chunk', sessionId, delta: (item as { text?: string }).text ?? '', role: 'assistant' });
            else if (item && (item as { type?: string }).type === 'tool_use') {
              // The raw item stays on the frame; the normalized label is what the
              // interface can actually show without knowing claude's shape.
              const activity = claudeToolActivity(item, at) ?? undefined;
              if (activity) remember(activity);
              emit({ type: 'tool', sessionId, tool: item, activity });
            }
          }
          break;
        }
        // The END of a tool call lands here, and the engine used to drop this
        // whole frame on `default`. Without it a step has one bound and the
        // interface can never say how long anything took.
        case 'user': {
          const content = (event.message as { content?: unknown })?.content;
          // Our own turn echoed back carries a plain string: nothing to close.
          if (!Array.isArray(content)) break;
          for (const block of content) {
            const activity = claudeToolResultActivity(block, { at, lookup: (id) => openCalls.get(id) });
            if (!activity) continue;
            if (activity.id) openCalls.delete(activity.id);
            emit({ type: 'tool', sessionId, tool: block, activity });
          }
          break;
        }
        case 'content_block_delta': {
          const delta = event.delta as { type?: string; text?: string } | undefined;
          if (delta?.type === 'text_delta') emit({ type: 'chunk', sessionId, delta: delta.text ?? '', role: 'assistant' });
          break;
        }
        case 'tool_use': {
          const activity = claudeToolActivity(event, at) ?? undefined;
          if (activity) remember(activity);
          emit({ type: 'tool', sessionId, tool: event, activity });
          break;
        }
        // Measured on claude 2.1.220: {type:'system',subtype:'thinking_tokens',
        // estimated_tokens,estimated_tokens_delta}. These arrive during the long
        // stretches where no text is produced — exactly when the interface used
        // to look frozen.
        case 'system':
          if (event.subtype === 'thinking_tokens') {
            const tokens = typeof event.estimated_tokens === 'number' ? event.estimated_tokens : undefined;
            emit({ type: 'thinking', sessionId, tokens });
          }
          break;
        case 'result':
          // End of turn: a call still waiting for its tool_result will never get
          // one. Forgetting it keeps the map bounded — and NO synthetic end is
          // emitted, so those steps stay open with an unknown duration instead of
          // being credited with a made-up one.
          openCalls.clear();
          // is_error:true = a FAILED turn (rate limit, refusal, API error).
          // Surface it as an error, never as a silent success the renderer
          // commits as a reply.
          if (event.is_error === true) {
            emit({ type: 'error', sessionId, error: `claude: ${String(event.result || event.subtype || 'le tour a échoué')}` });
          } else {
            // Usage reports ONLY what this stream actually carries: cost and
            // duration. claude publishes no token breakdown here, so those
            // fields stay ABSENT — a 0 would read as a measured zero.
            emit({
              type: 'complete',
              sessionId,
              result: event.result,
              usage: {
                engine: 'claude',
                model: model ?? null,
                costUsd: typeof event.total_cost_usd === 'number' ? event.total_cost_usd : null,
                durationMs: typeof event.duration_ms === 'number' ? event.duration_ms : null,
              },
            });
          }
          break;
        case 'error':
          emit({ type: 'error', sessionId, error: String(event.error || event.message || 'Erreur claude') });
          break;
        default:
          break;
      }
    };

    const flushTail = (): void => {
      const tail = lines.flush();
      if (tail) parseLine(tail);
    };

    proc.stdout?.on('data', (chunk: Buffer) => {
      for (const line of lines.push(chunk)) parseLine(line);
    });
    proc.stdout?.on('end', flushTail);
    proc.stderr?.on('data', (chunk: Buffer) => {
      const bad = chunk.toString().split('\n').map((l) => l.trim())
        .filter((l) => l && !BENIGN_STDERR.test(l));
      if (bad.length) emit({ type: 'error', sessionId, error: `claude: ${bad.join(' ')}` });
    });
    proc.on('error', (err: Error) => {
      emit({ type: 'error', sessionId, error: `claude: ${err.message}` });
      onClose();
    });
    proc.on('exit', () => {
      flushTail();
      onClose();
    });

    return {
      send(message: string): void {
        if (!proc.stdin || !proc.stdin.writable) {
          throw new IpcError('NOT_FOUND', 'Session locale absente ou fermée.');
        }
        proc.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: message } }) + '\n');
      },
      stop(): void {
        // Do NOT tear down synchronously: claude may still flush a final
        // `result` during the SIGTERM grace window. The 'exit' handler calls
        // onClose (and flushTail drains the tail), so an in-flight reply is
        // not dropped.
        stopProcTree(proc);
      },
      kill(): void {
        killProcTreeNow(proc);
      },
    };
  }
}
