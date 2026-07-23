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

  it('always passes --verbose with --print + stream-json (CLI hard requirement)', async () => {
    // The Claude CLI refuses `--print --output-format stream-json` without
    // --verbose: "When using --print, --output-format=stream-json requires
    // --verbose". Missing it broke the chat with a spawn-time error.
    const adapter = new ClaudeAdapter({ projectRoot: '/tmp/x' });
    await adapter.start();
    const { args } = spawned[0];
    expect(args).toContain('--print');
    expect(args).toContain('--verbose');
    expect(args).toContain('stream-json');
  });

  it('resume takes precedence over a captured _sessionId', async () => {
    const adapter = new ClaudeAdapter({ projectRoot: '/tmp/x', resumeSessionId: 'uuid-2' });
    adapter._sessionId = 'old-pinned';
    await adapter.start();
    const call = spawned[0];
    expect(call.args).toContain('--resume');
    expect(call.args).not.toContain('--session-id');
  });

  it('sends a user turn in the stream-json message shape (message/role wrapper)', async () => {
    const adapter = new ClaudeAdapter({ projectRoot: '/tmp/x' });
    await adapter.start();
    await adapter.send('bonjour');
    const written = adapter.process.stdin.write.mock.calls[0][0];
    // A flat {type,content} makes the CLI throw "Expected message role 'user'".
    expect(JSON.parse(written)).toEqual({ type: 'user', message: { role: 'user', content: 'bonjour' } });
  });
});

describe('ClaudeAdapter — result event handling', () => {
  it('routes a result with is_error:true to onError, not onComplete', () => {
    const onError = jest.fn();
    const onComplete = jest.fn();
    const adapter = new ClaudeAdapter({ projectRoot: '/tmp/x', onError, onComplete });
    adapter._parseLine(JSON.stringify({ type: 'result', is_error: true, subtype: 'error_max_turns', result: 'boom' }));
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toContain('boom');
  });

  it('reads the cost from total_cost_usd (not the non-existent cost_usd)', () => {
    const onComplete = jest.fn();
    const adapter = new ClaudeAdapter({ projectRoot: '/tmp/x', onComplete });
    adapter._parseLine(JSON.stringify({ type: 'result', is_error: false, result: 'ok', total_cost_usd: 0.42, session_id: 'sid-1' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({ result: 'ok', cost: 0.42, sessionId: 'sid-1' });
  });
});
