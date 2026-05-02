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

  it('returns ok when local server is running (no token)', async () => {
    const ls = makeMockLocalServer(true, 3737);
    auth.setLocalServerForAuth(ls);

    const r = await auth.login({ mode: 'local' });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mode).toBe('local');
    // No token → no SecureStore write, no fetch.
    expect(mockSecureStore.set).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('validates token against local server when token is provided and server is up', async () => {
    const ls = makeMockLocalServer(true, 9000);
    auth.setLocalServerForAuth(ls);
    mockFetch.mockResolvedValue(makeResponse(200));

    const r = await auth.login({ mode: 'local', token: 'byan_local_tok' });

    expect(r.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('localhost:9000'),
      expect.any(Object)
    );
    expect(mockSecureStore.set).toHaveBeenCalledWith('auth.token', 'byan_local_tok');
  });

  it('returns invalid_token when local token probe fails', async () => {
    const ls = makeMockLocalServer(true, 9000);
    auth.setLocalServerForAuth(ls);
    mockFetch.mockResolvedValue(makeResponse(401));

    const r = await auth.login({ mode: 'local', token: 'bad_local' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_token');
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

  it('deletes auth.token from SecureStore', async () => {
    await auth.logout();
    expect(mockSecureStore.delete).toHaveBeenCalledWith('auth.token');
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
  it('registers all three channels on ipcMain', () => {
    const handle = vi.fn();
    auth.register({ handle } as never);
    const channels = handle.mock.calls.map((c) => c[0]);
    expect(channels).toContain(IPC_CHANNELS.auth.login);
    expect(channels).toContain(IPC_CHANNELS.auth.logout);
    expect(channels).toContain(IPC_CHANNELS.auth.getToken);
  });
});
