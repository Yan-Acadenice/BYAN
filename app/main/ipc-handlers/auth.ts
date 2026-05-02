// Auth IPC handlers.
//
// login: validates the token against the remote server BEFORE persisting it.
//   - cloud/custom: fires a probe request to <url>/api/auth/whoami with the supplied token.
//     On 200 → persist via SecureStore, return ok.
//     On 401/403 → return { ok: false, reason: 'invalid_token' }.
//     On network error / timeout → return { ok: false, reason: 'unreachable' }.
//   - local: verifies the local server is running (via LocalServer singleton).
//     Token is optional; if provided it is validated the same way as cloud.
//     If the server is not up → return { ok: false, reason: 'unreachable' }.
//
// getToken: live in F6 — reads from OS keychain via SecureStore.
//
// SECURITY: token is NEVER logged and only transits main-process memory + OS keychain.

import type { IpcMain } from 'electron';
import { IPC_CHANNELS, AuthLoginOptions, AuthResult } from '../../shared/ipc-contract';
import { IpcError, wrap } from './_error';
import { secureStore } from '../secure-store';

// Injected by server.ts after bootstrap so we can query LocalServer status for mode:'local'.
// Kept as a weak reference (never imported circularly from local-server.ts).
import type { LocalServer } from '../local-server';

let _localServer: LocalServer | null = null;

// Called from main/index.ts — same singleton that server.ts uses.
export function setLocalServerForAuth(ls: LocalServer): void {
  _localServer = ls;
}

// Key used to store the auth token in SecureStore.
export const AUTH_TOKEN_KEY = 'auth.token';

// Probe timeout in milliseconds.
const PROBE_TIMEOUT_MS = 8_000;

// E2E hook: BYAN_E2E_MOCK_AUTH lets Playwright tests deterministically choose
// the probe outcome without spinning up a fake HTTP server.
//   '200'      → 'ok'
//   '401'/'403'→ 'invalid_token'
//   'network'  → 'unreachable'
function probeMockOverride(): 'ok' | 'invalid_token' | 'unreachable' | null {
  if (process.env.BYAN_E2E_MODE !== '1') return null;
  const v = process.env.BYAN_E2E_MOCK_AUTH;
  if (!v) return null;
  if (v === '200') return 'ok';
  if (v === '401' || v === '403') return 'invalid_token';
  if (v === 'network' || v === 'unreachable') return 'unreachable';
  return null;
}

// Validates a token against a remote byan_web instance.
// Returns 'ok' | 'invalid_token' | 'unreachable'.
async function probeToken(url: string, token: string): Promise<'ok' | 'invalid_token' | 'unreachable'> {
  const mock = probeMockOverride();
  if (mock) return mock;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const endpoint = `${url.replace(/\/$/, '')}/api/auth/whoami`;
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { Authorization: `ApiKey ${token}` },
      signal: controller.signal
    });

    if (res.status === 200) return 'ok';
    if (res.status === 401 || res.status === 403) return 'invalid_token';
    // Unexpected status codes (5xx, 404, etc.) → server is reachable but something is wrong.
    // Treat as unreachable so the user checks the URL first.
    return 'unreachable';
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}

export async function login(opts: AuthLoginOptions): Promise<AuthResult> {
  if (!opts || typeof opts !== 'object') {
    throw new IpcError('INVALID_ARGUMENT', 'login: opts must be an object');
  }
  if (opts.mode !== 'cloud' && opts.mode !== 'local' && opts.mode !== 'custom') {
    throw new IpcError('INVALID_ARGUMENT', `login: unknown mode "${String(opts.mode)}"`);
  }

  const resolvedUrl =
    opts.url ??
    (opts.mode === 'cloud'
      ? 'https://byan-api.stark.a3n.fr'
      : opts.mode === 'local'
      ? 'http://localhost:3737'
      : '');

  if (!resolvedUrl) {
    throw new IpcError('INVALID_ARGUMENT', 'login: url is required for custom mode');
  }

  if (opts.mode === 'local') {
    // Verify local server is up.
    const serverStatus = _localServer ? _localServer.status() : { running: false };
    if (!serverStatus.running) {
      return { ok: false, reason: 'unreachable', message: 'Local server is not running. Start it first.' };
    }

    // Build the actual URL from the running server's port if available.
    const localUrl =
      serverStatus.running && (serverStatus as { running: true; port: number }).port
        ? `http://localhost:${(serverStatus as { running: true; port: number }).port}`
        : resolvedUrl;

    // Token is optional for local dev mode.
    if (opts.token) {
      const probeResult = await probeToken(localUrl, opts.token);
      if (probeResult !== 'ok') {
        return { ok: false, reason: probeResult, message: probeResult === 'invalid_token' ? 'Token invalide pour le serveur local.' : 'Serveur local inaccessible.' };
      }
      await secureStore.set(AUTH_TOKEN_KEY, opts.token);
    }

    return {
      ok: true,
      mode: 'local',
      url: localUrl
    };
  }

  // cloud / custom — token is required.
  if (!opts.token) {
    return { ok: false, reason: 'invalid_token', message: 'Token requis pour ce mode.' };
  }

  const probeResult = await probeToken(resolvedUrl, opts.token);

  if (probeResult === 'invalid_token') {
    return { ok: false, reason: 'invalid_token', message: 'Token invalide ou refuse par le serveur.' };
  }
  if (probeResult === 'unreachable') {
    return { ok: false, reason: 'unreachable', message: `Serveur inaccessible: ${resolvedUrl}` };
  }

  // Token validated — persist.
  await secureStore.set(AUTH_TOKEN_KEY, opts.token);

  return {
    ok: true,
    mode: opts.mode,
    url: resolvedUrl
  };
}

export async function logout(): Promise<void> {
  // Clear stored token.
  await secureStore.delete(AUTH_TOKEN_KEY);
}

export async function getToken(): Promise<string | null> {
  return secureStore.get(AUTH_TOKEN_KEY);
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.auth.login, wrap((_evt, opts: AuthLoginOptions) => login(opts)));
  ipcMain.handle(IPC_CHANNELS.auth.logout, wrap(() => logout()));
  ipcMain.handle(IPC_CHANNELS.auth.getToken, wrap(() => getToken()));
}
