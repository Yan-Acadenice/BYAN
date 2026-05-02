// Generic key-value store handlers — backed by SecureStore (F6).
//
// All values go through the OS keychain (keytar) or the user-scoped fallback
// .env file. The in-memory Map stub from F2 is intentionally removed.
//
// Public API (get / set) is unchanged so existing tests continue to pass.

import type { IpcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-contract';
import { IpcError, wrap } from './_error';
import { secureStore, _resetKeytarState } from '../secure-store';

function assertValidKey(key: unknown): asserts key is string {
  if (typeof key !== 'string' || key.length === 0) {
    throw new IpcError('INVALID_ARGUMENT', 'store: key must be a non-empty string');
  }
}

export async function get<T>(key: string): Promise<T | null> {
  assertValidKey(key);
  // SecureStore stores strings. For backwards-compat with F2 callers that
  // stored arbitrary objects, we attempt JSON.parse — fall back to raw string.
  const raw = await secureStore.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

export async function set<T>(key: string, value: T): Promise<void> {
  assertValidKey(key);
  // SecureStore only accepts strings — serialize objects as JSON.
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  await secureStore.set(key, serialized);
}

// Test-only escape hatch. Not exported via the IPC surface.
export function _resetForTests(): void {
  secureStore._resetForTests();
  _resetKeytarState();
}

// Re-export for tests that need to manipulate the keytar probe state.
export { _resetKeytarState } from '../secure-store';

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.store.get, wrap((_evt, key: string) => get(key)));
  ipcMain.handle(IPC_CHANNELS.store.set, wrap((_evt, key: string, value: unknown) => set(key, value)));
}
