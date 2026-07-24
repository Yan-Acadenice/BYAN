// Kill a spawned process AND the children it forked (a CLI loading the
// project's MCP servers spawns `node` children). Killing only the parent pid
// leaves those grandchildren orphaned — reparented to init on Linux — which
// piles up and slows the machine. Children are spawned DETACHED on POSIX (their
// own process group), so a negative-pid signal reaches the whole group.
// Windows has no POSIX process groups -> direct kill of the parent.

import type { ChildProcess } from 'child_process';

// Grace period after SIGTERM before we force-kill a CLI that ignores it.
export const SIGKILL_GRACE_MS = 3_000;

export function killProcTree(proc: ChildProcess, signal: NodeJS.Signals): void {
  const pid = proc.pid;
  if (process.platform !== 'win32' && typeof pid === 'number') {
    try { process.kill(-pid, signal); return; } catch { /* group gone / not a leader — fall back */ }
  }
  try { proc.kill(signal); } catch { /* already dead */ }
}

// Graceful stop: SIGTERM now, SIGKILL after the grace period unless the
// process exits first. The timer is unref'd so it never holds the app open.
export function stopProcTree(proc: ChildProcess, graceMs = SIGKILL_GRACE_MS): void {
  killProcTree(proc, 'SIGTERM');
  const timer = setTimeout(() => killProcTree(proc, 'SIGKILL'), graceMs);
  if (typeof (timer as { unref?: () => void }).unref === 'function') (timer as unknown as { unref: () => void }).unref();
  proc.once('exit', () => clearTimeout(timer));
}

// Quit path: no grace period possible (app.exit is imminent) — TERM then KILL.
export function killProcTreeNow(proc: ChildProcess): void {
  killProcTree(proc, 'SIGTERM');
  killProcTree(proc, 'SIGKILL');
}
