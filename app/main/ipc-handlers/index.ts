// Aggregate registrar — installs all IPC handlers on the provided ipcMain.
// Called once from main/index.ts after app.whenReady().

import type { IpcMain, App } from 'electron';
import * as auth from './auth';
import * as fs from './fs';
import * as mcp from './mcp';
import * as cli from './cli';
import * as onboarding from './onboarding';
import * as server from './server';
import * as appHandlers from './app';
import * as store from './store';

export interface RegisterAllDeps {
  app: Pick<App, 'quit' | 'relaunch' | 'getVersion'>;
}

export function registerAll(ipcMain: IpcMain, deps: RegisterAllDeps): void {
  auth.register(ipcMain);
  fs.register(ipcMain);
  mcp.register(ipcMain);
  cli.register(ipcMain);
  onboarding.register(ipcMain);
  server.register(ipcMain);
  appHandlers.register(ipcMain, { app: deps.app });
  store.register(ipcMain);
}
