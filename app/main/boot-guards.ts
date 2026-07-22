// Boot guards — run before anything in main writes to the console.
//
// Root of a whole class of crash on a windowed launch: when the app is started
// by double-click (AppImage from a file manager, .app from Finder), the process
// has no controlling terminal — process.stdout / process.stderr are wired to a
// pipe whose read end is already closed. The FIRST write raises EPIPE, and a
// Node stream with no 'error' listener re-throws it as an uncaughtException.
//
// electron-updater logs to console on every check (and a periodic timer keeps
// checking), so that EPIPE looped: uncaught-exception dialog on repeat, CPU
// pinned, PC frozen. Attaching an 'error' listener that swallows broken-pipe
// codes neutralizes the entire class — not just the updater path.

// Broken-pipe / dead-output error codes. A windowed app cannot act on any of
// these : the pipe is gone (EPIPE), the tty is gone (EIO), or the sink is full
// (ENOSPC). None is recoverable by the app, so none should crash it.
export function isBrokenPipe(err: unknown): boolean {
  const code = (err as { code?: string } | null | undefined)?.code;
  return code === 'EPIPE' || code === 'EIO' || code === 'ENOSPC';
}

interface StreamLike {
  on(event: 'error', listener: (err: unknown) => void): unknown;
}

// Attach a broken-pipe-swallowing error handler to one stdio stream. Returns
// false when the stream is absent (e.g. stdout detached to /dev/null on some
// launchers) so the caller can report what was guarded.
export function guardStream(stream: StreamLike | null | undefined): boolean {
  if (!stream || typeof stream.on !== 'function') return false;
  stream.on('error', (err: unknown) => {
    if (isBrokenPipe(err)) return; // dead/full output pipe — drop it, never crash
    // A non-pipe stdio error is unexpected. Preserve the pre-guard behaviour by
    // surfacing it rather than silently masking a genuine fault.
    throw err;
  });
  return true;
}

// Install the guard on both stdio streams. Idempotent enough for a single boot
// call ; attaching twice would only add a second (harmless) swallow listener.
export function installStdioEpipeGuard(
  proc: Pick<NodeJS.Process, 'stdout' | 'stderr'> = process
): { stdout: boolean; stderr: boolean } {
  return {
    stdout: guardStream(proc.stdout as unknown as StreamLike),
    stderr: guardStream(proc.stderr as unknown as StreamLike),
  };
}

interface ProcLike {
  on(event: 'uncaughtException', listener: (err: unknown) => void): unknown;
}

// Backstop for the SYNCHRONOUS path : when process.stdout is a file / tty (sync
// write), an EPIPE is thrown straight out of console.log rather than emitted as
// a stream 'error' — the exact shape of the freeze (console.log -> write EPIPE
// -> uncaughtException). Swallow broken-pipe uncaught exceptions ; re-surface
// everything else unchanged (a genuine fault must still crash visibly).
export function installUncaughtBrokenPipeGuard(proc: ProcLike = process): void {
  proc.on('uncaughtException', (err: unknown) => {
    if (isBrokenPipe(err)) return; // dead output pipe — not a real fault
    throw err; // genuine uncaught error : terminate as it would without us
  });
}

// One call installs the full stdio crash protection (async stream + sync throw).
export function installBootGuards(proc: NodeJS.Process = process): void {
  installStdioEpipeGuard(proc);
  installUncaughtBrokenPipeGuard(proc as unknown as ProcLike);
}
