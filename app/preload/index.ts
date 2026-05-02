// Preload — runs in an isolated context with access to a limited Node API.
// Bridges typed wrappers around ipcRenderer.invoke onto window.byanApi.
//
// Security baseline:
//   - contextIsolation: true (main/index.ts) -> exposeInMainWorld is the ONLY way out.
//   - sandbox: true        (main/index.ts) -> no fs/child_process from preload either.
//   - One single namespace `byanApi` so the renderer surface is auditable in one grep.

import { contextBridge, ipcRenderer } from 'electron';
import {
  ByanApi,
  IPC_CHANNELS,
  AuthLoginOptions,
  AuthResult,
  McpServer,
  McpStatus,
  CliDetection,
  ServerSpawnResult,
  ServerStatus,
  OnboardingOpts,
  FileWritePlan,
  OnboardingResult,
} from '../shared/ipc-contract';

// Thin invoke helper — keeps the per-method bodies a single line and ensures
// every call goes through the same path (easy to add tracing later).
function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

const api: ByanApi = {
  auth: {
    login: (opts: AuthLoginOptions) => invoke<AuthResult>(IPC_CHANNELS.auth.login, opts),
    logout: () => invoke<void>(IPC_CHANNELS.auth.logout),
    getToken: () => invoke<string | null>(IPC_CHANNELS.auth.getToken)
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
    status: (id: string) => invoke<McpStatus>(IPC_CHANNELS.mcp.status, id)
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
  app: {
    quit: () => invoke<void>(IPC_CHANNELS.app.quit),
    version: () => invoke<string>(IPC_CHANNELS.app.version),
    relaunch: () => invoke<void>(IPC_CHANNELS.app.relaunch)
  },
  store: {
    get: <T = unknown>(key: string) => invoke<T | null>(IPC_CHANNELS.store.get, key),
    set: <T>(key: string, value: T) => invoke<void>(IPC_CHANNELS.store.set, key, value)
  }
};

contextBridge.exposeInMainWorld('byanApi', api);
