// env-detect.test.ts — unit tests for platform CLI detection.
//
// Strategy: mock child_process.exec so no real which/where is called.
// 6 cases: 3 platforms x 2 OS.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExecException } from 'child_process';

// Mock child_process BEFORE importing the module under test.
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

import { exec as _exec } from 'child_process';
const exec = _exec as ReturnType<typeof vi.fn>;

// Helper: make exec call its callback with the given stdout (success path).
function makeExecSuccess(stdout: string) {
  exec.mockImplementation(
    (
      _cmd: string,
      _opts: unknown,
      cb: (err: ExecException | null, stdout: string, stderr: string) => void
    ) => {
      cb(null, stdout, '');
      // Return a fake child-process-like object with an on() method (no-op).
      return { on: vi.fn() };
    }
  );
}

// Helper: make exec call its callback with a non-zero exit error.
function makeExecFail() {
  exec.mockImplementation(
    (
      _cmd: string,
      _opts: unknown,
      cb: (err: ExecException | null, stdout: string, stderr: string) => void
    ) => {
      const err = new Error('not found') as ExecException;
      err.code = 1;
      cb(err, '', '');
      return { on: vi.fn() };
    }
  );
}

// Re-import after mock is in place.
// Dynamic import ensures the mock applies.
async function getDetect() {
  return await import('../env-detect');
}

describe('detectClaude', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Reset module to clear any cached platform check
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('Linux: returns path when which claude succeeds', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    makeExecSuccess('/usr/bin/claude\n');
    const { detectClaude } = await getDetect();
    const result = await detectClaude();
    expect(result).toBe('/usr/bin/claude');
  });

  it('Linux: returns undefined when which claude exits non-zero', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    makeExecFail();
    const { detectClaude } = await getDetect();
    const result = await detectClaude();
    expect(result).toBeUndefined();
  });

  it('Windows: returns path when where claude.exe succeeds', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    makeExecSuccess('C:\\Users\\user\\AppData\\Local\\Programs\\claude.exe\r\n');
    const { detectClaude } = await getDetect();
    const result = await detectClaude();
    expect(result).toBe('C:\\Users\\user\\AppData\\Local\\Programs\\claude.exe');
  });

  it('Windows: returns undefined when where exits non-zero', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    makeExecFail();
    const { detectClaude } = await getDetect();
    const result = await detectClaude();
    expect(result).toBeUndefined();
  });
});

describe('detectCodex', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('Linux: returns path when which codex succeeds', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    makeExecSuccess('/usr/local/bin/codex\n');
    const { detectCodex } = await getDetect();
    const result = await detectCodex();
    expect(result).toBe('/usr/local/bin/codex');
  });

  it('Linux: returns undefined when codex not found', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    makeExecFail();
    const { detectCodex } = await getDetect();
    const result = await detectCodex();
    expect(result).toBeUndefined();
  });

  it('Windows: returns path when where codex.exe succeeds', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    makeExecSuccess('C:\\path\\to\\codex.exe\r\n');
    const { detectCodex } = await getDetect();
    const result = await detectCodex();
    expect(result).toBe('C:\\path\\to\\codex.exe');
  });
});

describe('detectCopilot', () => {
  it('Linux: returns gh path when gh + copilot extension present', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    // First call: which gh → success; second call: gh extension list → contains copilot
    exec
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: ExecException | null, stdout: string, stderr: string) => void
        ) => {
          cb(null, '/usr/bin/gh\n', '');
          return { on: vi.fn() };
        }
      )
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: ExecException | null, stdout: string, stderr: string) => void
        ) => {
          cb(null, 'gh extension install github/gh-copilot\ngh   copilot  1.0.0\n', '');
          return { on: vi.fn() };
        }
      );

    const { detectCopilot } = await getDetect();
    const result = await detectCopilot();
    expect(result).toBe('/usr/bin/gh');
  });

  it('Linux: returns undefined when gh not found', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    makeExecFail();
    const { detectCopilot } = await getDetect();
    const result = await detectCopilot();
    expect(result).toBeUndefined();
  });

  it('Linux: returns undefined when copilot extension not listed', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    exec
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: ExecException | null, stdout: string, stderr: string) => void
        ) => {
          cb(null, '/usr/bin/gh\n', '');
          return { on: vi.fn() };
        }
      )
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: ExecException | null, stdout: string, stderr: string) => void
        ) => {
          cb(null, 'gh   other-extension  1.0.0\n', '');
          return { on: vi.fn() };
        }
      );

    const { detectCopilot } = await getDetect();
    const result = await detectCopilot();
    expect(result).toBeUndefined();
  });

  it('Windows: returns gh path when where gh + copilot extension present', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    exec
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: ExecException | null, stdout: string, stderr: string) => void
        ) => {
          cb(null, 'C:\\Program Files\\GitHub CLI\\gh.exe\r\n', '');
          return { on: vi.fn() };
        }
      )
      .mockImplementationOnce(
        (
          _cmd: string,
          _opts: unknown,
          cb: (err: ExecException | null, stdout: string, stderr: string) => void
        ) => {
          cb(null, 'gh   copilot  1.0.0\r\n', '');
          return { on: vi.fn() };
        }
      );

    const { detectCopilot } = await getDetect();
    const result = await detectCopilot();
    expect(result).toBe('C:\\Program Files\\GitHub CLI\\gh.exe');
  });
});

describe('detectAll', () => {
  it('returns empty record when all probes fail', async () => {
    makeExecFail();
    const { detectAll } = await getDetect();
    const result = await detectAll();
    expect(result).toEqual({});
  });

  it('returns only detected keys', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    // Only claude probe succeeds
    exec.mockImplementation(
      (
        cmd: string,
        _opts: unknown,
        cb: (err: ExecException | null, stdout: string, stderr: string) => void
      ) => {
        if ((cmd as string).includes('claude')) {
          cb(null, '/usr/bin/claude\n', '');
        } else {
          const err = new Error('not found') as ExecException;
          cb(err, '', '');
        }
        return { on: vi.fn() };
      }
    );

    const { detectAll } = await getDetect();
    const result = await detectAll();
    expect(result.claude).toBe('/usr/bin/claude');
    expect(result.codex).toBeUndefined();
    expect(result.copilot).toBeUndefined();
  });
});
