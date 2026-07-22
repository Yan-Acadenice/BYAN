// Preload — runs in an isolated context with access to a limited Node API.
// Bridges typed wrappers around ipcRenderer.invoke onto window.byanApi.
//
// Security baseline:
//   - contextIsolation: true (main/index.ts) -> exposeInMainWorld is the ONLY way out.
//   - sandbox: true        (main/index.ts) -> no fs/child_process from preload either.
//   - One single namespace `byanApi` so the renderer surface is auditable in one grep.
//
// Additionally exposes a `byanEvents` namespace for one-way main->renderer push
// events (e.g. native menu actions sent via webContents.send).

import { contextBridge, ipcRenderer } from 'electron';
import {
  ByanApi,
  IPC_CHANNELS,
  AuthLoginOptions,
  AuthResult,
  AuthSession,
  McpServer,
  McpServerInput,
  McpStatus,
  CliDetection,
  ServerSpawnResult,
  ServerStatus,
  OnboardingOpts,
  FileWritePlan,
  OnboardingResult,
  ByanApiListOpts,
  CreateConversationOpts,
  SendMessageOpts,
  LocalChatStartOpts,
  LocalChatSessionSummary,
  LocalChatHistoryMessage,
  TerminalOpenOpts,
  TerminalOpenResult,
  LocalProjectEntry,
  ProjectMatchQuery,
  UpdateState,
} from '../shared/ipc-contract';

// Thin invoke helper — keeps the per-method bodies a single line and ensures
// every call goes through the same path (easy to add tracing later).
// In dev mode (BYAN_DEV=1) every call is timed and logged via console.debug
// so the renderer DevTools shows IPC latency without extra plumbing.
const TRACE_IPC = process.env.BYAN_DEV === '1';

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  if (!TRACE_IPC) {
    return ipcRenderer.invoke(channel, ...args) as Promise<T>;
  }
  const t0 = performance.now();
  const p = ipcRenderer.invoke(channel, ...args) as Promise<T>;
  return p.finally(() => {
    const ms = (performance.now() - t0).toFixed(1);
    console.debug(`[ipc] ${channel} ${ms}ms`);
  });
}

const api: ByanApi = {
  auth: {
    login: (opts: AuthLoginOptions) => invoke<AuthResult>(IPC_CHANNELS.auth.login, opts),
    logout: () => invoke<void>(IPC_CHANNELS.auth.logout),
    getToken: () => invoke<string | null>(IPC_CHANNELS.auth.getToken),
    getSession: () => invoke<AuthSession>(IPC_CHANNELS.auth.getSession),
    switchMode: (opts: AuthLoginOptions) => invoke<AuthResult>(IPC_CHANNELS.auth.switchMode, opts)
  },
  fs: {
    openProjectDialog: () => invoke<string | null>(IPC_CHANNELS.fs.openProjectDialog),
    readFile: (filePath: string) => invoke<string>(IPC_CHANNELS.fs.readFile, filePath),
    pathExists: (filePath: string) => invoke<boolean>(IPC_CHANNELS.fs.pathExists, filePath),
    mkdir: (dirPath: string) => invoke<void>(IPC_CHANNELS.fs.mkdir, dirPath),
  },
  mcp: {
    list: () => invoke<McpServer[]>(IPC_CHANNELS.mcp.list),
    start: (id: string) => invoke<void>(IPC_CHANNELS.mcp.start, id),
    stop: (id: string) => invoke<void>(IPC_CHANNELS.mcp.stop, id),
    status: (id: string) => invoke<McpStatus>(IPC_CHANNELS.mcp.status, id),
    add: (input: McpServerInput) => invoke<McpServer>(IPC_CHANNELS.mcp.add, input),
    update: (input: McpServerInput) => invoke<McpServer>(IPC_CHANNELS.mcp.update, input),
    delete: (id: string) => invoke<void>(IPC_CHANNELS.mcp.delete, id)
  },
  cli: {
    detect: () => invoke<CliDetection>(IPC_CHANNELS.cli.detect),
  },
  onboarding: {
    preview: (opts: OnboardingOpts) =>
      invoke<FileWritePlan[]>(IPC_CHANNELS.onboarding.preview, opts),
    apply: (plans: FileWritePlan[]) =>
      invoke<OnboardingResult>(IPC_CHANNELS.onboarding.apply, plans),
  },
  server: {
    spawn: () => invoke<ServerSpawnResult>(IPC_CHANNELS.server.spawn),
    stop: () => invoke<void>(IPC_CHANNELS.server.stop),
    status: () => invoke<ServerStatus>(IPC_CHANNELS.server.status)
  },
  localChat: {
    start: (opts?: LocalChatStartOpts) => invoke<{ sessionId: string }>(IPC_CHANNELS.localChat.start, opts),
    send: (sessionId: string, message: string) => invoke<void>(IPC_CHANNELS.localChat.send, sessionId, message),
    stop: (sessionId: string) => invoke<void>(IPC_CHANNELS.localChat.stop, sessionId),
    list: () => invoke<LocalChatSessionSummary[]>(IPC_CHANNELS.localChat.list),
    history: (sessionId: string) => invoke<LocalChatHistoryMessage[]>(IPC_CHANNELS.localChat.history, sessionId)
  },
  terminal: {
    open: (opts: TerminalOpenOpts) => invoke<TerminalOpenResult>(IPC_CHANNELS.terminal.open, opts)
  },
  projectsLocal: {
    list: () => invoke<LocalProjectEntry[]>(IPC_CHANNELS.projectsLocal.list),
    record: (entry: LocalProjectEntry) => invoke<LocalProjectEntry>(IPC_CHANNELS.projectsLocal.record, entry),
    find: (query: ProjectMatchQuery) => invoke<LocalProjectEntry | null>(IPC_CHANNELS.projectsLocal.find, query),
    reveal: (dir: string) => invoke<{ ok: boolean; message?: string }>(IPC_CHANNELS.projectsLocal.reveal, dir)
  },
  app: {
    quit: () => invoke<void>(IPC_CHANNELS.app.quit),
    version: () => invoke<string>(IPC_CHANNELS.app.version),
    relaunch: () => invoke<void>(IPC_CHANNELS.app.relaunch),
    openExternal: (url: string) => invoke<void>(IPC_CHANNELS.app.openExternal, url)
  },
  update: {
    check: () => invoke<UpdateState>(IPC_CHANNELS.update.check),
    getState: () => invoke<UpdateState>(IPC_CHANNELS.update.getState),
    install: () => invoke<void>(IPC_CHANNELS.update.install)
  },
  store: {
    get: <T = unknown>(key: string) => invoke<T | null>(IPC_CHANNELS.store.get, key),
    set: <T>(key: string, value: T) => invoke<void>(IPC_CHANNELS.store.set, key, value)
  },
  byanWeb: {
    projects: {
      list: () => invoke(IPC_CHANNELS.byanWeb.projectsList),
      get: (id: string) => invoke(IPC_CHANNELS.byanWeb.projectsGet, id),
    },
    memory: {
      list: (opts?: ByanApiListOpts) => invoke(IPC_CHANNELS.byanWeb.memoryList, opts),
    },
    knowledge: {
      list: (opts?: ByanApiListOpts) => invoke(IPC_CHANNELS.byanWeb.knowledgeList, opts),
    },
    customAgents: {
      list: () => invoke(IPC_CHANNELS.byanWeb.customAgentsList),
    },
    sessions: {
      list: (opts?: Pick<ByanApiListOpts, 'projectId' | 'limit'>) =>
        invoke(IPC_CHANNELS.byanWeb.sessionsList, opts),
    },
    me: () => invoke(IPC_CHANNELS.byanWeb.me),
    chat: {
      conversations: {
        list: () => invoke(IPC_CHANNELS.byanWeb.chatConversationsList),
        create: (opts: CreateConversationOpts) =>
          invoke(IPC_CHANNELS.byanWeb.chatConversationsCreate, opts),
        delete: (id: string) =>
          invoke(IPC_CHANNELS.byanWeb.chatConversationsDelete, id),
      },
      messages: {
        list: (conversationId: string, opts?: { limit?: number }) =>
          invoke(IPC_CHANNELS.byanWeb.chatMessagesList, conversationId, opts),
      },
      stream: {
        start: (conversationId: string, message: string, opts?: SendMessageOpts) =>
          invoke<{ streamId: string }>(IPC_CHANNELS.byanWeb.chatStreamStart, conversationId, message, opts),
        abort: (streamId: string) =>
          invoke(IPC_CHANNELS.byanWeb.chatStreamAbort, streamId),
      },
    },
  }
};

contextBridge.exposeInMainWorld('byanApi', api);

// One-way event bridge: main can push events to the renderer via webContents.send.
// The renderer registers listeners via window.byanEvents.on(channel, callback).
// Callback is called with the event payload; unsubscribe by calling the returned fn.
//
// Security: only channels starting with 'byan:' are forwarded. This prevents a
// compromised renderer from subscribing to internal Electron channels.
contextBridge.exposeInMainWorld('byanEvents', {
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    if (!channel.startsWith('byan:')) return () => {};
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, handler);
    // Return cleanup function so callers can unsubscribe (avoids listener leaks).
    return () => ipcRenderer.removeListener(channel, handler);
  }
});
