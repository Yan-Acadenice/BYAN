// CLI detection handlers — F4 implementation.
// Replaces the F2 stub with real `which`/`where` probing via env-detect.ts.

import type { IpcMain } from 'electron';
import { IPC_CHANNELS, CliDetection } from '../../shared/ipc-contract';
import { wrap } from './_error';
import { detectAll } from '../env-detect';

export async function detect(): Promise<CliDetection> {
  return detectAll();
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.cli.detect, wrap(() => detect()));
}
