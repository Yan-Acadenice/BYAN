// Local projects IPC (F6) — expose the ~/.byan/projects.json registry to the
// renderer so Projects / ProjectDetail can show the local folder, and let the
// user open it in the OS file manager.

import type { IpcMain } from 'electron';
import { shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { IPC_CHANNELS, LocalProjectEntry, ProjectMatchQuery } from '../../shared/ipc-contract';
import { IpcError, wrap } from './_error';
import { readRegistry, upsertProject, findLocalPath } from '../projects-registry';

export async function list(): Promise<LocalProjectEntry[]> {
  return readRegistry().projects;
}

export async function record(entry: LocalProjectEntry): Promise<LocalProjectEntry> {
  if (!entry || typeof entry.path !== 'string' || !entry.path) {
    throw new IpcError('INVALID_ARGUMENT', 'record: path requis');
  }
  return upsertProject(entry);
}

export async function find(query: ProjectMatchQuery): Promise<LocalProjectEntry | null> {
  return findLocalPath(query ?? {});
}

// Open the folder in the OS file manager. shell.openPath returns '' on success
// or an error string ; we normalize to a boolean-ish result for the renderer.
//
// SECURITY: the IPC contract is the trust boundary, and shell.openPath LAUNCHES a
// file with its associated app (not just reveals it). So we only ever open an
// existing ABSOLUTE DIRECTORY — a renderer-supplied file/exe/URL is rejected.
// Same guard as F5's openTerminal(cwd).
export async function reveal(dir: string): Promise<{ ok: boolean; message?: string }> {
  if (!dir) throw new IpcError('INVALID_ARGUMENT', 'reveal: dossier requis');
  if (!path.isAbsolute(dir)) {
    return { ok: false, message: 'Le chemin doit être absolu.' };
  }
  try {
    if (!fs.statSync(dir).isDirectory()) {
      return { ok: false, message: 'Le chemin n\'est pas un dossier.' };
    }
  } catch {
    return { ok: false, message: 'Dossier introuvable.' };
  }
  const err = await shell.openPath(dir);
  return err ? { ok: false, message: err } : { ok: true };
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.projectsLocal.list, wrap(() => list()));
  ipcMain.handle(IPC_CHANNELS.projectsLocal.record, wrap((_evt, entry: LocalProjectEntry) => record(entry)));
  ipcMain.handle(IPC_CHANNELS.projectsLocal.find, wrap((_evt, query: ProjectMatchQuery) => find(query)));
  ipcMain.handle(IPC_CHANNELS.projectsLocal.reveal, wrap((_evt, dir: string) => reveal(dir)));
}
