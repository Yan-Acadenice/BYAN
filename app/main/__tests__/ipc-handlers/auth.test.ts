// Auth IPC handlers — shape contract tests + F5 URL/token validation + F6 SecureStore.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted runs before vi.mock hoisting so the variable is accessible inside the factory.
const mockSecureStore = vi.hoisted(() => ({
  set: vi.fn<[string, string], Promise<void>>().mockResolvedValue(undefined),
  get: vi.fn<[string], Promise<string | null>>().mockResolvedValue(null),
  delete: vi.fn<[string], Promise<void>>().mockResolvedValue(undefined),
  _resetForTests: vi.fn()
}));

vi.mock('../../secure-store', () => ({
  secureStore: mockSecureStore,
  _resetKeytarState: vi.fn()
}));

// Mock global fetch so we can control probe responses without hitting a real server.
const mockFetch = vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>();

vi.stubGlobal('fetch', mockFetch);

import * as auth from '../../ipc-handlers/auth';
import { IPC_CHANNELS } from '../../../shared/ipc-contract';
import { IpcError } from '../../ipc-handlers/_error';
import type { LocalServer } from '../../local-server';

// ---- helpers ----

function makeResponse(status: number): Response {
  return { status, ok: status >= 200 && status < 300 } as Response;
}

function makeMockLocalServer(running: boolean, port = 3737, pid = 999): LocalServer {
  const ls: Partial<LocalServer> = {
    status: vi.fn().mockReturnValue(running ? { running: true, port, pid } : { running: false }),
    spawn: vi.fn<[], Promise<{ port: number; pid: number }>>().mockResolvedValue({ port, pid }),
    stop: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
    on: vi.fn()
  };
  return ls as LocalServer;
}

// ---- setup ----

beforeEach(() => {
  mockSecureStore.set.mockClear().mockResolvedValue(undefined);
  mockSecureStore.get.mockClear().mockResolvedValue(null);
  mockSecureStore.delete.mockClear().mockResolvedValue(undefined);
  mockFetch.mockClear();

  // Detach any local-server mock from previous tests.
  auth.setLocalServerForAuth(null as never);
});

// ---- existing shape / F6 tests (preserved) ----

describe('auth.login — shape validation', () => {
  it('throws INVALID_ARGUMENT on missing opts', async () => {
    await expect(auth.login(undefined as never)).rejects.toBeInstanceOf(IpcError);
  });

  it('throws INVALID_ARGUMENT on unknown mode', async () => {
    await expect(auth.login({ mode: 'mars' as never })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('throws INVALID_ARGUMENT when custom mode has no url', async () => {
    mockFetch.mockResolvedValue(makeResponse(200));
    // custom without url — resolvedUrl would be empty string → INVALID_ARGUMENT
    await expect(auth.login({ mode: 'custom', token: 'x' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
});

describe('auth.login — cloud mode', () => {
  it('returns ok when probe returns 200 and persists token', async () => {
    mockFetch.mockResolvedValue(makeResponse(200));

    const r = await auth.login({ mode: 'cloud', token: 'byan_valid' });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mode).toBe('cloud');
      expect(r.url).toContain('byan-api.stark.a3n.fr');
    }
    expect(mockSecureStore.set).toHaveBeenCalledWith('auth.token', 'byan_valid');
    // F1: mode + url must be persisted too (the missing half that broke local mode).
    expect(mockSecureStore.set).toHaveBeenCalledWith('auth.mode', 'cloud');
    expect(mockSecureStore.set).toHaveBeenCalledWith('auth.url', 'https://byan-api.stark.a3n.fr');
  });

  it('returns invalid_token when probe returns 401', async () => {
    mockFetch.mockResolvedValue(makeResponse(401));

    const r = await auth.login({ mode: 'cloud', token: 'byan_bad' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_token');
    expect(mockSecureStore.set).not.toHaveBeenCalled();
  });

  it('returns invalid_token when probe returns 403', async () => {
    mockFetch.mockResolvedValue(makeResponse(403));

    const r = await auth.login({ mode: 'cloud', token: 'byan_forbidden' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_token');
  });

  it('returns unreachable when fetch throws (network error)', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const r = await auth.login({ mode: 'cloud', token: 'byan_any' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unreachable');
    expect(mockSecureStore.set).not.toHaveBeenCalled();
  });

  it('returns invalid_token when no token supplied for cloud mode', async () => {
    const r = await auth.login({ mode: 'cloud' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_token');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses custom url when provided with cloud mode', async () => {
    mockFetch.mockResolvedValue(makeResponse(200));

    const r = await auth.login({ mode: 'cloud', url: 'https://my-cloud.test', token: 'byan_t' });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toBe('https://my-cloud.test');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('my-cloud.test'),
      expect.any(Object)
    );
  });
});

describe('auth.login — custom mode', () => {
  it('returns ok for custom url with valid token', async () => {
    mockFetch.mockResolvedValue(makeResponse(200));

    const r = await auth.login({ mode: 'custom', url: 'https://example.test', token: 'byan_x' });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toBe('https://example.test');
    expect(mockSecureStore.set).toHaveBeenCalledWith('auth.token', 'byan_x');
  });

  it('returns invalid_token for custom url with bad token', async () => {
    mockFetch.mockResolvedValue(makeResponse(401));

    const r = await auth.login({ mode: 'custom', url: 'https://example.test', token: 'bad' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_token');
  });

  it('returns unreachable when custom server is down', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const r = await auth.login({ mode: 'custom', url: 'https://down.test', token: 'byan_t' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unreachable');
  });
});

describe('auth.login — local mode', () => {
  it('returns unreachable when local server is not running', async () => {
    const ls = makeMockLocalServer(false);
    auth.setLocalServerForAuth(ls);

    const r = await auth.login({ mode: 'local' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unreachable');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns ok when local server health probe succeeds (no token)', async () => {
    const ls = makeMockLocalServer(true, 3737);
    auth.setLocalServerForAuth(ls);
    // /api/health returns 200 → probe ok
    mockFetch.mockResolvedValue(makeResponse(200));

    const r = await auth.login({ mode: 'local' });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mode).toBe('local');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/health'),
      expect.any(Object)
    );
    // No token supplied → the TOKEN is not written, but mode+url still are (F1).
    expect(mockSecureStore.set).not.toHaveBeenCalledWith('auth.token', expect.anything());
    expect(mockSecureStore.set).toHaveBeenCalledWith('auth.mode', 'local');
    expect(mockSecureStore.set).toHaveBeenCalledWith('auth.url', 'http://localhost:3737');
  });

  it('persists token alongside the local-server health probe when one is supplied', async () => {
    const ls = makeMockLocalServer(true, 9000);
    auth.setLocalServerForAuth(ls);
    mockFetch.mockResolvedValue(makeResponse(200));

    const r = await auth.login({ mode: 'local', token: 'byan_local_tok' });

    expect(r.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('localhost:9000/api/health'),
      expect.any(Object)
    );
    expect(mockSecureStore.set).toHaveBeenCalledWith('auth.token', 'byan_local_tok');
    // F1: local mode persists mode='local' + the resolved localhost URL, so the
    // data layer targets the local server instead of the cloud default.
    expect(mockSecureStore.set).toHaveBeenCalledWith('auth.mode', 'local');
    expect(mockSecureStore.set).toHaveBeenCalledWith('auth.url', 'http://localhost:9000');
  });

  it('returns unreachable when the local /api/health probe fails', async () => {
    const ls = makeMockLocalServer(true, 9000);
    auth.setLocalServerForAuth(ls);
    // Server replies but /api/health is not 200 (process degraded).
    mockFetch.mockResolvedValue(makeResponse(500));

    const r = await auth.login({ mode: 'local', token: 'any' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unreachable');
    expect(mockSecureStore.set).not.toHaveBeenCalled();
  });

  it('returns unreachable when no LocalServer singleton is set', async () => {
    // setLocalServerForAuth(null) done in beforeEach.
    const r = await auth.login({ mode: 'local' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unreachable');
  });
});

describe('auth.logout', () => {
  it('resolves without throwing', async () => {
    await expect(auth.logout()).resolves.toBeUndefined();
  });

  it('deletes auth.token, auth.mode and auth.url from SecureStore', async () => {
    await auth.logout();
    expect(mockSecureStore.delete).toHaveBeenCalledWith('auth.token');
    expect(mockSecureStore.delete).toHaveBeenCalledWith('auth.mode');
    expect(mockSecureStore.delete).toHaveBeenCalledWith('auth.url');
  });
});

describe('auth.getSession (F1)', () => {
  it('defaults to a LOCAL session when no mode AND no cloud token (UI matches the data source)', async () => {
    // Mode lost (keychain locked -> empty .env). isLocalMode also defaults local,
    // so the status-bar label and the data source agree instead of diverging.
    mockSecureStore.get.mockResolvedValue(null);
    await expect(auth.getSession()).resolves.toEqual({ mode: 'local', url: '' });
  });

  it('returns {mode,url} from SecureStore when a session exists', async () => {
    mockSecureStore.get.mockImplementation(async (key: string) => {
      if (key === 'auth.mode') return 'local';
      if (key === 'auth.url') return 'http://localhost:9000';
      return null;
    });
    await expect(auth.getSession()).resolves.toEqual({ mode: 'local', url: 'http://localhost:9000' });
  });

  it('defaults to LOCAL when a junk mode is stored and no token (junk treated as unset)', async () => {
    mockSecureStore.get.mockImplementation(async (key: string) => (key === 'auth.mode' ? 'mars' : null));
    await expect(auth.getSession()).resolves.toEqual({ mode: 'local', url: '' });
  });

  it('returns null (cloud-needs-login) when a cloud token exists but no mode', async () => {
    mockSecureStore.get.mockImplementation(async (key: string) =>
      key === 'auth.token' ? 'byan_' + '0'.repeat(64) : null
    );
    await expect(auth.getSession()).resolves.toBeNull();
  });
});

describe('auth.switchMode (F1)', () => {
  it('re-persists the new mode and notifies on success', async () => {
    mockFetch.mockResolvedValue(makeResponse(200));
    const r = await auth.switchMode({ mode: 'cloud', token: 'byan_switch' });
    expect(r.ok).toBe(true);
    expect(mockSecureStore.set).toHaveBeenCalledWith('auth.mode', 'cloud');
    expect(mockSecureStore.set).toHaveBeenCalledWith('auth.url', 'https://byan-api.stark.a3n.fr');
  });

  it('propagates a failure result without persisting', async () => {
    mockFetch.mockResolvedValue(makeResponse(401));
    const r = await auth.switchMode({ mode: 'cloud', token: 'bad' });
    expect(r.ok).toBe(false);
    expect(mockSecureStore.set).not.toHaveBeenCalledWith('auth.mode', expect.anything());
  });

  it('reuses the stored token when switching to cloud with none supplied', async () => {
    // A stored token means a prior cloud/custom sign-in; the in-app toggle must
    // not re-prompt. get(auth.token) → the stored token; probe succeeds.
    mockSecureStore.get.mockImplementation(async (k: string) =>
      k === 'auth.token' ? 'byan_stored' : null
    );
    mockFetch.mockResolvedValue(makeResponse(200));
    const r = await auth.switchMode({ mode: 'cloud' });
    expect(r.ok).toBe(true);
    // The probe used the stored token in the Authorization header.
    const [, init] = mockFetch.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe('ApiKey byan_stored');
    expect(mockSecureStore.set).toHaveBeenCalledWith('auth.mode', 'cloud');
  });

  it('fails with invalid_token when switching to cloud and no token is stored', async () => {
    mockSecureStore.get.mockResolvedValue(null);
    const r = await auth.switchMode({ mode: 'cloud' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_token');
    // No probe fired — login short-circuits on the missing token.
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('auth.getToken', () => {
  it('returns null when no token stored', async () => {
    mockSecureStore.get.mockResolvedValueOnce(null);
    await expect(auth.getToken()).resolves.toBeNull();
    expect(mockSecureStore.get).toHaveBeenCalledWith('auth.token');
  });

  it('returns the stored token from SecureStore', async () => {
    mockSecureStore.get.mockResolvedValueOnce('byan_stored_token');
    const token = await auth.getToken();
    expect(token).toBe('byan_stored_token');
  });
});

describe('auth.register', () => {
  it('registers all auth channels on ipcMain (incl. getSession + switchMode)', () => {
    const handle = vi.fn();
    auth.register({ handle } as never);
    const channels = handle.mock.calls.map((c) => c[0]);
    expect(channels).toContain(IPC_CHANNELS.auth.login);
    expect(channels).toContain(IPC_CHANNELS.auth.logout);
    expect(channels).toContain(IPC_CHANNELS.auth.getToken);
    expect(channels).toContain(IPC_CHANNELS.auth.getSession);
    expect(channels).toContain(IPC_CHANNELS.auth.switchMode);
  });
});
