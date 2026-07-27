// App lifecycle handlers — these can be implemented now since they only
// touch electron.app APIs that already exist; no external system integration needed.
//
// We keep the app import lazy via a getter so unit tests can inject a fake
// Electron app object without spinning up the real runtime.

import type { App, IpcMain } from 'electron';
import { shell } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-contract';
import { IpcError, wrap } from './_error';

export interface AppDeps {
  app: Pick<App, 'quit' | 'relaunch' | 'getVersion' | 'getPath'>;
}

// Security: renderer-supplied URLs must be https only.
// This prevents opening file://, javascript:, or arbitrary protocol handlers.
function assertHttpsUrl(url: unknown): asserts url is string {
  if (typeof url !== 'string' || url.length === 0) {
    throw new IpcError('INVALID_ARGUMENT', 'openExternal: url must be a non-empty string');
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new IpcError('INVALID_ARGUMENT', `openExternal: invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new IpcError('INVALID_ARGUMENT', `openExternal: only https:// URLs are allowed (got ${parsed.protocol})`);
  }
}

export function makeHandlers(deps: AppDeps) {
  return {
    quit: async (): Promise<void> => {
      deps.app.quit();
    },
    version: async (): Promise<string> => {
      return deps.app.getVersion();
    },
    relaunch: async (): Promise<void> => {
      deps.app.relaunch();
      deps.app.quit();
    },
    openExternal: async (url: string): Promise<void> => {
      assertHttpsUrl(url);
      await shell.openExternal(url);
    },
    // No renderer-supplied path: the directory comes from Electron itself, so
    // this cannot be steered into opening an arbitrary folder.
    openLogs: async (): Promise<{ ok: boolean; path: string; message?: string }> => {
      const dir = deps.app.getPath('logs');
      // openPath returns '' on success and an error STRING on failure — it does
      // not throw, so an empty result is the only success signal.
      const message = await shell.openPath(dir);
      return message ? { ok: false, path: dir, message } : { ok: true, path: dir };
    }
  };
}

export function register(ipcMain: IpcMain, deps: AppDeps): void {
  const h = makeHandlers(deps);
  ipcMain.handle(IPC_CHANNELS.app.quit, wrap(() => h.quit()));
  ipcMain.handle(IPC_CHANNELS.app.version, wrap(() => h.version()));
  ipcMain.handle(IPC_CHANNELS.app.relaunch, wrap(() => h.relaunch()));
  ipcMain.handle(IPC_CHANNELS.app.openExternal, wrap((_event: unknown, url: string) => h.openExternal(url)));
  ipcMain.handle(IPC_CHANNELS.app.openLogs, wrap(() => h.openLogs()));
}
