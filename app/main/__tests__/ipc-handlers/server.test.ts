// Tests for ipc-handlers/server.ts — F3 implementation.
// Verifies that each IPC handler correctly delegates to the LocalServer singleton.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { LocalServer } from '../../local-server';

// ---------- Mock the local-server module ---------------------------------
// We avoid importing createLocalServer to prevent child_process.fork() side-effects.

vi.mock('../../local-server', () => ({
  createLocalServer: vi.fn()
}));

// ---------- Helpers -------------------------------------------------------

function makeMockLocalServer(overrides: Partial<LocalServer> = {}): LocalServer {
  return {
    spawn: vi.fn().mockResolvedValue({ port: 12345, pid: 99 }),
    stop: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockReturnValue({ running: false }),
    on: vi.fn(),
    ...overrides
  } as unknown as LocalServer;
}

// Import the handler module fresh — we call setLocalServer() to inject the mock.
async function loadHandler(mockServer: LocalServer) {
  // Re-import to get a fresh module state between tests.
  const mod = await import('../../ipc-handlers/server');
  mod.setLocalServer(mockServer);
  return mod;
}

// ---------- Tests ---------------------------------------------------------

describe('server handler — spawn', () => {
  it('delegates to localServer.spawn() and returns port + pid', async () => {
    const mock = makeMockLocalServer();
    const { spawn } = await loadHandler(mock);

    const result = await spawn();
    expect(result).toEqual({ port: 12345, pid: 99 });
    expect(mock.spawn).toHaveBeenCalledTimes(1);
  });
});

describe('server handler — stop', () => {
  it('delegates to localServer.stop()', async () => {
    const mock = makeMockLocalServer();
    const { stop } = await loadHandler(mock);

    await stop();
    expect(mock.stop).toHaveBeenCalledTimes(1);
  });

  it('resolves cleanly (idempotent)', async () => {
    const mock = makeMockLocalServer();
    const { stop } = await loadHandler(mock);
    await expect(stop()).resolves.toBeUndefined();
  });
});

describe('server handler — status', () => {
  it('returns { running: false } when server is stopped', async () => {
    const mock = makeMockLocalServer({
      status: vi.fn().mockReturnValue({ running: false })
    });
    const { status } = await loadHandler(mock);

    const s = await status();
    expect(s.running).toBe(false);
  });

  it('returns { running: true, port, pid } when server is up', async () => {
    const mock = makeMockLocalServer({
      status: vi.fn().mockReturnValue({ running: true, port: 12345, pid: 99 })
    });
    const { status } = await loadHandler(mock);

    const s = await status();
    expect(s).toEqual({ running: true, port: 12345, pid: 99 });
  });
});

describe('server handler — register', () => {
  it('registers all three channels on ipcMain', async () => {
    const { IPC_CHANNELS } = await import('../../../shared/ipc-contract');
    const mock = makeMockLocalServer();
    const { register } = await loadHandler(mock);

    const handle = vi.fn();
    register({ handle } as never);

    const channels = handle.mock.calls.map((c: unknown[]) => c[0]);
    expect(channels).toContain(IPC_CHANNELS.server.spawn);
    expect(channels).toContain(IPC_CHANNELS.server.stop);
    expect(channels).toContain(IPC_CHANNELS.server.status);
  });
});
