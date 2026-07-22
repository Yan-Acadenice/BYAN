// boot-guards tests — the stdio EPIPE guard that stops a dead output pipe
// (double-click launch, no terminal) from crash-looping the main process.

import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  isBrokenPipe,
  guardStream,
  installStdioEpipeGuard,
  installUncaughtBrokenPipeGuard,
} from '../boot-guards';

describe('isBrokenPipe', () => {
  it('classifies EPIPE / EIO / ENOSPC as broken pipe', () => {
    expect(isBrokenPipe({ code: 'EPIPE' })).toBe(true);
    expect(isBrokenPipe({ code: 'EIO' })).toBe(true);
    expect(isBrokenPipe({ code: 'ENOSPC' })).toBe(true);
  });
  it('does not classify other errors or nullish values', () => {
    expect(isBrokenPipe({ code: 'ECONNRESET' })).toBe(false);
    expect(isBrokenPipe(new Error('boom'))).toBe(false);
    expect(isBrokenPipe(null)).toBe(false);
    expect(isBrokenPipe(undefined)).toBe(false);
  });
});

describe('guardStream', () => {
  it('swallows a broken-pipe error instead of re-throwing (no crash)', () => {
    const stream = new EventEmitter();
    expect(guardStream(stream)).toBe(true);
    // emit() with an 'error' event + a listener that returns => no throw.
    const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    expect(() => stream.emit('error', epipe)).not.toThrow();
  });

  it('re-surfaces a genuine (non-pipe) stream error', () => {
    const stream = new EventEmitter();
    guardStream(stream);
    const real = Object.assign(new Error('disk gone'), { code: 'ECONNRESET' });
    expect(() => stream.emit('error', real)).toThrow(/disk gone/);
  });

  it('returns false when the stream is absent', () => {
    expect(guardStream(null)).toBe(false);
    expect(guardStream(undefined)).toBe(false);
  });
});

describe('installStdioEpipeGuard', () => {
  it('guards both stdout and stderr when present', () => {
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const onSpy = vi.spyOn(stdout, 'on');
    const res = installStdioEpipeGuard({ stdout, stderr } as unknown as NodeJS.Process);
    expect(res).toEqual({ stdout: true, stderr: true });
    expect(onSpy).toHaveBeenCalledWith('error', expect.any(Function));
    // A broken pipe on the guarded stdout no longer throws.
    const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    expect(() => stdout.emit('error', epipe)).not.toThrow();
  });

  it('reports false for a missing stream', () => {
    const res = installStdioEpipeGuard({ stdout: undefined, stderr: undefined } as unknown as NodeJS.Process);
    expect(res).toEqual({ stdout: false, stderr: false });
  });
});

describe('installUncaughtBrokenPipeGuard', () => {
  // Capture the registered handler via a fake process so we never touch the
  // real global uncaughtException wiring during the test run.
  function captureHandler(): (err: unknown) => void {
    let handler: ((err: unknown) => void) | undefined;
    installUncaughtBrokenPipeGuard({
      on: (_evt: 'uncaughtException', cb: (err: unknown) => void) => { handler = cb; return undefined; },
    });
    if (!handler) throw new Error('handler not registered');
    return handler;
  }

  it('swallows an uncaught broken-pipe error (the sync console.log EPIPE path)', () => {
    const handler = captureHandler();
    const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    expect(() => handler(epipe)).not.toThrow();
  });

  it('re-surfaces a genuine uncaught error', () => {
    const handler = captureHandler();
    expect(() => handler(new Error('real crash'))).toThrow(/real crash/);
  });
});
