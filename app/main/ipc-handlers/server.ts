// Local BYAN WebUI server lifecycle IPC handlers — F3 implementation.
// Delegates to the LocalServer singleton created in main/index.ts.
// The singleton is injected via setLocalServer() at bootstrap time so that
// tests can swap in a mock without touching child_process.fork().

import type { IpcMain } from 'electron';
import { IPC_CHANNELS, ServerSpawnResult, ServerStatus } from '../../shared/ipc-contract';
import type { LocalServer } from '../local-server';
import { IpcError, wrap } from './_error';

// Module-level singleton — set once by main/index.ts before handlers are called.
let _localServer: LocalServer | null = null;

// Called by main/index.ts immediately after creating the LocalServer instance.
export function setLocalServer(ls: LocalServer): void {
  _localServer = ls;
}

function requireLocalServer(): LocalServer {
  if (!_localServer) {
    throw new IpcError('NOT_IMPLEMENTED', 'LocalServer not initialised');
  }
  return _localServer;
}

export async function spawn(): Promise<ServerSpawnResult> {
  const ls = requireLocalServer();
  const result = await ls.spawn();
  return { port: result.port, pid: result.pid };
}

export async function stop(): Promise<void> {
  const ls = requireLocalServer();
  await ls.stop();
}

export async function status(): Promise<ServerStatus> {
  const ls = requireLocalServer();
  const s = ls.status();
  if (s.running && s.port !== undefined && s.pid !== undefined) {
    return { running: true, port: s.port, pid: s.pid };
  }
  return { running: false };
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.server.spawn, wrap(() => spawn()));
  ipcMain.handle(IPC_CHANNELS.server.stop, wrap(() => stop()));
  ipcMain.handle(IPC_CHANNELS.server.status, wrap(() => status()));
}
