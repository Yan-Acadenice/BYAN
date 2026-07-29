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
import { claudeToolActivity } from '../../shared/tool-activity';

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

    const parseLine = (line: string): void => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line) as Record<string, unknown>;
      } catch {
        // Non-JSON line — treat as a raw assistant chunk.
        emit({ type: 'chunk', sessionId, delta: line, role: 'assistant' });
        return;
      }
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
              emit({ type: 'tool', sessionId, tool: item, activity: claudeToolActivity(item) ?? undefined });
            }
          }
          break;
        }
        case 'content_block_delta': {
          const delta = event.delta as { type?: string; text?: string } | undefined;
          if (delta?.type === 'text_delta') emit({ type: 'chunk', sessionId, delta: delta.text ?? '', role: 'assistant' });
          break;
        }
        case 'tool_use':
          emit({ type: 'tool', sessionId, tool: event, activity: claudeToolActivity(event) ?? undefined });
          break;
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
