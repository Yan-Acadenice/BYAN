// Tests for local-server.ts — all child_process.fork() calls are mocked.
// We never touch the real server.js; the mock simulates the IPC protocol.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { createLocalServer } from '../local-server';

// ---------- Mock child_process ----------------------------------------

// A controllable fake child process with stdout/stderr streams.
class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly pid: number;
  private _killed = false;

  constructor(pid = 12345) {
    super();
    this.pid = pid;
  }

  // Simulate the child signalling ready after a short delay.
  simulateReady(port: number, delayMs = 10): void {
    setTimeout(() => {
      this.emit('message', { type: 'ready', port });
    }, delayMs);
  }

  // Simulate the child signalling ready synchronously (for fake-timer tests).
  simulateReadySync(port: number): void {
    this.emit('message', { type: 'ready', port });
  }

  // Simulate an unexpected exit.
  simulateExit(code: number | null = 1, signal: string | null = null): void {
    this.emit('exit', code, signal);
  }

  kill(sig?: string): boolean {
    if (this._killed) return false;
    this._killed = true;
    // Simulate the process exiting when killed.
    setTimeout(() => this.emit('exit', null, sig ?? 'SIGTERM'), 5);
    return true;
  }
}

let fakeChild: FakeChild;
let forkMock: ReturnType<typeof vi.fn>;

vi.mock('child_process', () => ({
  fork: (...args: unknown[]) => forkMock(...args)
}));

// ---------- Mock fetch ---------------------------------------------------

type FetchFn = typeof globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

// ---------- Helpers -------------------------------------------------------

function makeLocalServer(overrides: { serverScriptPath?: string } = {}) {
  return createLocalServer({
    serverScriptPath: overrides.serverScriptPath ?? '/fake/server.js',
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {}
    }
  });
}

// ---------- Setup ---------------------------------------------------------

beforeEach(() => {
  fakeChild = new FakeChild(12345);
  forkMock = vi.fn(() => fakeChild);

  fetchMock = vi.fn();
  (globalThis as Record<string, unknown>).fetch = fetchMock;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------- spawn() tests -------------------------------------------------

describe('spawn()', () => {
  it('resolves with port and pid from ready message', async () => {
    const ls = makeLocalServer();
    fakeChild.simulateReady(12345, 10);

    const result = await ls.spawn();

    expect(result.port).toBe(12345);
    expect(result.pid).toBe(12345);
  });

  it('is idempotent: second call returns same port+pid', async () => {
    const ls = makeLocalServer();
    fakeChild.simulateReady(12345, 10);

    const first = await ls.spawn();
    const second = await ls.spawn();

    expect(second).toEqual(first);
    // fork() should only have been called once.
    expect(forkMock).toHaveBeenCalledTimes(1);
  });

  it('rejects when child exits before sending ready', async () => {
    const ls = makeLocalServer();
    // Exit immediately, no ready message.
    setTimeout(() => fakeChild.simulateExit(1, null), 5);

    await expect(ls.spawn()).rejects.toThrow('exited before ready');
  });

  it('passes PORT=0 and BYAN_PROJECT_ROOT in env', async () => {
    const ls = makeLocalServer();
    fakeChild.simulateReady(12345, 5);
    await ls.spawn();

    const callEnv = forkMock.mock.calls[0][2]?.env as Record<string, string>;
    expect(callEnv.PORT).toBe('0');
    expect(callEnv.BYAN_PROJECT_ROOT).toBeTruthy();
  });

  it('uses silent:true to capture stdout/stderr', async () => {
    const ls = makeLocalServer();
    fakeChild.simulateReady(12345, 5);
    await ls.spawn();

    const callOpts = forkMock.mock.calls[0][2];
    expect(callOpts.silent).toBe(true);
  });
});

// ---------- status() tests ------------------------------------------------

describe('status()', () => {
  it('returns { running: false } before spawn', () => {
    const ls = makeLocalServer();
    expect(ls.status().running).toBe(false);
  });

  it('returns { running: true, port, pid } after spawn', async () => {
    const ls = makeLocalServer();
    fakeChild.simulateReady(12345, 10);
    await ls.spawn();

    const s = ls.status();
    expect(s.running).toBe(true);
    expect(s.port).toBe(12345);
    expect(s.pid).toBe(12345);
  });
});

// ---------- stop() tests --------------------------------------------------

describe('stop()', () => {
  it('resolves cleanly when nothing is running', async () => {
    const ls = makeLocalServer();
    await expect(ls.stop()).resolves.toBeUndefined();
  });

  it('sends SIGTERM and resolves after child exits', async () => {
    const ls = makeLocalServer();
    fakeChild.simulateReady(12345, 10);
    await ls.spawn();

    await ls.stop();

    expect(ls.status().running).toBe(false);
  });

  it('status().running is false after stop()', async () => {
    const ls = makeLocalServer();
    fakeChild.simulateReady(12345, 10);
    await ls.spawn();
    await ls.stop();

    expect(ls.status().running).toBe(false);
    expect(ls.status().port).toBeUndefined();
    expect(ls.status().pid).toBeUndefined();
  });
});

// ---------- Crash + restart tests -----------------------------------------

describe('restart logic', () => {
  it('emits crash and auto-restarts on unexpected exit', async () => {
    const ls = makeLocalServer();

    const crashSpy = vi.fn();
    const restartSpy = vi.fn();
    ls.on('crash', crashSpy);
    ls.on('restart', restartSpy);

    // Second child — configure mockImplementation so fork() always returns the
    // right child regardless of timing.
    const secondChild = new FakeChild(99999);
    let spawnCount = 0;
    forkMock.mockImplementation(() => {
      spawnCount++;
      if (spawnCount === 1) return fakeChild;
      // For the restart, signal ready immediately then stay alive.
      setTimeout(() => secondChild.emit('message', { type: 'ready', port: 22222 }), 5);
      return secondChild;
    });

    // First spawn.
    fakeChild.simulateReady(12345, 10);
    await ls.spawn();
    expect(ls.status().running).toBe(true);

    // Simulate crash.
    fakeChild.simulateExit(1, null);

    // Crash must be emitted synchronously on exit event.
    await vi.waitFor(() => expect(crashSpy).toHaveBeenCalledTimes(1), { timeout: 200 });

    // Restart fires after RESTART_DELAY_MS (1s) — wait for restart event.
    await vi.waitFor(() => expect(restartSpy).toHaveBeenCalledTimes(1), { timeout: 2000 });

    const s = ls.status();
    expect(s.running).toBe(true);
    expect(s.port).toBe(22222);
  });

  it('emits fatal after 3 crashes in 60s and does not respawn', async () => {
    const ls = makeLocalServer();

    const fatalSpy = vi.fn();
    ls.on('fatal', fatalSpy);

    // Every fork returns a child that signals ready then exits immediately.
    let spawnCount = 0;
    forkMock.mockImplementation(() => {
      spawnCount++;
      const c = new FakeChild(spawnCount * 100);
      setTimeout(() => {
        c.emit('message', { type: 'ready', port: 3000 + spawnCount });
        setTimeout(() => c.simulateExit(1, null), 10);
      }, 5);
      return c;
    });

    await ls.spawn();

    // 3 restarts × 1s delay + margin; each child crashes quickly.
    await vi.waitFor(() => expect(fatalSpy).toHaveBeenCalledTimes(1), { timeout: 6000 });

    // No more spawning after fatal.
    const countAfterFatal = forkMock.mock.calls.length;
    await new Promise((r) => setTimeout(r, 300));
    expect(forkMock.mock.calls.length).toBe(countAfterFatal);
  }, 10_000);
});

// ---------- Health-ping tests ---------------------------------------------
// We use real timers with a very short interval (20ms) to avoid fake-timer
// complexity with fire-and-forget async setInterval callbacks.

const FAST_HEALTH_OPTS = {
  healthIntervalMs: 20,
  healthTimeoutMs: 50,
  healthFailThreshold: 2,
  restartDelayMs: 10
} as const;

describe('health-ping', () => {
  it('declares crash after 2 consecutive health failures', async () => {
    const ls = createLocalServer({
      serverScriptPath: '/fake/server.js',
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      ...FAST_HEALTH_OPTS
    });

    const crashSpy = vi.fn();
    ls.on('crash', crashSpy);

    fakeChild.simulateReady(12345, 5);
    await ls.spawn();

    // All health-pings return 503.
    fetchMock.mockResolvedValue({ status: 503 });

    // Wait until at least one HEALTH_TIMEOUT crash is declared.
    // More than one crash is acceptable because restart attempts may also fail.
    await vi.waitFor(() => expect(crashSpy.mock.calls.length).toBeGreaterThanOrEqual(1), { timeout: 500 });

    // The first crash must be HEALTH_TIMEOUT.
    expect(crashSpy.mock.calls[0][0].signal).toBe('HEALTH_TIMEOUT');
    await ls.stop();
  });

  it('resets fail count on successful ping', async () => {
    const ls = createLocalServer({
      serverScriptPath: '/fake/server.js',
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      ...FAST_HEALTH_OPTS
    });

    const crashSpy = vi.fn();
    ls.on('crash', crashSpy);

    fakeChild.simulateReady(12345, 5);
    await ls.spawn();

    // First ping fails; all subsequent return 200.
    fetchMock
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValue({ status: 200 });

    // Wait for 3 intervals to fire — fail count should be reset after first success.
    await new Promise((r) => setTimeout(r, 150));

    // No crash because fail count was reset after the successful second ping.
    expect(crashSpy).not.toHaveBeenCalled();
    await ls.stop();
  });
});

// ---------- Restart cancellation + single-flight (regressions) -------------

describe('restart cancellation and single-flight', () => {
  it('stop() cancels a pending restart — the server does not resurrect', async () => {
    const ls = createLocalServer({
      serverScriptPath: '/fake/server.js',
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      restartDelayMs: 50
    });

    fakeChild.simulateReady(12345, 5);
    await ls.spawn();
    expect(forkMock).toHaveBeenCalledTimes(1);

    // Crash arms a restart for t+50ms; the child is already gone when stop()
    // runs, so stop() takes the fast path. Before the fix the untracked timer
    // survived _resetState (which cleared `stopping`) and re-forked the server.
    fakeChild.simulateExit(1, null);
    await ls.stop();

    await new Promise((r) => setTimeout(r, 150));
    expect(forkMock).toHaveBeenCalledTimes(1);
    expect(ls.status().running).toBe(false);
  });

  it('a health-declared crash is ONE crash, not two (kill-exit dedup)', async () => {
    const ls = createLocalServer({
      serverScriptPath: '/fake/server.js',
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      healthIntervalMs: 20,
      healthTimeoutMs: 50,
      healthFailThreshold: 2,
      restartDelayMs: 300
    });

    const crashSpy = vi.fn();
    ls.on('crash', crashSpy);

    fakeChild.simulateReady(12345, 5);
    await ls.spawn();

    fetchMock.mockResolvedValue({ status: 503 });

    // Health path declares the crash and SIGKILLs the child; the killed
    // child's own exit must NOT be counted as a second crash (it used to
    // schedule a second restart -> double fork, first child leaked).
    await vi.waitFor(() => expect(crashSpy.mock.calls.length).toBeGreaterThanOrEqual(1), { timeout: 500 });
    // The fake child exits ~5ms after the SIGKILL — give it room, but stay
    // under restartDelayMs so no restart chain muddies the count.
    await new Promise((r) => setTimeout(r, 100));

    expect(crashSpy).toHaveBeenCalledTimes(1);
    expect(crashSpy.mock.calls[0][0].signal).toBe('HEALTH_TIMEOUT');
    expect(forkMock).toHaveBeenCalledTimes(1); // the restart has not fired yet

    await ls.stop(); // also cancels the pending restart
    await new Promise((r) => setTimeout(r, 350));
    expect(forkMock).toHaveBeenCalledTimes(1);
  });
});
