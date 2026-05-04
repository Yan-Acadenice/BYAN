import { describe, expect, it, vi } from 'vitest';
import { makeHandlers, register } from '../../ipc-handlers/app';
import { IPC_CHANNELS } from '../../../shared/ipc-contract';
import { IpcError } from '../../ipc-handlers/_error';

// Mock shell.openExternal so tests don't open a real browser.
vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(() => Promise.resolve())
  }
}));

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

describe('app.openExternal — allow-list', () => {
  it('resolves for a valid https URL', async () => {
    const fake = makeFakeApp();
    const h = makeHandlers({ app: fake });
    await expect(h.openExternal('https://acadenice.fr')).resolves.toBeUndefined();
  });

  it('resolves for the BYAN cloud URL', async () => {
    const fake = makeFakeApp();
    const h = makeHandlers({ app: fake });
    await expect(h.openExternal('https://byan-api.stark.a3n.fr')).resolves.toBeUndefined();
  });

  it('throws INVALID_ARGUMENT for a non-https URL (http)', async () => {
    const fake = makeFakeApp();
    const h = makeHandlers({ app: fake });
    await expect(h.openExternal('http://example.com')).rejects.toBeInstanceOf(IpcError);
    await expect(h.openExternal('http://example.com')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('throws INVALID_ARGUMENT for file:// URL', async () => {
    const fake = makeFakeApp();
    const h = makeHandlers({ app: fake });
    await expect(h.openExternal('file:///etc/passwd')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('throws INVALID_ARGUMENT for javascript: URL', async () => {
    const fake = makeFakeApp();
    const h = makeHandlers({ app: fake });
    await expect(h.openExternal('javascript:alert(1)')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('throws INVALID_ARGUMENT for empty string', async () => {
    const fake = makeFakeApp();
    const h = makeHandlers({ app: fake });
    await expect(h.openExternal('')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('throws INVALID_ARGUMENT for a non-URL string', async () => {
    const fake = makeFakeApp();
    const h = makeHandlers({ app: fake });
    await expect(h.openExternal('not-a-url')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
});

describe('app.register', () => {
  it('registers all four channels on ipcMain', () => {
    const handle = vi.fn();
    const fake = makeFakeApp();
    register({ handle } as never, { app: fake });
    const channels = handle.mock.calls.map((c) => c[0]);
    expect(channels).toContain(IPC_CHANNELS.app.quit);
    expect(channels).toContain(IPC_CHANNELS.app.version);
    expect(channels).toContain(IPC_CHANNELS.app.relaunch);
    expect(channels).toContain(IPC_CHANNELS.app.openExternal);
  });
});
