// Local chat bridge (N3) — NATIVE local claude, no web server in the middle.
//
// Earlier this file proxied a WebSocket to the forked WebUI server (F2, "the web
// clone"). N3 replaces that transport entirely: main spawns the local `claude`
// CLI directly in the project's directory. Because that directory holds the byan
// `.mcp.json` (written by the N2 installer), claude loads the byan MCP server on
// its own — the MCP channel is wired locally, zero cloud, zero token.
//
// Protocol: `claude --print --output-format stream-json --input-format stream-json`.
// User turns are written to stdin as {type:'user',content} JSON lines ; claude's
// stdout stream-json is parsed and normalized onto LocalChatMessage, broadcast on
// byan:chat-local:message (same contract as F2, so the renderer is unchanged).

import type { IpcMain } from 'electron';
import { BrowserWindow } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { IPC_CHANNELS, LocalChatStartOpts, LocalChatMessage, LocalChatSessionSummary, LocalChatHistoryMessage } from '../../shared/ipc-contract';
import { IpcError, wrap } from './_error';
import type { LocalServer } from '../local-server';
import { localSessions, resolveProjectRoot } from '../local-data';

// A spawn signature narrow enough for tests to inject a fake process.
export type SpawnFn = (cmd: string, args: string[], opts: { cwd: string; stdio: [string, string, string] }) => ChildProcess;

interface Session {
  proc: ChildProcess;
  buffer: string; // stdout line buffer
}

export interface LocalClaudeDeps {
  // Spawner (default: child_process.spawn). Injected in tests.
  spawnFn?: SpawnFn;
  // Push a normalized message to the renderer. Default: broadcast to all windows.
  broadcast?: (msg: LocalChatMessage) => void;
  // Default cwd when a start() omits one : the first local project (registry).
  defaultCwd?: () => string | undefined;
}

// Cap on concurrent local claude processes — a runaway renderer looping start()
// must not spawn unbounded subprocesses (local resource exhaustion).
const MAX_SESSIONS = 8;
// Grace period after SIGTERM before we force-kill a claude that ignores it.
const SIGKILL_GRACE_MS = 3_000;

export class LocalClaudeBridge {
  private readonly spawnFn: SpawnFn;
  private readonly broadcast: (msg: LocalChatMessage) => void;
  private readonly defaultCwd: () => string | undefined;
  private readonly sessions = new Map<string, Session>();

  constructor(deps: LocalClaudeDeps = {}) {
    this.spawnFn = deps.spawnFn ?? (spawn as unknown as SpawnFn);
    this.broadcast = deps.broadcast ?? defaultBroadcast;
    this.defaultCwd = deps.defaultCwd ?? (() => resolveProjectRoot() ?? undefined);
  }

  // Spawn a local claude in the project directory. cwd must be an existing
  // absolute dir (trust boundary : same guard as N2/F5). The byan MCP server is
  // picked up from that dir's .mcp.json — no explicit config needed.
  async start(opts?: LocalChatStartOpts): Promise<{ sessionId: string }> {
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new IpcError('INVALID_ARGUMENT', `Trop de sessions locales ouvertes (max ${MAX_SESSIONS}). Ferme-en une.`);
    }
    const cwd = opts?.cwd || this.defaultCwd() || '';
    if (!cwd || !path.isAbsolute(cwd)) {
      throw new IpcError('INVALID_ARGUMENT', 'Session locale : aucun dossier de projet valide (choisis-en un).');
    }
    try {
      if (!fs.statSync(cwd).isDirectory()) throw new IpcError('INVALID_ARGUMENT', 'Le dossier de projet est introuvable.');
    } catch (err) {
      if (err instanceof IpcError) throw err;
      throw new IpcError('INVALID_ARGUMENT', 'Le dossier de projet est introuvable.');
    }

    const args = ['--print', '--output-format', 'stream-json', '--input-format', 'stream-json'];
    if (opts?.agent) args.push('--agent', opts.agent);
    // NOTE: no --resume here. A byan session record id is NOT claude's own
    // session uuid, so passing it to --resume would fail. "Reprendre" a session
    // in native mode = reopen claude in that project's dir (the renderer passes
    // its cwd) ; true context-reattach needs claude's uuid persisted first (suite).

    let proc: ChildProcess;
    try {
      proc = this.spawnFn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      throw new IpcError('INTERNAL', `claude introuvable ou non lançable: ${err instanceof Error ? err.message : String(err)}`);
    }

    const sessionId = randomUUID();
    const session: Session = { proc, buffer: '' };
    this.sessions.set(sessionId, session);

    proc.stdout?.on('data', (chunk: Buffer) => this.onStdout(sessionId, chunk));
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      // claude prints progress/status to stderr — only surface a real error.
      if (text && !/^(Initializing|Loading|Connected|Session|Warming|Cost:|Token)/m.test(text)) {
        this.broadcast({ type: 'error', sessionId, error: `claude: ${text}` });
      }
    });
    proc.on('error', (err: Error) => {
      this.broadcast({ type: 'error', sessionId, error: `claude: ${err.message}` });
      this.sessions.delete(sessionId);
    });
    proc.on('exit', () => { this.sessions.delete(sessionId); });

    this.broadcast({ type: 'started', sessionId, cli: 'claude' });
    return { sessionId };
  }

  async send(sessionId: string, message: string): Promise<void> {
    if (!sessionId) throw new IpcError('INVALID_ARGUMENT', 'sessionId requis');
    const session = this.sessions.get(sessionId);
    if (!session || !session.proc.stdin || !session.proc.stdin.writable) {
      throw new IpcError('NOT_FOUND', 'Session locale absente ou fermée.');
    }
    session.proc.stdin.write(JSON.stringify({ type: 'user', content: message }) + '\n');
  }

  async stop(sessionId: string): Promise<void> {
    if (!sessionId) throw new IpcError('INVALID_ARGUMENT', 'sessionId requis');
    const session = this.sessions.get(sessionId);
    if (!session) return; // nothing to stop — no-op
    const proc = session.proc;
    try { proc.kill('SIGTERM'); } catch { /* already gone */ }
    // Force-kill if claude ignores SIGTERM within the grace period.
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* gone */ } }, SIGKILL_GRACE_MS);
    if (typeof (timer as { unref?: () => void }).unref === 'function') (timer as { unref: () => void }).unref();
    proc.once('exit', () => clearTimeout(timer));
    this.sessions.delete(sessionId);
    this.broadcast({ type: 'stopped', sessionId });
  }

  // Persisted local sessions come from disk (N1 local-data), not a cloud/server.
  async list(): Promise<LocalChatSessionSummary[]> {
    return localSessions({ limit: 50 }).map((s) => ({
      id: s.id,
      cli: 'claude',
      agent: s.agent_slug,
      cwd: typeof s.project_id === 'string' ? s.project_id : null,
      resumable: false,
      created: s.created_at,
      updated: s.updated_at,
      messageCount: 0,
      lastMessage: null,
    }));
  }

  // Native sessions are live processes ; there is no separate on-disk transcript
  // to seed from yet, so history is empty (claude owns its own context on resume).
  async history(_sessionId: string): Promise<LocalChatHistoryMessage[]> {
    return [];
  }

  // Parse claude's stream-json stdout line by line and normalize to LocalChatMessage.
  private onStdout(sessionId: string, chunk: Buffer): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.buffer += chunk.toString();
    const lines = session.buffer.split('\n');
    session.buffer = lines.pop() || '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      this.parseLine(sessionId, line);
    }
  }

  private parseLine(sessionId: string, line: string): void {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // Non-JSON line — treat as a raw assistant chunk.
      this.broadcast({ type: 'chunk', sessionId, delta: line, role: 'assistant' });
      return;
    }
    switch (event.type) {
      case 'assistant': {
        const msg = (event.message as { content?: unknown })?.content ?? event.content ?? [];
        const items = Array.isArray(msg) ? msg : [msg];
        for (const item of items) {
          if (typeof item === 'string') this.broadcast({ type: 'chunk', sessionId, delta: item, role: 'assistant' });
          else if (item && (item as { type?: string }).type === 'text') this.broadcast({ type: 'chunk', sessionId, delta: (item as { text?: string }).text ?? '', role: 'assistant' });
          else if (item && (item as { type?: string }).type === 'tool_use') this.broadcast({ type: 'tool', sessionId, tool: item });
        }
        break;
      }
      case 'content_block_delta': {
        const delta = event.delta as { type?: string; text?: string } | undefined;
        if (delta?.type === 'text_delta') this.broadcast({ type: 'chunk', sessionId, delta: delta.text ?? '', role: 'assistant' });
        break;
      }
      case 'tool_use':
        this.broadcast({ type: 'tool', sessionId, tool: event });
        break;
      case 'result':
        this.broadcast({ type: 'complete', sessionId, result: event.result });
        break;
      case 'error':
        this.broadcast({ type: 'error', sessionId, error: String(event.error || event.message || 'Erreur claude') });
        break;
      default:
        break;
    }
  }

  register(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_CHANNELS.localChat.start, wrap((_evt, opts?: LocalChatStartOpts) => this.start(opts)));
    ipcMain.handle(IPC_CHANNELS.localChat.send, wrap((_evt, sessionId: string, message: string) => this.send(sessionId, message)));
    ipcMain.handle(IPC_CHANNELS.localChat.stop, wrap((_evt, sessionId: string) => this.stop(sessionId)));
    ipcMain.handle(IPC_CHANNELS.localChat.list, wrap(() => this.list()));
    ipcMain.handle(IPC_CHANNELS.localChat.history, wrap((_evt, sessionId: string) => this.history(sessionId)));
  }
}

// Default broadcast: push to every open window. Guards destroyed webContents.
function defaultBroadcast(msg: LocalChatMessage): void {
  const wins = BrowserWindow?.getAllWindows?.() ?? [];
  for (const win of wins) {
    if (!win.webContents.isDestroyed()) win.webContents.send('byan:chat-local:message', msg);
  }
}

// ---- module-level singleton wiring ----

let _bridge: LocalClaudeBridge | null = null;

// Kept for call-site compatibility with main/index.ts. The native bridge does
// not need the local server ; it spawns claude directly in the project dir.
export function setLocalServerForChat(_ls: LocalServer): void {
  _bridge = new LocalClaudeBridge();
}

// Test seam: inject a fully-built bridge (fake spawn / broadcast).
export function _setBridgeForTests(bridge: LocalClaudeBridge | null): void {
  _bridge = bridge;
}

export function register(ipcMain: IpcMain): void {
  if (!_bridge) _bridge = new LocalClaudeBridge();
  _bridge.register(ipcMain);
}
