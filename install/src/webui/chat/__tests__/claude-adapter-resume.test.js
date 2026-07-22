/**
 * ClaudeAdapter F3 — verifies the spawn args: --resume when resuming an existing
 * session, --session-id only for a pinned fresh one, and neither by default.
 */

const child_process = require('child_process');

jest.mock('child_process');

const ClaudeAdapter = require('../claude-adapter');

function fakeProc() {
  return {
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    stdin: { write: jest.fn(), writable: true },
    on: jest.fn(),
    kill: jest.fn(),
    exitCode: null,
  };
}

describe('ClaudeAdapter — resume vs fresh spawn args', () => {
  let spawned;
  beforeEach(() => {
    spawned = [];
    child_process.spawn.mockImplementation((cmd, args, opts) => {
      spawned.push({ cmd, args, opts });
      return fakeProc();
    });
  });
  afterEach(() => jest.clearAllMocks());

  it('passes --resume <id> and the session cwd when resuming', async () => {
    const adapter = new ClaudeAdapter({ projectRoot: '/home/yan/proj', resumeSessionId: 'uuid-1' });
    await adapter.start();
    const call = spawned[0];
    expect(call.cmd).toBe('claude');
    expect(call.args).toContain('--resume');
    expect(call.args[call.args.indexOf('--resume') + 1]).toBe('uuid-1');
    expect(call.args).not.toContain('--session-id');
    expect(call.opts.cwd).toBe('/home/yan/proj');
  });

  it('does not pass --resume or --session-id on a fresh session', async () => {
    const adapter = new ClaudeAdapter({ projectRoot: '/tmp/x' });
    await adapter.start();
    const call = spawned[0];
    expect(call.args).not.toContain('--resume');
    expect(call.args).not.toContain('--session-id');
  });

  it('resume takes precedence over a captured _sessionId', async () => {
    const adapter = new ClaudeAdapter({ projectRoot: '/tmp/x', resumeSessionId: 'uuid-2' });
    adapter._sessionId = 'old-pinned';
    await adapter.start();
    const call = spawned[0];
    expect(call.args).toContain('--resume');
    expect(call.args).not.toContain('--session-id');
  });
});
