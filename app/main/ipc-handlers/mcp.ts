// MCP handlers — F14 implementation.
//
// Responsibilities:
//   1. list()    → reads .mcp.json from the user's project root (resolved via the
//                  store key 'onboarding.projectRoot') and merges with the live
//                  process registry to fill in runtime state.
//   2. start()   → spawns the child process for an enabled stdio server.
//   3. stop()    → SIGTERM the child; exit listener flips state to 'stopped'.
//   4. status()  → returns the registry's current view for that id.
//
// Status changes from the registry are broadcast to all renderer windows via
// the 'byan:mcp:statusChange' channel. The renderer subscribes through
// byanEvents.on and keeps its UI in sync without polling.

import { BrowserWindow, type IpcMain } from 'electron';
import { IPC_CHANNELS, type McpServer, type McpServerInput, type McpStatus } from '../../shared/ipc-contract';
import { IpcError, wrap } from './_error';
import {
  addMcpServer,
  deleteMcpServer,
  McpConfigError,
  readMcpConfig,
  updateMcpServer,
  type McpServerConfig,
} from '../mcp-config';
import { McpProcessRegistry } from '../mcp-registry';
import { get as storeGet } from './store';

const PROJECT_ROOT_KEY = 'onboarding.projectRoot';
const STATUS_EVENT_CHANNEL = 'byan:mcp:statusChange';

let registry: McpProcessRegistry = new McpProcessRegistry();
let projectRootOverride: string | null = null;

// Test-only escape hatch: lets unit tests inject a clean registry and a fixed
// project root without going through the real store / Electron.
export function _setRegistryForTests(next: McpProcessRegistry): void {
  registry = next;
}
export function _setProjectRootForTests(root: string | null): void {
  projectRootOverride = root;
}

async function resolveProjectRoot(): Promise<string | null> {
  if (projectRootOverride !== null) return projectRootOverride;
  try {
    const root = await storeGet<string>(PROJECT_ROOT_KEY);
    return typeof root === 'string' && root.length > 0 ? root : null;
  } catch {
    return null;
  }
}

async function loadConfig(): Promise<McpServerConfig[]> {
  const root = await resolveProjectRoot();
  if (!root) return [];
  return readMcpConfig(root);
}

function toMcpServer(cfg: McpServerConfig, status: McpStatus): McpServer {
  return {
    id: cfg.id,
    name: cfg.name,
    transport: cfg.transport,
    command: cfg.command,
    args: cfg.args,
    enabled: cfg.enabled,
    status,
  };
}

export async function list(): Promise<McpServer[]> {
  const cfgs = await loadConfig();
  return cfgs.map((c) => toMcpServer(c, registry.getStatus(c.id)));
}

async function findOrThrow(id: string): Promise<McpServerConfig> {
  if (typeof id !== 'string' || id.length === 0) {
    throw new IpcError('INVALID_ARGUMENT', 'mcp: id must be a non-empty string');
  }
  const cfgs = await loadConfig();
  const cfg = cfgs.find((c) => c.id === id);
  if (!cfg) throw new IpcError('NOT_FOUND', `mcp: server "${id}" not found`);
  return cfg;
}

export async function start(id: string): Promise<void> {
  const cfg = await findOrThrow(id);
  if (!cfg.enabled) {
    throw new IpcError('PERMISSION_DENIED', `mcp: server "${id}" is disabled in .mcp.json`);
  }
  if (cfg.transport !== 'stdio') {
    throw new IpcError('UNAVAILABLE', `mcp: transport "${cfg.transport}" is not managed locally`);
  }
  try {
    await registry.start(cfg);
  } catch (err) {
    throw new IpcError('INTERNAL', err instanceof Error ? err.message : String(err));
  }
}

export async function stop(id: string): Promise<void> {
  await findOrThrow(id);
  await registry.stop(id);
}

// Kill every running MCP child — called from main's before-quit so a
// Settings-started stdio server does not orphan when the app exits.
export function stopAllMcp(): void {
  registry.stopAll();
}

export async function status(id: string): Promise<McpStatus> {
  await findOrThrow(id);
  return registry.getStatus(id);
}

export async function add(input: McpServerInput): Promise<McpServer> {
  const root = await resolveProjectRoot();
  if (!root) {
    throw new IpcError('UNAVAILABLE', 'mcp: no project root configured — complete onboarding first');
  }
  try {
    const cfg = await addMcpServer(root, input);
    return toMcpServer(cfg, registry.getStatus(cfg.id));
  } catch (err) {
    if (err instanceof McpConfigError) {
      throw new IpcError(err.code, err.message);
    }
    throw new IpcError('INTERNAL', err instanceof Error ? err.message : String(err));
  }
}

// Updates an existing entry. If the server is currently running, we stop it
// first so the next start picks up the new command/args/env. The renderer is
// expected to refresh its list after a successful update.
export async function update(input: McpServerInput): Promise<McpServer> {
  const root = await resolveProjectRoot();
  if (!root) {
    throw new IpcError('UNAVAILABLE', 'mcp: no project root configured — complete onboarding first');
  }
  if (input && typeof input.id === 'string' && registry.isRunning(input.id)) {
    await registry.stop(input.id);
  }
  try {
    const cfg = await updateMcpServer(root, input);
    return toMcpServer(cfg, registry.getStatus(cfg.id));
  } catch (err) {
    if (err instanceof McpConfigError) {
      throw new IpcError(err.code, err.message);
    }
    throw new IpcError('INTERNAL', err instanceof Error ? err.message : String(err));
  }
}

// Removes an entry. If the server is running we stop it first to free the
// child process; otherwise removing the config silently leaves an orphan.
export async function remove(id: string): Promise<void> {
  if (typeof id !== 'string' || id.length === 0) {
    throw new IpcError('INVALID_ARGUMENT', 'mcp: id must be a non-empty string');
  }
  const root = await resolveProjectRoot();
  if (!root) {
    throw new IpcError('UNAVAILABLE', 'mcp: no project root configured — complete onboarding first');
  }
  if (registry.isRunning(id)) {
    await registry.stop(id);
  }
  try {
    await deleteMcpServer(root, id);
  } catch (err) {
    if (err instanceof McpConfigError) {
      throw new IpcError(err.code, err.message);
    }
    throw new IpcError('INTERNAL', err instanceof Error ? err.message : String(err));
  }
}

function broadcastStatus(id: string, next: McpStatus): void {
  const payload = { id, status: next };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) {
      win.webContents.send(STATUS_EVENT_CHANNEL, payload);
    }
  }
}

export function register(ipcMain: IpcMain): void {
  registry.onStatusChange(broadcastStatus);
  ipcMain.handle(IPC_CHANNELS.mcp.list, wrap(() => list()));
  ipcMain.handle(IPC_CHANNELS.mcp.start, wrap((_evt, id: string) => start(id)));
  ipcMain.handle(IPC_CHANNELS.mcp.stop, wrap((_evt, id: string) => stop(id)));
  ipcMain.handle(IPC_CHANNELS.mcp.status, wrap((_evt, id: string) => status(id)));
  ipcMain.handle(IPC_CHANNELS.mcp.add, wrap((_evt, input: McpServerInput) => add(input)));
  ipcMain.handle(IPC_CHANNELS.mcp.update, wrap((_evt, input: McpServerInput) => update(input)));
  ipcMain.handle(IPC_CHANNELS.mcp.delete, wrap((_evt, id: string) => remove(id)));
}
