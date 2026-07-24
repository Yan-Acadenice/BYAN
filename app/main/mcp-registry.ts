// MCP process registry — manages the lifecycle of child processes spawned
// from .mcp.json entries.
//
// Design:
//   - Pure module (no Electron dep) so it can be unit-tested in node.
//   - The `spawn` function is injected so tests can swap in a mock.
//   - Status changes (running ↔ stopped ↔ error) are pushed through onStatusChange,
//     which the IPC layer forwards to all renderer windows.
//   - Only stdio transport is supported in this iteration; http servers are
//     listed but cannot be started/stopped from here (they live remotely).

import { spawn as nodeSpawn } from 'child_process';
import type { McpStatus } from '../shared/ipc-contract';
import type { McpServerConfig } from './mcp-config';

export interface SpawnLike {
  (
    command: string,
    args: ReadonlyArray<string>,
    options: { env?: NodeJS.ProcessEnv; cwd?: string; stdio: 'pipe' | 'ignore'; detached?: boolean }
  ): ChildLike;
}

// Subset of ChildProcess the registry uses. Lets tests pass an EventEmitter-only mock.
export interface ChildLike {
  pid?: number;
  kill(signal?: NodeJS.Signals | number): boolean;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  stderr?: { on(event: 'data', listener: (chunk: Buffer) => void): unknown } | null;
}

interface RegistryEntry {
  status: McpStatus;
  proc?: ChildLike;
  stderrTail: string;
}

export type StatusListener = (id: string, status: McpStatus) => void;

export interface McpRegistryDeps {
  spawn?: SpawnLike;
  // Defaults to process.env. Injected so tests can isolate.
  baseEnv?: NodeJS.ProcessEnv;
  // Max bytes of stderr kept per process — surfaced in the error message on crash.
  stderrBufferBytes?: number;
}

const STDERR_BUFFER_DEFAULT = 4096;
// Grace period after SIGTERM before the SIGKILL escalation.
const SIGTERM_GRACE_MS = 3_000;

// Signal the process GROUP on POSIX so an MCP server that forked its own
// children takes them along (same rationale as engines/kill-tree.ts: children
// are spawned detached, a negative-pid signal reaches the whole group).
// Windows has no POSIX groups -> direct kill of the parent.
function killGroup(proc: ChildLike, signal: NodeJS.Signals): void {
  const pid = proc.pid;
  if (process.platform !== 'win32' && typeof pid === 'number') {
    try { process.kill(-pid, signal); return; } catch { /* group gone / not a leader — fall back */ }
  }
  try { proc.kill(signal); } catch { /* already dead */ }
}

export class McpProcessRegistry {
  private readonly entries = new Map<string, RegistryEntry>();
  private readonly listeners = new Set<StatusListener>();
  private readonly spawn: SpawnLike;
  private readonly baseEnv: NodeJS.ProcessEnv;
  private readonly stderrBufferBytes: number;

  constructor(deps: McpRegistryDeps = {}) {
    this.spawn = deps.spawn ?? (nodeSpawn as unknown as SpawnLike);
    this.baseEnv = deps.baseEnv ?? process.env;
    this.stderrBufferBytes = deps.stderrBufferBytes ?? STDERR_BUFFER_DEFAULT;
  }

  onStatusChange(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(id: string): McpStatus {
    return this.entries.get(id)?.status ?? { state: 'stopped' };
  }

  // Snapshot of all known statuses — used by list() to merge with config.
  snapshot(): Map<string, McpStatus> {
    const out = new Map<string, McpStatus>();
    for (const [id, e] of this.entries) out.set(id, e.status);
    return out;
  }

  isRunning(id: string): boolean {
    return this.entries.get(id)?.status.state === 'running';
  }

  async start(server: McpServerConfig): Promise<McpStatus> {
    if (server.transport !== 'stdio') {
      throw new Error(`mcp: transport "${server.transport}" cannot be started locally`);
    }
    if (!server.command) {
      throw new Error('mcp: command is required for stdio servers');
    }
    if (this.isRunning(server.id)) {
      return this.entries.get(server.id)!.status;
    }

    this.setStatus(server.id, { state: 'starting', since: new Date().toISOString() });

    const env: NodeJS.ProcessEnv = { ...this.baseEnv, ...(server.env ?? {}) };
    const args = server.args ?? [];

    let child: ChildLike;
    try {
      child = this.spawn(server.command, args, {
        env,
        cwd: server.cwd,
        stdio: 'pipe',
        // Own process group on POSIX so stop/stopAll can reap the server AND
        // any children it forks (killGroup's negative-pid signal).
        detached: process.platform !== 'win32',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status: McpStatus = { state: 'error', message: `Failed to spawn: ${message}` };
      this.setStatus(server.id, status);
      return status;
    }

    const entry: RegistryEntry = {
      status: { state: 'running', since: new Date().toISOString(), pid: child.pid ?? -1 },
      proc: child,
      stderrTail: '',
    };
    this.entries.set(server.id, entry);
    this.notify(server.id, entry.status);

    child.stderr?.on('data', (chunk: Buffer) => {
      const next = entry.stderrTail + chunk.toString('utf-8');
      entry.stderrTail = next.length > this.stderrBufferBytes
        ? next.slice(next.length - this.stderrBufferBytes)
        : next;
    });

    child.on('error', (err: Error) => {
      const status: McpStatus = { state: 'error', message: err.message };
      entry.status = status;
      entry.proc = undefined;
      this.notify(server.id, status);
    });

    child.on('exit', (code, signal) => {
      // SIGTERM after a stop() request is the normal path → state: 'stopped'.
      // Any other non-zero exit is an error.
      const expectedSignal = signal === 'SIGTERM' || signal === 'SIGKILL';
      const status: McpStatus =
        code === 0 || expectedSignal
          ? { state: 'stopped' }
          : {
              state: 'error',
              message: this.formatExitMessage(code, signal, entry.stderrTail),
            };
      entry.status = status;
      entry.proc = undefined;
      this.notify(server.id, status);
    });

    return entry.status;
  }

  // Graceful stop: SIGTERM, escalate to SIGKILL after the grace period, and
  // resolve only when the exit event fires (bounded — a stop() that resolved
  // on SIGTERM alone let update() restart the OLD command, and a
  // SIGTERM-ignoring server was unstoppable from the UI).
  async stop(id: string, graceMs = SIGTERM_GRACE_MS): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry || !entry.proc) return;
    const proc = entry.proc;
    await new Promise<void>((resolve) => {
      let settled = false;
      // settle only ever runs from the timers / the exit event below, so the
      // const timer bindings are always initialized by the time it fires.
      const settle = () => {
        if (settled) return;
        settled = true;
        clearTimeout(killTimer);
        clearTimeout(hardTimer);
        resolve();
      };
      const killTimer = setTimeout(() => killGroup(proc, 'SIGKILL'), graceMs);
      // Absolute bound: never leave the caller hanging on a zombie that emits
      // no exit event. State reconciliation stays with the start() listeners.
      const hardTimer = setTimeout(settle, graceMs * 2);
      proc.on('exit', settle);
      killGroup(proc, 'SIGTERM');
    });
  }

  // Kill EVERY running MCP child — called at app quit so a Settings-started stdio
  // server does not orphan (a spawned child does not die with the parent on
  // Linux). Best-effort SIGTERM then SIGKILL ; the app is exiting, no grace.
  stopAll(): void {
    for (const [, entry] of this.entries) {
      if (!entry.proc) continue;
      killGroup(entry.proc, 'SIGTERM');
      killGroup(entry.proc, 'SIGKILL');
      entry.proc = undefined;
    }
  }

  // Stops the process and waits for the exit event (with timeout safety).
  async restart(server: McpServerConfig, timeoutMs = 3000): Promise<McpStatus> {
    if (this.isRunning(server.id)) {
      await new Promise<void>((resolve) => {
        const unsubscribe = this.onStatusChange((id, status) => {
          if (id !== server.id) return;
          if (status.state === 'stopped' || status.state === 'error') {
            unsubscribe();
            resolve();
          }
        });
        void this.stop(server.id);
        setTimeout(() => {
          unsubscribe();
          resolve();
        }, timeoutMs);
      });
    }
    return this.start(server);
  }

  private setStatus(id: string, status: McpStatus): void {
    const existing = this.entries.get(id);
    if (existing) {
      existing.status = status;
    } else {
      this.entries.set(id, { status, stderrTail: '' });
    }
    this.notify(id, status);
  }

  private formatExitMessage(
    code: number | null,
    signal: NodeJS.Signals | null,
    stderrTail: string
  ): string {
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    const tail = stderrTail.trim();
    return tail
      ? `Exited with ${reason}\n${tail.slice(-512)}`
      : `Exited with ${reason}`;
  }

  private notify(id: string, status: McpStatus): void {
    for (const listener of this.listeners) {
      try {
        listener(id, status);
      } catch {
        // a listener must not break the others
      }
    }
  }
}
