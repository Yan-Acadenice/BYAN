import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { AutoUpdaterManager, type AutoUpdaterLike, type UpdateState } from '../auto-updater';

// Fake autoUpdater that exposes the same event surface as electron-updater.
class FakeUpdater extends EventEmitter implements AutoUpdaterLike {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  allowPrerelease = false;
  logger: unknown = null;
  checkForUpdates = vi.fn(async () => undefined);
  downloadUpdate = vi.fn(async () => undefined);
  quitAndInstall = vi.fn(() => undefined);
}

let updater: FakeUpdater;
let manager: AutoUpdaterManager;

beforeEach(() => {
  updater = new FakeUpdater();
  manager = new AutoUpdaterManager({ updater, isDev: false });
});

describe('AutoUpdaterManager — logger', () => {
  it('nulls the updater logger so it cannot write to a broken pipe (EPIPE fix)', () => {
    const u = new FakeUpdater();
    u.logger = console; // electron-updater defaults to a console-backed logger
    new AutoUpdaterManager({ updater: u, isDev: false }); // nulls the logger on wire
    expect(u.logger).toBeNull();
  });
});

describe('AutoUpdaterManager — state machine', () => {
  it('starts in idle state', () => {
    expect(manager.getState()).toEqual({ state: 'idle' });
  });

  it('transitions idle → checking → available on update-available event', () => {
    const seen: UpdateState[] = [];
    manager.onStateChange((s) => seen.push(s));
    updater.emit('checking-for-update');
    updater.emit('update-available', { version: '0.2.0' });
    expect(seen.map((s) => s.state)).toEqual(['checking', 'available']);
    const last = manager.getState();
    expect(last.state).toBe('available');
    if (last.state === 'available') expect(last.version).toBe('0.2.0');
  });

  it('captures download-progress percent', () => {
    updater.emit('download-progress', { percent: 42, transferred: 1024, total: 4096 });
    const s = manager.getState();
    expect(s.state).toBe('downloading');
    if (s.state === 'downloading') {
      expect(s.percent).toBe(42);
      expect(s.total).toBe(4096);
    }
  });

  it('transitions to downloaded with the new version', () => {
    updater.emit('update-downloaded', { version: '0.2.0' });
    const s = manager.getState();
    expect(s.state).toBe('downloaded');
    if (s.state === 'downloaded') expect(s.version).toBe('0.2.0');
  });

  it('reports error state when the updater errors', () => {
    updater.emit('error', new Error('network down'));
    const s = manager.getState();
    expect(s.state).toBe('error');
    if (s.state === 'error') expect(s.message).toBe('network down');
  });
});

describe('AutoUpdaterManager — dev mode', () => {
  it('does not invoke checkForUpdates when isDev=true', async () => {
    const devManager = new AutoUpdaterManager({ updater, isDev: true });
    const state = await devManager.checkNow();
    expect(state).toEqual({ state: 'disabled', reason: 'dev-mode' });
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('start() in dev mode sets disabled state and does not schedule timers', () => {
    const devManager = new AutoUpdaterManager({ updater, isDev: true });
    devManager.start();
    expect(devManager.getState()).toEqual({ state: 'disabled', reason: 'dev-mode' });
  });
});

describe('AutoUpdaterManager — checkNow', () => {
  it('calls updater.checkForUpdates when not in dev', async () => {
    await manager.checkNow();
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it('captures errors thrown by checkForUpdates', async () => {
    updater.checkForUpdates = vi.fn(async () => { throw new Error('feed unreachable'); });
    const m = new AutoUpdaterManager({ updater, isDev: false });
    const s = await m.checkNow();
    expect(s.state).toBe('error');
    if (s.state === 'error') expect(s.message).toBe('feed unreachable');
  });
});

describe('AutoUpdaterManager — installNow', () => {
  it('is a no-op until state is downloaded', () => {
    manager.installNow();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it('calls quitAndInstall when state is downloaded', () => {
    updater.emit('update-downloaded', { version: '0.2.0' });
    manager.installNow();
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });
});

describe('AutoUpdaterManager — timer scheduling', () => {
  it('schedules initial check after the configured delay', async () => {
    vi.useFakeTimers();
    try {
      const m = new AutoUpdaterManager({
        updater,
        isDev: false,
        initialCheckDelayMs: 100,
        periodicCheckMs: 1000,
      });
      m.start();
      expect(updater.checkForUpdates).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(150);
      expect(updater.checkForUpdates).toHaveBeenCalledOnce();
      m.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stop() cancels pending timers', async () => {
    vi.useFakeTimers();
    try {
      const m = new AutoUpdaterManager({
        updater,
        isDev: false,
        initialCheckDelayMs: 100,
        periodicCheckMs: 1000,
      });
      m.start();
      m.stop();
      await vi.advanceTimersByTimeAsync(2000);
      expect(updater.checkForUpdates).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('start() is idempotent — a double start schedules ONE timer set', async () => {
    vi.useFakeTimers();
    try {
      const u = new FakeUpdater();
      const m = new AutoUpdaterManager({
        updater: u,
        isDev: false,
        initialCheckDelayMs: 100,
        periodicCheckMs: 1000,
      });
      m.start();
      m.start(); // must be a no-op, not a second timer set

      // Past the initial delay + one period: one initial check + one periodic
      // check. A non-idempotent start would have doubled both (4 calls).
      await vi.advanceTimersByTimeAsync(1200);
      expect(u.checkForUpdates).toHaveBeenCalledTimes(2);
      m.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AutoUpdaterManager — listener safety', () => {
  it('one throwing listener does not break the others', () => {
    let secondCalled = false;
    manager.onStateChange(() => { throw new Error('boom'); });
    manager.onStateChange(() => { secondCalled = true; });
    updater.emit('checking-for-update');
    expect(secondCalled).toBe(true);
  });

  it('unsubscribe removes the listener', () => {
    let count = 0;
    const off = manager.onStateChange(() => { count++; });
    updater.emit('checking-for-update');
    off();
    updater.emit('update-available', { version: '0.2.0' });
    expect(count).toBe(1);
  });
});
