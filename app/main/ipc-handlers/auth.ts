// Auth IPC handlers.
//
// login: validates the token against the remote server BEFORE persisting it.
//   - cloud/custom: fires a probe request to <url>/api/auth/me with the supplied token.
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
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS, AuthLoginOptions, AuthResult, AuthMode, AuthSession } from '../../shared/ipc-contract';
import { IpcError, wrap } from './_error';
import { secureStore } from '../secure-store';
import { clearSessionCaches } from '../byan-api-client';

// Push a renderer notification on the same channel namespace as native menu
// actions ('byan:*' is whitelisted by preload). Used to make logout reactive
// across IPC boundaries — without this an external trigger of logout (Settings
// button, /quit command, e2e harness) leaves the renderer stuck on the app
// shell because React state is not aware of the secure-store mutation.
function broadcastAuthChanged(reason: 'login' | 'logout'): void {
  // BrowserWindow is undefined in vitest (no Electron stub); the IPC bridge
  // is a no-op there and that is fine — unit tests assert the secure-store
  // mutation, not the broadcast.
  const wins = BrowserWindow?.getAllWindows?.() ?? [];
  for (const win of wins) {
    win.webContents.send('byan:auth:changed', { reason });
  }
}

// Injected by server.ts after bootstrap so we can query LocalServer status for mode:'local'.
// Kept as a weak reference (never imported circularly from local-server.ts).
import type { LocalServer } from '../local-server';

let _localServer: LocalServer | null = null;

// Called from main/index.ts — same singleton that server.ts uses.
export function setLocalServerForAuth(ls: LocalServer): void {
  _localServer = ls;
}

// Keys used to store the auth session in SecureStore.
export const AUTH_TOKEN_KEY = 'auth.token';
// auth.url + auth.mode were the missing half: login persisted only the token,
// so byan-api-client.getBase() always fell back to the cloud default and LOCAL
// mode silently hit the cloud. Persisting both makes the chosen mode real and
// lets the renderer read the active mode after login (F1).
export const AUTH_URL_KEY = 'auth.url';
export const AUTH_MODE_KEY = 'auth.mode';

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
    // /api/auth/me is the byan_web endpoint that returns the current user
    // when an ApiKey or Bearer token is valid. Verified live against
    // byan-api.stark.a3n.fr — returns 200 with user JSON on success,
    // 401 on invalid token, 404 if the URL points at the wrong service.
    const endpoint = `${url.replace(/\/$/, '')}/api/auth/me`;
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

// Probes the embedded local server (install/src/webui/server.js).
// That server has no auth layer — it exposes /api/health which returns
// 200 OK as long as the process is alive. We use it as a liveness check
// so the user gets a real "Local server is unreachable" message instead
// of a misleading "invalid token" when the spawned process has crashed.
async function probeLocalServer(url: string): Promise<'ok' | 'unreachable'> {
  // Honor the same E2E mock override as probeToken — without it, login-local
  // and switch-mode would still fire a real fetch against a port nobody is
  // listening on (BYAN_E2E_MOCK_SERVER_PORT only fakes the spawn IPC).
  const mock = probeMockOverride();
  if (mock === 'ok' || mock === 'unreachable') return mock;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/api/health`, {
      method: 'GET',
      signal: controller.signal
    });
    return res.status === 200 ? 'ok' : 'unreachable';
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

    // Liveness probe against the embedded server's /api/health endpoint.
    // The local server has no auth layer, so we never call /api/auth/me here
    // (it does not exist there) and we ignore the token at probe time.
    const localProbe = await probeLocalServer(localUrl);
    if (localProbe !== 'ok') {
      return { ok: false, reason: 'unreachable', message: 'Serveur local inaccessible.' };
    }

    // Token is optional for local dev mode — persist if provided.
    if (opts.token) {
      await secureStore.set(AUTH_TOKEN_KEY, opts.token);
    }
    // Persist the active mode + resolved URL so getBase() targets the local
    // server (not the cloud default) and the renderer can read the active mode.
    await secureStore.set(AUTH_MODE_KEY, 'local');
    await secureStore.set(AUTH_URL_KEY, localUrl);
    // Drop any cached token/responses from a prior session before the renderer
    // starts firing fresh API calls.
    clearSessionCaches();

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

  // Token validated — persist token + active mode + resolved URL.
  await secureStore.set(AUTH_TOKEN_KEY, opts.token);
  await secureStore.set(AUTH_MODE_KEY, opts.mode);
  await secureStore.set(AUTH_URL_KEY, resolvedUrl);
  // Drop any cached token/responses from a prior session before the renderer
  // starts firing fresh API calls.
  clearSessionCaches();

  return {
    ok: true,
    mode: opts.mode,
    url: resolvedUrl
  };
}

// Switch the active mode WITHOUT a full logout/relogin cycle : re-run login
// with the new mode (which re-persists mode+url+token and clears the API
// caches), then tell the renderer to re-read its session so the whole app
// re-routes live. Returns the same AuthResult as login so the caller can show
// an error if the target mode is unreachable.
//
// Token fallback : the in-app switcher toggles modes without re-prompting for a
// token. cloud/custom REQUIRE one, so when the caller passes none we reuse the
// token already in the keychain. This makes a local<->cloud toggle one-click
// after the user has signed in once ; when no usable token exists, login returns
// invalid_token and the UI routes the user to sign in for that mode.
export async function switchMode(opts: AuthLoginOptions): Promise<AuthResult> {
  let effective = opts;
  if ((opts.mode === 'cloud' || opts.mode === 'custom') && !opts.token) {
    const stored = await secureStore.get(AUTH_TOKEN_KEY);
    if (stored) effective = { ...opts, token: stored };
  }
  const result = await login(effective);
  if (result.ok) broadcastAuthChanged('login');
  return result;
}

// Read the persisted session (mode + url) so the renderer can show the active
// mode everywhere and route data accordingly. null when no session is stored.
export async function getSession(): Promise<AuthSession> {
  const mode = (await secureStore.get(AUTH_MODE_KEY)) as AuthMode | null;
  if (mode !== 'cloud' && mode !== 'local' && mode !== 'custom') return null;
  const url = (await secureStore.get(AUTH_URL_KEY)) ?? '';
  return { mode, url };
}

export async function logout(): Promise<void> {
  // Clear stored token + mode + url, and drop the in-memory cache so the next
  // session can't reuse the previous user's token, mode, or list responses.
  await secureStore.delete(AUTH_TOKEN_KEY);
  await secureStore.delete(AUTH_MODE_KEY);
  await secureStore.delete(AUTH_URL_KEY);
  clearSessionCaches();
  broadcastAuthChanged('logout');
}

export async function getToken(): Promise<string | null> {
  return secureStore.get(AUTH_TOKEN_KEY);
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.auth.login, wrap((_evt, opts: AuthLoginOptions) => login(opts)));
  ipcMain.handle(IPC_CHANNELS.auth.logout, wrap(() => logout()));
  ipcMain.handle(IPC_CHANNELS.auth.getToken, wrap(() => getToken()));
  ipcMain.handle(IPC_CHANNELS.auth.getSession, wrap(() => getSession()));
  ipcMain.handle(IPC_CHANNELS.auth.switchMode, wrap((_evt, opts: AuthLoginOptions) => switchMode(opts)));
}
