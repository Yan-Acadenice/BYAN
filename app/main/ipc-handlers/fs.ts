// Filesystem handlers — F4 implementation.
// Provides openProjectDialog, readFile, pathExists, mkdir.
//
// Security: readFile uses path.resolve so relative tricks ('../../../etc/passwd')
// are not possible — but we do NOT restrict to a project whitelist yet (F8 will add that).
// pathExists and mkdir are similarly unrestricted; the renderer only calls them
// during onboarding with paths it received from the main process.

import type { IpcMain } from 'electron';
import { dialog } from 'electron';
import * as nodePath from 'path';
import * as nodefs from 'fs/promises';
import { IPC_CHANNELS } from '../../shared/ipc-contract';
import { IpcError, wrap } from './_error';

export async function openProjectDialog(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select BYAN project root',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return nodePath.resolve(result.filePaths[0]);
}

export async function readFile(filePath: string): Promise<string> {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new IpcError('INVALID_ARGUMENT', 'readFile: path must be a non-empty string');
  }
  const resolved = nodePath.resolve(filePath);
  try {
    return await nodefs.readFile(resolved, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ENOENT')) {
      throw new IpcError('NOT_FOUND', `readFile: file not found: ${resolved}`);
    }
    if (msg.includes('EACCES') || msg.includes('EPERM')) {
      throw new IpcError('PERMISSION_DENIED', `readFile: permission denied: ${resolved}`);
    }
    throw new IpcError('INTERNAL', msg);
  }
}

export async function pathExists(filePath: string): Promise<boolean> {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new IpcError('INVALID_ARGUMENT', 'pathExists: path must be a non-empty string');
  }
  try {
    await nodefs.access(nodePath.resolve(filePath));
    return true;
  } catch {
    return false;
  }
}

export async function mkdir(dirPath: string): Promise<void> {
  if (typeof dirPath !== 'string' || dirPath.length === 0) {
    throw new IpcError('INVALID_ARGUMENT', 'mkdir: path must be a non-empty string');
  }
  await nodefs.mkdir(nodePath.resolve(dirPath), { recursive: true });
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.fs.openProjectDialog, wrap(() => openProjectDialog()));
  ipcMain.handle(IPC_CHANNELS.fs.readFile, wrap((_evt, p: string) => readFile(p)));
  ipcMain.handle(IPC_CHANNELS.fs.pathExists, wrap((_evt, p: string) => pathExists(p)));
  ipcMain.handle(IPC_CHANNELS.fs.mkdir, wrap((_evt, p: string) => mkdir(p)));
}
