// store.test.ts
//
// Tests for the store IPC handler (F2 contract + F6 SecureStore integration).

import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted ensures the variable is available inside vi.mock factory.
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

import * as store from '../../ipc-handlers/store';
import { IPC_CHANNELS } from '../../../shared/ipc-contract';

beforeEach(() => {
  store._resetForTests();
  mockSecureStore.set.mockClear().mockResolvedValue(undefined);
  mockSecureStore.get.mockClear().mockResolvedValue(null);
  mockSecureStore.delete.mockClear().mockResolvedValue(undefined);
  mockSecureStore._resetForTests.mockClear();
});

// ---------- F2 contract (must still pass) ----------

describe('store.set / store.get — F2 contract', () => {
  it('round-trips a string value', async () => {
    mockSecureStore.set.mockResolvedValueOnce(undefined);
    mockSecureStore.get.mockResolvedValueOnce('"dark"');

    await store.set('user.theme', 'dark');
    const result = await store.get<string>('user.theme');
    expect(result).toBe('dark');
  });

  it('round-trips an object (JSON-serialized)', async () => {
    const value = { id: 'p1', name: 'BYAN' };
    mockSecureStore.set.mockResolvedValueOnce(undefined);
    mockSecureStore.get.mockResolvedValueOnce(JSON.stringify(value));

    await store.set('ui.project', value);
    const back = await store.get<typeof value>('ui.project');
    expect(back).toEqual(value);
  });

  it('returns null for an unknown key (never undefined across IPC)', async () => {
    mockSecureStore.get.mockResolvedValueOnce(null);
    await expect(store.get('ui.nope')).resolves.toBeNull();
  });
});

// ---------- F2 key validation ----------

describe('store key validation', () => {
  it('throws INVALID_ARGUMENT on empty key', async () => {
    await expect(store.get('')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(store.set('', 1)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('throws INVALID_ARGUMENT on non-string key', async () => {
    await expect(store.get(42 as never)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
});

// ---------- F2 register ----------

describe('store.register', () => {
  it('registers both channels on ipcMain', () => {
    const handle = vi.fn();
    store.register({ handle } as never);
    const channels = handle.mock.calls.map((c) => c[0]);
    expect(channels).toContain(IPC_CHANNELS.store.get);
    expect(channels).toContain(IPC_CHANNELS.store.set);
  });
});

// ---------- F6 — SecureStore integration ----------

describe('store.set — delegates to SecureStore', () => {
  it('calls secureStore.set with the key and JSON-serialized value for objects', async () => {
    const obj = { x: 1 };
    await store.set('ui.cfg', obj);
    expect(mockSecureStore.set).toHaveBeenCalledWith('ui.cfg', JSON.stringify(obj));
  });

  it('calls secureStore.set with raw string (not double-encoded) when value is a string', async () => {
    await store.set('user.theme', 'dark');
    expect(mockSecureStore.set).toHaveBeenCalledWith('user.theme', 'dark');
  });
});

describe('store — renderer key allowlist', () => {
  // The generic store shares SecureStore with auth.token/auth.mode/auth.url:
  // the renderer must not be able to reach those through this channel.
  it('rejects reading an auth key', async () => {
    await expect(store.get('auth.token')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(mockSecureStore.get).not.toHaveBeenCalled();
  });

  it('rejects writing an auth key', async () => {
    await expect(store.set('auth.token', 'stolen')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(mockSecureStore.set).not.toHaveBeenCalled();
  });

  it('rejects a key outside every allowed prefix', async () => {
    await expect(store.get('random-key')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('rejects a bare prefix with nothing after it', async () => {
    await expect(store.get('chat.')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('accepts the namespaced UI keys', async () => {
    await expect(store.set('chat.localEngine', 'codex')).resolves.toBeUndefined();
    await expect(store.set('onboarding.projectRoot', '/p')).resolves.toBeUndefined();
    await expect(store.set('login.lastMode', 'local')).resolves.toBeUndefined();
  });
});

describe('store.get — delegates to SecureStore', () => {
  it('calls secureStore.get with the key', async () => {
    mockSecureStore.get.mockResolvedValueOnce('"dark"');
    await store.get('user.theme');
    expect(mockSecureStore.get).toHaveBeenCalledWith('user.theme');
  });

  it('parses JSON string returned by SecureStore', async () => {
    mockSecureStore.get.mockResolvedValueOnce('"hello"');
    const result = await store.get<string>('ui.k');
    expect(result).toBe('hello');
  });

  it('returns raw string when SecureStore value is not valid JSON', async () => {
    mockSecureStore.get.mockResolvedValueOnce('plain text');
    const result = await store.get<string>('ui.k');
    expect(result).toBe('plain text');
  });

  it('returns null when secureStore.get returns null', async () => {
    mockSecureStore.get.mockResolvedValueOnce(null);
    const result = await store.get('ui.missing');
    expect(result).toBeNull();
  });
});
