import { describe, expect, it, vi } from 'vitest';
import { makeHandlers, register } from '../../ipc-handlers/app';
import { IPC_CHANNELS } from '../../../shared/ipc-contract';

function makeFakeApp() {
  return {
    quit: vi.fn(),
    relaunch: vi.fn(),
    getVersion: vi.fn(() => '0.1.0')
  };
}

describe('app.version', () => {
  it('returns the value from electron.app.getVersion', async () => {
    const fake = makeFakeApp();
    const h = makeHandlers({ app: fake });
    await expect(h.version()).resolves.toBe('0.1.0');
    expect(fake.getVersion).toHaveBeenCalledOnce();
  });
});

describe('app.quit', () => {
  it('calls electron.app.quit', async () => {
    const fake = makeFakeApp();
    const h = makeHandlers({ app: fake });
    await h.quit();
    expect(fake.quit).toHaveBeenCalledOnce();
  });
});

describe('app.relaunch', () => {
  it('calls relaunch then quit', async () => {
    const fake = makeFakeApp();
    const h = makeHandlers({ app: fake });
    await h.relaunch();
    expect(fake.relaunch).toHaveBeenCalledOnce();
    expect(fake.quit).toHaveBeenCalledOnce();
  });
});

describe('app.register', () => {
  it('registers all three channels on ipcMain', () => {
    const handle = vi.fn();
    const fake = makeFakeApp();
    register({ handle } as never, { app: fake });
    const channels = handle.mock.calls.map((c) => c[0]);
    expect(channels).toContain(IPC_CHANNELS.app.quit);
    expect(channels).toContain(IPC_CHANNELS.app.version);
    expect(channels).toContain(IPC_CHANNELS.app.relaunch);
  });
});
