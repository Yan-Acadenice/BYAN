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

// The generic store shares its SecureStore backend with the auth session keys
// (auth.token / auth.mode / auth.url — see auth.ts). The renderer must NEVER
// read or write those through this channel: the token would otherwise be one
// store.get away from renderer memory, voiding the secure-store invariant.
// Prefix ALLOWLIST (not a blocklist) so any future sensitive main-side key is
// protected by default. `app.` carries app.locale (i18n) — the auth session
// keys live under `auth.`, which stays outside the list.
const RENDERER_KEY_PREFIXES = ['app.', 'chat.', 'login.', 'onboarding.', 'ui.', 'user.'];

function assertRendererKey(key: string): void {
  const allowed = RENDERER_KEY_PREFIXES.some((p) => key.startsWith(p) && key.length > p.length);
  if (!allowed) {
    throw new IpcError(
      'PERMISSION_DENIED',
      `store: la clé "${key}" est hors de l'espace autorisé (préfixes: ${RENDERER_KEY_PREFIXES.join(' ')}).`
    );
  }
}

// Keys whose value can be supplied by the E2E harness via env vars when the
// secure-store has nothing yet. WHY: Playwright spawns the packaged binary
// against a fresh tmp dir (no keytar entries, no .env); without this fallback
// every test would land on Onboarding step 1, which is exactly the bug the
// 4 e2e specs were hitting before this hook was added.
const E2E_KEY_TO_ENV: Record<string, string> = {
  'onboarding.projectRoot': 'BYAN_E2E_TMP_PROJECT_ROOT',
};

// Keys to ignore (return null) under E2E mode. Keytar is process-global on
// Linux (gnome-keyring service "byan") so specs share state across runs.
// e.g. login-local persists login.lastMode='local' which would otherwise
// flip the login-cloud spec into the Local tab on the next run.
const E2E_IGNORED_KEYS: ReadonlySet<string> = new Set([
  'login.lastMode',
]);

export async function get<T>(key: string): Promise<T | null> {
  assertValidKey(key);
  assertRendererKey(key);
  if (process.env.BYAN_E2E_MODE === '1') {
    if (E2E_IGNORED_KEYS.has(key)) return null;
    // Env fallback takes precedence over keytar in E2E mode: keytar is
    // process-global on Linux so the previous spec's tmp dir survives across
    // runs and would mask BYAN_E2E_TMP_PROJECT_ROOT (the path Playwright
    // freshly creates for this spec).
    const envName = E2E_KEY_TO_ENV[key];
    const envVal = envName ? process.env[envName] : undefined;
    if (envVal) return envVal as unknown as T;
  }
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
  assertRendererKey(key);
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
