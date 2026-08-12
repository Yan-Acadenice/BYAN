// Codex engine — one process PER TURN.
//
// codex has no long-lived stdin-driven mode: `codex exec` runs ONE turn and
// exits. Multi-turn = chain `codex exec resume <thread_id>` per turn, with the
// thread id captured from the first turn's `thread.started` event.
//
// JSONL contract (live-verified against codex-cli 0.145.0 on 2026-07-24):
//   {"type":"thread.started","thread_id":"<uuid>"}
//   {"type":"turn.started"}
//   {"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"..."}}
//   {"type":"turn.completed","usage":{...}}
// plus item types command_execution / mcp_tool_call / web_search / file_change
// and turn.failed / error on failures.
//
// Re-measured on codex-cli 0.146 (2026-07-31), for the timeline:
//   - an `agent_message` item emits item.completed ONLY; a command_execution
//     emits item.started AND item.completed, both carrying the same item.id;
//   - no frame carries a timestamp of any kind (top-level keys are exactly
//     {item,type}), so the instant is stamped when the line is read;
//   - item ids restart at item_0 on every turn, `exec resume` included — hence
//     the per-turn namespacing in state.turns.
//
// The prompt travels over STDIN (positional '-'), never argv: a message
// starting with '-' cannot be parsed as a flag, and long prompts do not hit
// argv limits. The MCP channel is wired per-invocation from the project's
// .mcp.json via -c overrides (see codex-config.ts) — the codex equivalent of
// claude reading .mcp.json natively.

import { agentPreamble } from '../../shared/agent-definition';
import { readClaudeAgentDefinition } from '../claude-agents';
import type { ChildProcess } from 'child_process';
import { IpcError } from '../ipc-handlers/_error';
import { readMcpConfig, type McpServerConfig } from '../mcp-config';
import type { LocalChatTurnOpts, LocalChatUsage } from '../../shared/ipc-contract';
import type { Engine, EngineDeps, EngineSession, EngineStartOpts } from './types';
import { killProcTreeNow, stopProcTree } from './kill-tree';
import { LineAccumulator } from './stream-lines';
import { codexEffortArgs, codexMcpArgs, codexModelArgs } from './codex-config';
import { codexItemActivity } from '../../shared/tool-activity';

// Flags of a FRESH turn. workspace-write keeps parity of usefulness with a
// claude chat (the CLI can actually act on the project) while staying inside
// the sandbox; --skip-git-repo-check because a project dir is not always a
// git repo; --color never keeps stdout parseable.
const FRESH_FLAGS = ['--json', '--skip-git-repo-check', '--sandbox', 'workspace-write', '--color', 'never'];
// `exec resume` accepts a NARROWER flag set — passing --sandbox/--color there
// is "unexpected argument" (exit 2, live-verified on codex-cli 0.145.0); the
// resumed session keeps its original configuration.
const RESUME_FLAGS = ['--json', '--skip-git-repo-check'];

// Keep only the last few stderr lines — surfaced when a turn dies without a
// terminal JSONL event (spawn env broken, auth expired...).
const STDERR_TAIL_LINES = 5;

export type ReadMcpFn = (projectRoot: string) => Promise<McpServerConfig[]>;
export type ReadAgentFn = (slug: string, projectRoot?: string | null) => string | null;

// codex's turn.completed usage payload -> the IPC usage contract. Wire names are
// snake_case (live-verified: input_tokens, cached_input_tokens,
// cache_write_input_tokens, output_tokens, reasoning_output_tokens).
const USAGE_FIELDS: ReadonlyArray<[string, 'inputTokens' | 'cachedInputTokens' | 'cacheWriteInputTokens' | 'outputTokens' | 'reasoningOutputTokens']> = [
  ['input_tokens', 'inputTokens'],
  ['cached_input_tokens', 'cachedInputTokens'],
  ['cache_write_input_tokens', 'cacheWriteInputTokens'],
  ['output_tokens', 'outputTokens'],
  ['reasoning_output_tokens', 'reasoningOutputTokens'],
];

// A counter is copied ONLY when the payload really carries a number: an absent
// metric stays undefined, because a defaulted 0 would read as a measurement.
function codexUsage(raw: unknown, model?: string | null): LocalChatUsage {
  const wire = (raw ?? {}) as Record<string, unknown>;
  // codex bills a subscription and reports no dollar figure at all — null is
  // the honest value here, and an estimate would be an invented measurement.
  const usage: LocalChatUsage = { engine: 'codex', model: model ?? null, costUsd: null };
  for (const [key, field] of USAGE_FIELDS) {
    const v = wire[key];
    if (typeof v === 'number') usage[field] = v;
  }
  return usage;
}

export class CodexEngine implements Engine {
  readonly id = 'codex' as const;

  constructor(
    private readonly deps: EngineDeps,
    private readonly readMcp: ReadMcpFn = readMcpConfig,
    private readonly readAgent: ReadAgentFn = readClaudeAgentDefinition
  ) {}

  start({ sessionId, cwd, agent, model, effort, emit, onClose }: EngineStartOpts): EngineSession {
    const deps = this.deps;
    const readMcp = this.readMcp;
    // codex n'a pas de `--agent` (mesure du jour, codex-cli 0.146.0). La
    // definition est donc lue UNE fois au demarrage et mise en tete de chaque
    // tour. Lue une fois : un fichier qui change en cours de session ne doit pas
    // faire deriver la persona d'un tour a l'autre.
    const agentDefinition = agent ? this.readAgent(agent, cwd) : null;
    const state = {
      threadId: null as string | null,
      proc: null as ChildProcess | null,
      stopped: false,
      // codex numbers its items per PROCESS and runs one process per turn, so
      // 'item_1' comes back on EVERY turn of the same session (measured on
      // codex-cli 0.146: a fresh turn and its `exec resume` follow-up both
      // emitted item_0/item_1/item_2). Without this counter, turn 2's item_1
      // would be paired with turn 1's item_1 and the timeline would fuse two
      // unrelated steps into one.
      turns: 0,
    };

    // The session-default effort captured above is the baseline; a turn may
    // raise or lower it for itself alone.
    async function send(message: string, turnOpts?: LocalChatTurnOpts): Promise<void> {
      if (state.stopped) throw new IpcError('NOT_FOUND', 'Session locale absente ou fermée.');
      if (state.proc) throw new IpcError('INVALID_ARGUMENT', 'Un tour codex est déjà en cours pour cette session.');

      state.turns += 1;
      const turnKey = `t${state.turns}`;

      // Project-scoped MCP wiring, re-read each turn so an edited .mcp.json
      // applies without restarting the session. Unreadable file -> no MCP.
      let mcpArgs: string[] = [];
      try {
        mcpArgs = codexMcpArgs(await readMcp(cwd));
      } catch { /* malformed .mcp.json — chat still works, without MCP */ }

      const effortArgs = codexEffortArgs(turnOpts?.reasoningEffort ?? effort);

      // Resume takes the effort override but NOT -m. `-m` IS accepted on
      // `exec resume` (exit 0, measured) — the model stays session-scoped by
      // product decision, so changing model means opening a new session. That
      // is a choice, not a CLI limitation.
      const args = state.threadId
        ? ['exec', 'resume', state.threadId, ...RESUME_FLAGS, ...effortArgs, ...mcpArgs, '-']
        : ['exec', ...FRESH_FLAGS, ...codexModelArgs(model), ...effortArgs, ...mcpArgs, '-'];

      const bin = deps.resolveBin('codex') || 'codex';
      let proc: ChildProcess;
      try {
        proc = deps.spawnFn(bin, args, {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: deps.spawnEnv(),
          detached: process.platform !== 'win32',
        });
      } catch (err) {
        throw new IpcError('INTERNAL', `codex introuvable ou non lançable: ${err instanceof Error ? err.message : String(err)}`);
      }
      state.proc = proc;

      // The prompt goes through stdin ('-' positional above), then stdin
      // closes so codex knows the instructions are complete.
      // La persona part avec le tour, pas avec le processus : codex en lance un
      // par tour, il n'y a pas d'endroit ou l'installer une fois pour toutes.
      proc.stdin?.write(agentDefinition ? agentPreamble(agent as string, agentDefinition, message) : message);
      proc.stdin?.end();

      let sawTerminal = false;
      let lastAgentText: string | undefined;
      const stderrTail: string[] = [];
      const lines = new LineAccumulator();

      // A terminal frame ends the TURN at the protocol level; the process
      // finishes dying on its own a moment later. Freeing the slot here (not
      // at 'exit') lets the next send() start immediately — waiting for the
      // exit event made a fast follow-up turn bounce on "déjà en cours"
      // (caught by the live integration test against the real codex).
      const endTurn = (): void => {
        sawTerminal = true;
        if (state.proc === proc) state.proc = null;
      };

      const parse = (line: string): void => {
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(line) as Record<string, unknown>;
        } catch {
          return; // codex --json keeps stdout JSONL; ignore stray noise
        }
        // codex dates nothing: its frame keys are exactly {item,type} (measured
        // on codex-cli 0.146). The only instant available is the one where this
        // line is read, and it is stamped here rather than guessed later.
        const at = Date.now();
        switch (event.type) {
          case 'thread.started':
            if (typeof event.thread_id === 'string') state.threadId = event.thread_id;
            break;
          // item.started was IGNORED: during a long command codex reported
          // nothing until it finished, so a 60s build looked like a frozen app.
          // Measured shape: {id,type:'command_execution',command,status:'in_progress'}.
          case 'item.started': {
            const item = (event.item ?? {}) as { type?: string };
            if (item.type && item.type !== 'agent_message' && item.type !== 'reasoning') {
              emit({ type: 'tool', sessionId, tool: item, activity: codexItemActivity(item, { phase: 'start', at, idPrefix: turnKey }) ?? undefined });
            }
            break;
          }
          case 'item.completed': {
            const item = (event.item ?? {}) as { type?: string; text?: string };
            if (item.type === 'agent_message' && typeof item.text === 'string') {
              lastAgentText = item.text;
              emit({ type: 'chunk', sessionId, delta: item.text, role: 'assistant' });
            } else if (item.type === 'command_execution' || item.type === 'mcp_tool_call' || item.type === 'web_search' || item.type === 'file_change' || item.type === 'todo_list') {
              emit({ type: 'tool', sessionId, tool: item, activity: codexItemActivity(item, { phase: 'end', at, idPrefix: turnKey }) ?? undefined });
            }
            break;
          }
          case 'turn.completed':
            endTurn();
            emit({ type: 'complete', sessionId, result: lastAgentText, usage: codexUsage(event.usage, model) });
            break;
          case 'turn.failed': {
            endTurn();
            const err = (event.error ?? {}) as { message?: string };
            emit({ type: 'error', sessionId, error: `codex: ${err.message ?? 'le tour a échoué'}` });
            break;
          }
          case 'error':
            endTurn();
            emit({ type: 'error', sessionId, error: `codex: ${String(event.message ?? 'Erreur codex')}` });
            break;
          default:
            break;
        }
      };

      proc.stdout?.on('data', (chunk: Buffer) => {
        for (const line of lines.push(chunk)) parse(line);
      });
      proc.stdout?.on('end', () => {
        const tail = lines.flush();
        if (tail) parse(tail);
      });
      proc.stderr?.on('data', (chunk: Buffer) => {
        for (const l of chunk.toString().split('\n')) {
          const line = l.trim();
          if (!line) continue;
          stderrTail.push(line);
          if (stderrTail.length > STDERR_TAIL_LINES) stderrTail.shift();
        }
      });
      proc.on('error', (err: Error) => {
        if (state.proc === proc) state.proc = null;
        emit({ type: 'error', sessionId, error: `codex: ${err.message}` });
      });
      proc.on('exit', (code) => {
        const tail = lines.flush();
        if (tail) parse(tail);
        // Guarded: by exit time a NEW turn may already own the slot (the
        // terminal frame freed it) — never null out someone else's process.
        if (state.proc === proc) state.proc = null;
        // A turn that dies without turn.completed/failed is an error the user
        // must see — EXCEPT when the user just stopped the session.
        if (!sawTerminal && !state.stopped) {
          const detail = stderrTail.length ? ` — ${stderrTail.join(' ')}` : '';
          emit({ type: 'error', sessionId, error: `codex: sortie prématurée (code ${code ?? 'inconnu'})${detail}` });
        }
      });
    }

    return {
      send,
      stop(): void {
        state.stopped = true;
        if (state.proc) stopProcTree(state.proc);
        // No long-lived process to wait for: the session is gone now.
        onClose();
      },
      kill(): void {
        state.stopped = true;
        if (state.proc) killProcTreeNow(state.proc);
        onClose();
      },
    };
  }
}
