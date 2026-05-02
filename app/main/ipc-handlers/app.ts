// App lifecycle handlers — these can be implemented now since they only
// touch electron.app APIs that already exist; no external system integration needed.
//
// We keep the app import lazy via a getter so unit tests can inject a fake
// Electron app object without spinning up the real runtime.

import type { App, IpcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-contract';
import { wrap } from './_error';

export interface AppDeps {
  app: Pick<App, 'quit' | 'relaunch' | 'getVersion'>;
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
    }
  };
}

export function register(ipcMain: IpcMain, deps: AppDeps): void {
  const h = makeHandlers(deps);
  ipcMain.handle(IPC_CHANNELS.app.quit, wrap(() => h.quit()));
  ipcMain.handle(IPC_CHANNELS.app.version, wrap(() => h.version()));
  ipcMain.handle(IPC_CHANNELS.app.relaunch, wrap(() => h.relaunch()));
}
