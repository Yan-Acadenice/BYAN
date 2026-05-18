// Update handlers — F9: bridges the AutoUpdaterManager onto IPC.
//
// State changes are broadcast to all renderer windows via the
// 'byan:update:status' event channel so the banner stays in sync without polling.

import { BrowserWindow, type IpcMain } from 'electron';
import { IPC_CHANNELS, type UpdateState } from '../../shared/ipc-contract';
import { wrap } from './_error';
import { AutoUpdaterManager } from '../auto-updater';

const STATUS_EVENT_CHANNEL = 'byan:update:status';

let manager: AutoUpdaterManager = new AutoUpdaterManager();

// Test-only escape hatch.
export function _setManagerForTests(next: AutoUpdaterManager): void {
  manager = next;
}

export function getManager(): AutoUpdaterManager {
  return manager;
}

export async function check(): Promise<UpdateState> {
  return manager.checkNow();
}

export async function getState(): Promise<UpdateState> {
  return manager.getState();
}

export async function install(): Promise<void> {
  manager.installNow();
}

function broadcast(state: UpdateState): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) {
      win.webContents.send(STATUS_EVENT_CHANNEL, state);
    }
  }
}

export function register(ipcMain: IpcMain): void {
  manager.onStateChange(broadcast);
  ipcMain.handle(IPC_CHANNELS.update.check, wrap(() => check()));
  ipcMain.handle(IPC_CHANNELS.update.getState, wrap(() => getState()));
  ipcMain.handle(IPC_CHANNELS.update.install, wrap(() => install()));
}
