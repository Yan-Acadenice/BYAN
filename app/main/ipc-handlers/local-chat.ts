// Local chat bridge (F2) — proxies the local `claude` CLI over IPC.
//
// The forked WebUI server (install/src/webui/server.js) already exposes a
// WebSocket chat protocol backed by a claude adapter. The renderer must NOT open
// a ws:// socket itself: the CSP forbids it and a sandboxed renderer has no
// business holding a socket. So MAIN owns the single ws:// connection to the
// local server and the renderer drives it over IPC — the local twin of the cloud
// SSE bridge in byan-web.ts.
//
// Wire protocol (client -> server): { type: 'chat-start', cli, agent }
//   { type: 'chat-send', sessionId, message } / { type: 'chat-stop', sessionId }.
// Server -> client: chat-started / chat / chat-tool / chat-complete / chat-error
//   / chat-stopped. We normalize these onto LocalChatMessage and broadcast them
// on byan:chat-local:message so the renderer never sees the wire shape.
//
// start() correlation: the server assigns the sessionId (no client-supplied id),
// so we FIFO-queue pending start() calls and resolve each with the next
// chat-started. Sessions are created one at a time in the UI, so FIFO is exact;
// the queue only guards the improbable concurrent-start case.

import type { IpcMain } from 'electron';
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS, LocalChatStartOpts, LocalChatMessage, LocalChatSessionSummary, LocalChatHistoryMessage } from '../../shared/ipc-contract';
import { IpcError, wrap } from './_error';
import type { LocalServer } from '../local-server';

// Minimal structural type so tests can inject a fake socket without the ws types.
export interface WsLike {
  readyState: number;
  on(event: string, cb: (...args: unknown[]) => void): void;
  send(data: string): void;
  close(): void;
}
export type WsFactory = (url: string) => WsLike;

// ws ships no bundled TS types. We only need the constructor and immediately cast
// to WsLike, so a typed require avoids pulling @types/ws for one call site.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WebSocketImpl: new (url: string) => WsLike = require('ws');

// ws readyState OPEN. Kept local so the fake socket in tests need not import ws.
const WS_OPEN = 1;
// A start-chat that never gets its chat-started must not hang the renderer.
const START_TIMEOUT_MS = 20_000;

export interface LocalChatDeps {
  // Yields the port of the running local server, or undefined when it is down.
  getPort: () => number | undefined;
  // Opens a WebSocket to the given url. Default: real ws. Overridden in tests.
  wsFactory?: WsFactory;
  // Pushes a normalized message to the renderer. Default: broadcast to all windows.
  broadcast?: (msg: LocalChatMessage) => void;
}

interface PendingStart {
  resolve: (v: { sessionId: string }) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class LocalChatBridge {
  private readonly getPort: () => number | undefined;
  private readonly wsFactory: WsFactory;
  private readonly broadcast: (msg: LocalChatMessage) => void;

  private ws: WsLike | null = null;
  private connecting: Promise<WsLike> | null = null;
  private readonly pendingStarts: PendingStart[] = [];

  constructor(deps: LocalChatDeps) {
    this.getPort = deps.getPort;
    this.wsFactory = deps.wsFactory ?? ((url: string) => new WebSocketImpl(url));
    this.broadcast = deps.broadcast ?? defaultBroadcast;
  }

  // Open (or reuse) the single ws connection to the local server.
  private ensureConnection(): Promise<WsLike> {
    if (this.ws && this.ws.readyState === WS_OPEN) return Promise.resolve(this.ws);
    if (this.connecting) return this.connecting;

    const port = this.getPort();
    if (!port) {
      return Promise.reject(new IpcError('NOT_IMPLEMENTED', 'Serveur local non démarré.'));
    }

    this.connecting = new Promise<WsLike>((resolve, reject) => {
      const ws = this.wsFactory(`ws://localhost:${port}`);

      ws.on('open', () => {
        this.ws = ws;
        this.connecting = null;
        resolve(ws);
      });

      ws.on('message', (raw: unknown) => this.onMessage(raw));

      ws.on('error', (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.connecting = null;
        this.failAllPending(`Connexion locale échouée: ${msg}`);
        // If we never opened, reject the connect promise so start() surfaces it.
        reject(new IpcError('INTERNAL', `Connexion locale échouée: ${msg}`));
      });

      ws.on('close', () => {
        if (this.ws === ws) this.ws = null;
        this.connecting = null;
        this.failAllPending('Connexion locale fermée.');
      });
    });

    return this.connecting;
  }

  // Parse a server frame, map to LocalChatMessage, broadcast, and resolve a
  // pending start() on chat-started.
  private onMessage(raw: unknown): void {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(typeof raw === 'string' ? raw : String(raw)) as Record<string, unknown>;
    } catch {
      return; // ignore non-JSON frames
    }

    const type = data.type as string;
    const sessionId = (data.sessionId as string) ?? null;

    switch (type) {
      case 'chat-started': {
        const started: LocalChatMessage = { type: 'started', sessionId: sessionId as string, cli: (data.cli as string) ?? 'claude' };
        this.resolveNextStart(sessionId as string);
        this.broadcast(started);
        break;
      }
      case 'chat':
        this.broadcast({ type: 'chunk', sessionId: sessionId as string, delta: (data.chunk as string) ?? '', role: 'assistant' });
        break;
      case 'chat-tool':
        this.broadcast({ type: 'tool', sessionId: sessionId as string, tool: data.tool });
        break;
      case 'chat-complete':
        this.broadcast({ type: 'complete', sessionId: sessionId as string, result: data.result });
        break;
      case 'chat-error':
        // A start-chat can fail before any sessionId exists — reject the pending start too.
        if (sessionId === null) this.failNextStart((data.error as string) ?? 'Erreur chat locale');
        this.broadcast({ type: 'error', sessionId, error: (data.error as string) ?? 'Erreur chat locale' });
        break;
      case 'chat-stopped':
        this.broadcast({ type: 'stopped', sessionId: sessionId as string });
        break;
      // subscribed / error / unknown types are not surfaced.
      default:
        break;
    }
  }

  private resolveNextStart(sessionId: string): void {
    const p = this.pendingStarts.shift();
    if (!p) return;
    clearTimeout(p.timer);
    p.resolve({ sessionId });
  }

  private failNextStart(message: string): void {
    const p = this.pendingStarts.shift();
    if (!p) return;
    clearTimeout(p.timer);
    p.reject(new IpcError('INTERNAL', message));
  }

  private failAllPending(message: string): void {
    while (this.pendingStarts.length) {
      const p = this.pendingStarts.shift();
      if (p) {
        clearTimeout(p.timer);
        p.reject(new IpcError('INTERNAL', message));
      }
    }
  }

  async start(opts?: LocalChatStartOpts): Promise<{ sessionId: string }> {
    const ws = await this.ensureConnection();
    return new Promise<{ sessionId: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.pendingStarts.findIndex((p) => p.timer === timer);
        if (idx !== -1) this.pendingStarts.splice(idx, 1);
        reject(new IpcError('INTERNAL', 'Démarrage de la session locale expiré.'));
      }, START_TIMEOUT_MS);
      this.pendingStarts.push({ resolve, reject, timer });
      ws.send(JSON.stringify({
        type: 'chat-start',
        cli: opts?.cli ?? 'claude',
        agent: opts?.agent ?? null,
        // Resume an existing record + reuse its cwd when asked (F3) ; otherwise
        // bind the fresh session to the given cwd (F4). Both omitted -> default.
        resumeSessionId: opts?.resumeSessionId ?? null,
        cwd: opts?.cwd ?? null,
      }));
    });
  }

  // List persisted local sessions via the local server's HTTP API. Read-only ;
  // returns [] when the server is down rather than throwing (the UI degrades).
  async list(): Promise<LocalChatSessionSummary[]> {
    const port = this.getPort();
    if (!port) return [];
    try {
      const res = await fetch(`http://localhost:${port}/api/chat/sessions`);
      if (!res.ok) return [];
      const body = (await res.json()) as { sessions?: LocalChatSessionSummary[] };
      return body.sessions ?? [];
    } catch {
      return [];
    }
  }

  // Load a session's stored messages so the renderer can seed the thread on resume.
  async history(sessionId: string): Promise<LocalChatHistoryMessage[]> {
    if (!sessionId) throw new IpcError('INVALID_ARGUMENT', 'sessionId requis');
    const port = this.getPort();
    if (!port) return [];
    try {
      const res = await fetch(`http://localhost:${port}/api/chat/session/${encodeURIComponent(sessionId)}`);
      if (!res.ok) return [];
      const body = (await res.json()) as { session?: { messages?: LocalChatHistoryMessage[] } };
      return body.session?.messages ?? [];
    } catch {
      return [];
    }
  }

  async send(sessionId: string, message: string): Promise<void> {
    if (!sessionId) throw new IpcError('INVALID_ARGUMENT', 'sessionId requis');
    const ws = await this.ensureConnection();
    ws.send(JSON.stringify({ type: 'chat-send', sessionId, message }));
  }

  async stop(sessionId: string): Promise<void> {
    if (!sessionId) throw new IpcError('INVALID_ARGUMENT', 'sessionId requis');
    // No connection means nothing to stop — treat as a no-op rather than error.
    if (!this.ws || this.ws.readyState !== WS_OPEN) return;
    this.ws.send(JSON.stringify({ type: 'chat-stop', sessionId }));
  }

  register(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_CHANNELS.localChat.start, wrap((_evt, opts?: LocalChatStartOpts) => this.start(opts)));
    ipcMain.handle(IPC_CHANNELS.localChat.send, wrap((_evt, sessionId: string, message: string) => this.send(sessionId, message)));
    ipcMain.handle(IPC_CHANNELS.localChat.stop, wrap((_evt, sessionId: string) => this.stop(sessionId)));
    ipcMain.handle(IPC_CHANNELS.localChat.list, wrap(() => this.list()));
    ipcMain.handle(IPC_CHANNELS.localChat.history, wrap((_evt, sessionId: string) => this.history(sessionId)));
  }
}

// Default broadcast: push to every open window (there is normally one). Mirrors
// the auth 'byan:auth:changed' fan-out. Guards destroyed webContents.
function defaultBroadcast(msg: LocalChatMessage): void {
  const wins = BrowserWindow?.getAllWindows?.() ?? [];
  for (const win of wins) {
    if (!win.webContents.isDestroyed()) {
      win.webContents.send('byan:chat-local:message', msg);
    }
  }
}

// ---- module-level singleton wiring (mirrors server.ts) ----

let _bridge: LocalChatBridge | null = null;

// Called by main/index.ts after the LocalServer is created. The bridge reads the
// live port from the server status on every connect, so a restart is transparent.
export function setLocalServerForChat(ls: LocalServer): void {
  _bridge = new LocalChatBridge({ getPort: () => ls.status().port });
}

// Test seam: inject a fully-built bridge (fake ws / broadcast).
export function _setBridgeForTests(bridge: LocalChatBridge | null): void {
  _bridge = bridge;
}

export function register(ipcMain: IpcMain): void {
  if (!_bridge) {
    // Not wired (no local server) — register no-op-safe handlers that report it.
    ipcMain.handle(IPC_CHANNELS.localChat.start, wrap(() => { throw new IpcError('NOT_IMPLEMENTED', 'Chat local non initialisé.'); }));
    ipcMain.handle(IPC_CHANNELS.localChat.send, wrap(() => { throw new IpcError('NOT_IMPLEMENTED', 'Chat local non initialisé.'); }));
    ipcMain.handle(IPC_CHANNELS.localChat.stop, wrap(() => { throw new IpcError('NOT_IMPLEMENTED', 'Chat local non initialisé.'); }));
    ipcMain.handle(IPC_CHANNELS.localChat.list, wrap(() => [] as LocalChatSessionSummary[]));
    ipcMain.handle(IPC_CHANNELS.localChat.history, wrap(() => [] as LocalChatHistoryMessage[]));
    return;
  }
  _bridge.register(ipcMain);
}
