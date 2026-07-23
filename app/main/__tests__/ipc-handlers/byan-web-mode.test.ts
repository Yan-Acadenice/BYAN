// byan-web isLocalMode (N1) — the single decision point that flips every read
// handler between the local disk source and the cloud API. In local mode nothing
// asks for a token.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSecureStore = vi.hoisted(() => ({
  get: vi.fn<[string], Promise<string | null>>(),
  set: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('../../secure-store', () => ({ secureStore: mockSecureStore }));

import { isLocalMode } from '../../ipc-handlers/byan-web';

beforeEach(() => {
  mockSecureStore.get.mockReset();
});

describe('byan-web isLocalMode', () => {
  it('true when the stored mode is local', async () => {
    mockSecureStore.get.mockResolvedValue('local');
    expect(await isLocalMode()).toBe(true);
    expect(mockSecureStore.get).toHaveBeenCalledWith('auth.mode');
  });

  it('false when the stored mode is cloud', async () => {
    mockSecureStore.get.mockResolvedValue('cloud');
    expect(await isLocalMode()).toBe(false);
  });

  it('false when the stored mode is custom', async () => {
    mockSecureStore.get.mockResolvedValue('custom');
    expect(await isLocalMode()).toBe(false);
  });

  it('LOCAL by default when no mode AND no cloud token (local-first, no auth errors)', async () => {
    // auth.mode -> null, auth.token -> null
    mockSecureStore.get.mockResolvedValue(null);
    expect(await isLocalMode()).toBe(true);
  });

  it('CLOUD when no mode but a cloud token exists (a real cloud user is not hijacked)', async () => {
    mockSecureStore.get.mockImplementation(async (key: string) =>
      key === 'auth.token' ? 'byan_' + '0'.repeat(64) : null
    );
    expect(await isLocalMode()).toBe(false);
  });

  it('false (degrades) when the store throws', async () => {
    mockSecureStore.get.mockRejectedValue(new Error('keychain down'));
    expect(await isLocalMode()).toBe(false);
  });
});
