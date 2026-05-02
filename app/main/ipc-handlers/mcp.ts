// MCP handlers — STUB for F2.
// Real implementation lands in F14 (MCP control plane: registry, lifecycle, health).
// The shapes returned here mirror the BYAN MCP catalog so the renderer can
// build the MCP panel against them today.

import type { IpcMain } from 'electron';
import { IPC_CHANNELS, McpServer, McpStatus } from '../../shared/ipc-contract';
import { IpcError, wrap } from './_error';

// In-memory stub registry — replaced by a real MCP manager in F14.
const STUB_SERVERS: McpServer[] = [
  {
    id: 'byan',
    name: 'byan',
    transport: 'stdio',
    command: 'node',
    args: ['_byan/mcp/byan-mcp-server.js'],
    enabled: true,
    status: { state: 'stopped' }
  }
];

export async function list(): Promise<McpServer[]> {
  // TODO(F14): read from .mcp.json + live process registry.
  return STUB_SERVERS.map((s) => ({ ...s }));
}

function findOrThrow(id: string): McpServer {
  if (typeof id !== 'string' || id.length === 0) {
    throw new IpcError('INVALID_ARGUMENT', 'mcp: id must be a non-empty string');
  }
  const server = STUB_SERVERS.find((s) => s.id === id);
  if (!server) {
    throw new IpcError('NOT_FOUND', `mcp: server "${id}" not found`);
  }
  return server;
}

export async function start(id: string): Promise<void> {
  findOrThrow(id);
  // TODO(F14): spawn child process, attach stdio, track pid.
  return;
}

export async function stop(id: string): Promise<void> {
  findOrThrow(id);
  // TODO(F14): SIGTERM then SIGKILL after grace period.
  return;
}

export async function status(id: string): Promise<McpStatus> {
  const server = findOrThrow(id);
  return server.status;
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.mcp.list, wrap(() => list()));
  ipcMain.handle(IPC_CHANNELS.mcp.start, wrap((_evt, id: string) => start(id)));
  ipcMain.handle(IPC_CHANNELS.mcp.stop, wrap((_evt, id: string) => stop(id)));
  ipcMain.handle(IPC_CHANNELS.mcp.status, wrap((_evt, id: string) => status(id)));
}
