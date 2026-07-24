// LocalServer — lifecycle manager for the embedded BYAN WebUI child process.
//
// Architecture decision: child_process.fork() over spawn() because:
//   - server.js is a Node.js module, not an arbitrary executable.
//   - fork() gives free bidirectional IPC channel (process.send / process.on('message')).
//   - The child signals the assigned port via { type: 'ready', port } — no stdout parsing.
//   - Electron reuses its own Node runtime for the fork, so no extra binary needed.
//
// Port selection: we pass PORT=0 to the child so the OS picks a free port.
// The assigned port is communicated back via the IPC message above.
//
// Health-ping: every 5 seconds we GET /health. Two consecutive failures
// (timeout >3s OR non-200) trigger a crash declaration and restart logic.
//
// Restart logic: up to 3 restarts within a 60-second window. After that,
// a 'fatal' event is emitted and no further respawn attempts are made.
//
// Windows note: child.kill('SIGTERM') maps to TerminateProcess() on Windows —
// no grace period is possible. We always follow SIGTERM with an immediate SIGKILL
// after 3 seconds on Linux/macOS. On Windows the process is already gone.

import { fork, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

// Narrow logger interface — accepts anything with info/warn/error methods.
export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export interface LocalServer {
  spawn(): Promise<{ port: number; pid: number }>;
  stop(): Promise<void>;
  status(): { running: boolean; port?: number; pid?: number; restarts?: number };
  on(event: 'crash', listener: (info: { code: number | null; signal: string | null }) => void): void;
  on(event: 'restart', listener: (info: { attempt: number; port: number; pid: number }) => void): void;
  on(event: 'fatal', listener: (info: { restarts: number }) => void): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

export interface LocalServerOptions {
  logger?: Logger;
  // Override the server script path — used in tests.
  serverScriptPath?: string;
  // Override health-ping interval in ms — used in tests to avoid long waits.
  healthIntervalMs?: number;
  // Override health-ping timeout in ms — used in tests.
  healthTimeoutMs?: number;
  // Override health-ping fail threshold before crash — used in tests.
  healthFailThreshold?: number;
  // Override restart delay in ms — used in tests.
  restartDelayMs?: number;
}

// How many restarts in a sliding window trigger 'fatal'.
const MAX_RESTARTS = 3;
// Sliding window in ms during which restart count is tracked.
const RESTART_WINDOW_MS = 60_000;
// Milliseconds between health-pings.
const HEALTH_INTERVAL_MS = 5_000;
// HTTP timeout for a single health probe.
const HEALTH_TIMEOUT_MS = 3_000;
// Consecutive failed pings before declaring crash.
const HEALTH_FAIL_THRESHOLD = 2;
// Wait before attempting restart after a crash.
const RESTART_DELAY_MS = 1_000;
// Grace period for SIGTERM before SIGKILL.
const SIGTERM_GRACE_MS = 3_000;

// Resolve the server.js path.
// Packaged app: the webui ships as extraResources preserving the repo layout —
// process.resourcesPath/install/src/webui/server.js (its relative requires to
// ../../../src/byan-v2/lib then resolve identically to the dev checkout).
// Dev checkout: dist/main/local-server.js -> ../../install/src/webui/server.js.
// In tests: overridden via LocalServerOptions.serverScriptPath.
function defaultServerScriptPath(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    const packaged = path.join(resourcesPath, 'install', 'src', 'webui', 'server.js');
    if (fs.existsSync(packaged)) return packaged;
  }
  return path.resolve(__dirname, '..', '..', 'install', 'src', 'webui', 'server.js');
}

// NODE_PATH for the forked child. A plain Node child cannot require() modules
// packed inside app.asar; ws is therefore asar-unpacked and resolved through
// NODE_PATH -> resources/app.asar.unpacked/node_modules. Existing NODE_PATH
// entries are preserved (path delimiter of the host OS).
function childNodePath(): string | undefined {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (!resourcesPath) return process.env.NODE_PATH;
  const unpacked = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules');
  if (!fs.existsSync(unpacked)) return process.env.NODE_PATH;
  return process.env.NODE_PATH ? `${unpacked}${path.delimiter}${process.env.NODE_PATH}` : unpacked;
}

class LocalServerImpl extends EventEmitter implements LocalServer {
  private readonly log: Logger;
  private readonly serverScriptPath: string;
  private readonly healthIntervalMs: number;
  private readonly healthTimeoutMs: number;
  private readonly healthFailThreshold: number;
  private readonly restartDelayMs: number;

  private child: ChildProcess | null = null;
  private port: number | undefined;
  private pid: number | undefined;
  private running: boolean = false;

  // Restart tracking — timestamps of past restarts within the window.
  private restartTimestamps: number[] = [];

  // Health-ping state.
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private consecutiveHealthFails: number = 0;

  // The pending restart timer. Stored so stop() can CANCEL it (an untracked
  // timer resurrected the server after an explicit stop), and used as a
  // single-flight guard (the health-crash path and the child 'exit' handler
  // both used to schedule a restart for the same crash — double fork).
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  // Guard: once fatal, no more spawning.
  private fatal: boolean = false;
  // Guard: stop() in progress, ignore crash events.
  private stopping: boolean = false;

  constructor(opts: LocalServerOptions = {}) {
    super();
    this.log = opts.logger ?? {
      info: () => {},
      warn: () => {},
      error: () => {}
    };
    this.serverScriptPath = opts.serverScriptPath ?? defaultServerScriptPath();
    this.healthIntervalMs = opts.healthIntervalMs ?? HEALTH_INTERVAL_MS;
    this.healthTimeoutMs = opts.healthTimeoutMs ?? HEALTH_TIMEOUT_MS;
    this.healthFailThreshold = opts.healthFailThreshold ?? HEALTH_FAIL_THRESHOLD;
    this.restartDelayMs = opts.restartDelayMs ?? RESTART_DELAY_MS;
  }

  // E2E hook: BYAN_E2E_MOCK_SERVER_PORT short-circuits both spawn and status
  // so Playwright tests never fork install/src/webui/server.js (which is not
  // packaged into the release/ tree by electron-builder anyway).
  private mockPort(): number | null {
    if (process.env.BYAN_E2E_MODE !== '1') return null;
    const raw = process.env.BYAN_E2E_MOCK_SERVER_PORT;
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // Public status snapshot — synchronous so the IPC handler can call it without await.
  status(): { running: boolean; port?: number; pid?: number; restarts?: number } {
    const mock = this.mockPort();
    if (mock !== null) {
      return { running: true, port: mock, pid: 1, restarts: 0 };
    }
    return {
      running: this.running,
      port: this.port,
      pid: this.pid,
      restarts: this.restartTimestamps.length
    };
  }

  // Spawn the child process and wait for the 'ready' IPC message.
  // Idempotent: if already running, returns current port+pid immediately.
  async spawn(): Promise<{ port: number; pid: number }> {
    const mock = this.mockPort();
    if (mock !== null) {
      // E2E mode: pretend the server is up without forking anything.
      this.running = true;
      this.port = mock;
      this.pid = 1;
      return { port: mock, pid: 1 };
    }

    if (this.running && this.port !== undefined && this.pid !== undefined) {
      return { port: this.port, pid: this.pid };
    }

    if (this.fatal) {
      throw new Error('LocalServer is in fatal state — cannot spawn');
    }

    return this._doSpawn();
  }

  private _doSpawn(): Promise<{ port: number; pid: number }> {
    return new Promise((resolve, reject) => {
      const nodePath = childNodePath();
      const child = fork(this.serverScriptPath, [], {
        env: {
          ...process.env,
          // PORT=0 lets the OS assign a free port; the child reports the actual
          // assigned port back via process.send({ type: 'ready', port }).
          PORT: '0',
          BYAN_PROJECT_ROOT: process.env.BYAN_PROJECT_ROOT ?? process.cwd(),
          ...(nodePath ? { NODE_PATH: nodePath } : {})
        },
        // silent: true captures stdout/stderr so we can pipe them to our logger.
        silent: true
      });

      this.child = child;

      // Pipe child stdout/stderr into the parent logger.
      child.stdout?.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().trim().split('\n');
        for (const line of lines) {
          if (line) this.log.info(`[local-server] ${line}`);
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().trim().split('\n');
        for (const line of lines) {
          if (line) this.log.error(`[local-server] ${line}`);
        }
      });

      // Resolve as soon as the child reports its assigned port.
      let resolved = false;

      child.on('message', (msg: unknown) => {
        if (
          resolved ||
          typeof msg !== 'object' ||
          msg === null ||
          (msg as Record<string, unknown>).type !== 'ready'
        ) return;

        const port = (msg as Record<string, unknown>).port as number;
        const pid = child.pid as number;

        this.port = port;
        this.pid = pid;
        this.running = true;
        resolved = true;

        this.log.info(`[local-server] running on port ${port} (pid ${pid})`);
        this._startHealthPing();
        resolve({ port, pid });
      });

      child.on('exit', (code, signal) => {
        if (!resolved) {
          // Failed before signalling ready.
          reject(new Error(`Server exited before ready (code=${code}, signal=${signal})`));
        }
        this._onChildExit(code, signal);
      });

      child.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
        this.log.error(`[local-server] child error: ${err.message}`);
      });
    });
  }

  // Graceful stop: SIGTERM, wait SIGTERM_GRACE_MS, then SIGKILL.
  async stop(): Promise<void> {
    this.stopping = true;
    this._stopHealthPing();
    // A crash may have armed a restart; without this, the timer fires after
    // _resetState() cleared `stopping` and forks a server the caller was just
    // told is stopped.
    this._cancelPendingRestart();

    const child = this.child;
    if (!child) {
      this._resetState();
      return;
    }

    return new Promise<void>((resolve) => {
      const onDone = () => {
        this._resetState();
        resolve();
      };

      const killTimer = setTimeout(() => {
        // Grace period expired — force kill.
        // On Windows, SIGTERM already terminated the process immediately,
        // so this may be a no-op; kill() handles that safely.
        try { child.kill('SIGKILL'); } catch { /* process already gone */ }
        onDone();
      }, SIGTERM_GRACE_MS);

      child.once('exit', () => {
        clearTimeout(killTimer);
        onDone();
      });

      try {
        child.kill('SIGTERM');
      } catch {
        // Process already gone.
        clearTimeout(killTimer);
        onDone();
      }
    });
  }

  private _onChildExit(code: number | null, signal: string | null): void {
    // Reset running state.
    this.running = false;
    this.child = null;
    this._stopHealthPing();

    if (this.stopping || this.fatal) {
      // Expected stop or already in fatal state — no action.
      return;
    }

    if (this.restartTimer !== null) {
      // The health-crash path already declared this crash (it SIGKILLed the
      // child and scheduled the restart) — this exit is its consequence, not a
      // second crash. Emitting + scheduling again forked TWO servers.
      return;
    }

    this.log.warn(`[local-server] exited (code=${code}, signal=${signal})`);
    this.emit('crash', { code, signal });
    this._scheduleRestart();
  }

  private _cancelPendingRestart(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private _scheduleRestart(): void {
    if (this.fatal || this.restartTimer !== null) return;

    const now = Date.now();
    // Evict timestamps outside the sliding window.
    this.restartTimestamps = this.restartTimestamps.filter(
      (t) => now - t < RESTART_WINDOW_MS
    );

    if (this.restartTimestamps.length >= MAX_RESTARTS) {
      this.fatal = true;
      this.log.error(
        `[local-server] fatal: ${MAX_RESTARTS} restarts within ${RESTART_WINDOW_MS / 1000}s`
      );
      this.emit('fatal', { restarts: this.restartTimestamps.length });
      return;
    }

    this.restartTimestamps.push(now);
    this.log.info(`[local-server] scheduling restart (attempt ${this.restartTimestamps.length})`);

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.fatal || this.stopping) return;

      this._doSpawn()
        .then(({ port, pid }) => {
          this.emit('restart', { attempt: this.restartTimestamps.length, port, pid });
        })
        .catch((err: Error) => {
          this.log.error(`[local-server] restart failed: ${err.message}`);
          // Count this failed spawn as a crash and retry.
          this._scheduleRestart();
        });
    }, this.restartDelayMs);
  }

  private _startHealthPing(): void {
    this.consecutiveHealthFails = 0;
    this.healthTimer = setInterval(() => {
      void this._ping();
    }, this.healthIntervalMs);
  }

  private _stopHealthPing(): void {
    if (this.healthTimer !== null) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  private async _ping(): Promise<void> {
    if (!this.running || this.port === undefined) return;

    const url = `http://localhost:${this.port}/health`;
    let ok = false;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.healthTimeoutMs);

      try {
        const res = await fetch(url, { signal: controller.signal });
        ok = res.status === 200;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      ok = false;
    }

    if (ok) {
      this.consecutiveHealthFails = 0;
      return;
    }

    this.consecutiveHealthFails += 1;
    this.log.warn(
      `[local-server] health-ping failed (${this.consecutiveHealthFails}/${HEALTH_FAIL_THRESHOLD})`
    );

    if (this.consecutiveHealthFails >= this.healthFailThreshold) {
      this.log.error('[local-server] health-ping threshold reached — declaring crash');
      this.consecutiveHealthFails = 0;
      this._stopHealthPing();
      this.running = false;

      // Kill the unresponsive child to force a clean restart.
      try { this.child?.kill('SIGKILL'); } catch { /* ignore */ }

      this.emit('crash', { code: null, signal: 'HEALTH_TIMEOUT' });
      this._scheduleRestart();
    }
  }

  private _resetState(): void {
    this.running = false;
    this.port = undefined;
    this.pid = undefined;
    this.child = null;
    this.stopping = false;
  }
}

export function createLocalServer(opts?: LocalServerOptions): LocalServer {
  return new LocalServerImpl(opts);
}
