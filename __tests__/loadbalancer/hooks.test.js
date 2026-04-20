const { createClaudeHooks } = require('../../src/loadbalancer/hooks/claude-hooks');
const { attachCopilotHooks, wrapCopilotSend } = require('../../src/loadbalancer/hooks/copilot-hooks');

function mockTracker() {
  return {
    record429Calls: [],
    recordSuccessCalls: 0,
    recordHeadersCalls: [],
    record429(opts) { this.record429Calls.push(opts); },
    recordSuccess() { this.recordSuccessCalls += 1; },
    recordHeaders(h) { this.recordHeadersCalls.push(h); },
  };
}

function mockSession() {
  const listeners = {};
  return {
    listeners,
    on(event, cb) { (listeners[event] = listeners[event] || []).push(cb); },
    emit(event, arg) { (listeners[event] || []).forEach((cb) => cb(arg)); },
  };
}

describe('loadbalancer/hooks/claude-hooks', () => {
  test('createClaudeHooks returns PostToolUseFailure + Stop arrays', () => {
    const t = mockTracker();
    const hooks = createClaudeHooks(t);
    expect(Array.isArray(hooks.PostToolUseFailure)).toBe(true);
    expect(Array.isArray(hooks.Stop)).toBe(true);
  });

  test('PostToolUseFailure records 429 on RateLimitError', () => {
    const t = mockTracker();
    const hooks = createClaudeHooks(t);
    hooks.PostToolUseFailure[0].callback({
      toolName: 'foo',
      error: { name: 'RateLimitError', headers: { 'retry-after': '42' } },
    });
    expect(t.record429Calls).toHaveLength(1);
    expect(t.record429Calls[0].source).toBe('claude-hook');
    expect(t.record429Calls[0].retryAfter).toBe('42');
  });

  test('PostToolUseFailure records 429 on status 429', () => {
    const t = mockTracker();
    const hooks = createClaudeHooks(t);
    hooks.PostToolUseFailure[0].callback({ error: { status: 429, message: 'too many' } });
    expect(t.record429Calls).toHaveLength(1);
  });

  test('PostToolUseFailure does NOT record 429 on unrelated error', () => {
    const t = mockTracker();
    const hooks = createClaudeHooks(t);
    hooks.PostToolUseFailure[0].callback({ error: { status: 500, message: 'oops' } });
    expect(t.record429Calls).toHaveLength(0);
    expect(t.recordSuccessCalls).toBe(0);
  });

  test('Stop hook records 429 when reason includes rate_limit', () => {
    const t = mockTracker();
    const hooks = createClaudeHooks(t);
    hooks.Stop[0].callback({ reason: 'hit rate_limit on anthropic' });
    expect(t.record429Calls).toHaveLength(1);
  });

  test('Stop hook records 429 when reason includes overloaded', () => {
    const t = mockTracker();
    const hooks = createClaudeHooks(t);
    hooks.Stop[0].callback({ reason: 'server overloaded' });
    expect(t.record429Calls).toHaveLength(1);
  });

  test('Stop hook records success on normal stop', () => {
    const t = mockTracker();
    const hooks = createClaudeHooks(t);
    hooks.Stop[0].callback({ reason: 'user_exit' });
    expect(t.record429Calls).toHaveLength(0);
    expect(t.recordSuccessCalls).toBe(1);
  });

  test('Stop hook records success when no reason', () => {
    const t = mockTracker();
    const hooks = createClaudeHooks(t);
    hooks.Stop[0].callback({});
    expect(t.recordSuccessCalls).toBe(1);
  });
});

describe('loadbalancer/hooks/copilot-hooks', () => {
  test('attachCopilotHooks is no-op when session is null', () => {
    const t = mockTracker();
    expect(() => attachCopilotHooks(null, t)).not.toThrow();
    expect(() => attachCopilotHooks({}, t)).not.toThrow(); // no .on method
  });

  test('attaches error listener that records 429', () => {
    const t = mockTracker();
    const s = mockSession();
    attachCopilotHooks(s, t);
    s.emit('error', {
      status: 429,
      headers: { 'x-ratelimit-remaining': '0', 'retry-after': '30' },
    });
    expect(t.record429Calls).toHaveLength(1);
    expect(t.record429Calls[0].source).toBe('copilot-event');
    expect(t.record429Calls[0].headers['retry-after']).toBe('30');
  });

  test('attaches error listener that ignores non-429', () => {
    const t = mockTracker();
    const s = mockSession();
    attachCopilotHooks(s, t);
    s.emit('error', { status: 503, message: 'gateway' });
    expect(t.record429Calls).toHaveLength(0);
  });

  test('attaches response listener that records headers', () => {
    const t = mockTracker();
    const s = mockSession();
    attachCopilotHooks(s, t);
    s.emit('response', {
      headers: { 'x-ratelimit-remaining': '42' },
      rateLimited: false,
    });
    expect(t.recordHeadersCalls).toHaveLength(1);
    expect(t.recordSuccessCalls).toBe(1);
  });

  test('response listener does NOT record success when rateLimited=true', () => {
    const t = mockTracker();
    const s = mockSession();
    attachCopilotHooks(s, t);
    s.emit('response', { headers: {}, rateLimited: true });
    expect(t.recordSuccessCalls).toBe(0);
  });

  test('response with retry-after header triggers recordHeaders', () => {
    const t = mockTracker();
    const s = mockSession();
    attachCopilotHooks(s, t);
    s.emit('response', { headers: { 'retry-after': '60' }, rateLimited: false });
    expect(t.recordHeadersCalls).toHaveLength(1);
    expect(t.recordHeadersCalls[0]['retry-after']).toBe('60');
  });

  test('wrapCopilotSend records success on happy path and forwards result', async () => {
    const t = mockTracker();
    const sendFn = async (x) => ({ ok: true, echo: x });
    const wrapped = wrapCopilotSend(sendFn, t);
    const r = await wrapped('hi');
    expect(r).toEqual({ ok: true, echo: 'hi' });
    expect(t.recordSuccessCalls).toBe(1);
  });

  test('wrapCopilotSend records 429 on rate-limited error and rethrows', async () => {
    const t = mockTracker();
    const err = Object.assign(new Error('rate limit'), {
      status: 429,
      headers: { 'retry-after': '10' },
    });
    const sendFn = async () => { throw err; };
    const wrapped = wrapCopilotSend(sendFn, t);
    await expect(wrapped()).rejects.toThrow(/rate limit/);
    expect(t.record429Calls).toHaveLength(1);
    expect(t.recordHeadersCalls).toHaveLength(1);
    expect(t.recordSuccessCalls).toBe(0);
  });

  test('wrapCopilotSend does NOT record 429 on non-rate-limit error, still rethrows', async () => {
    const t = mockTracker();
    const err = new Error('server exploded');
    const sendFn = async () => { throw err; };
    const wrapped = wrapCopilotSend(sendFn, t);
    await expect(wrapped()).rejects.toThrow(/exploded/);
    expect(t.record429Calls).toHaveLength(0);
    expect(t.recordSuccessCalls).toBe(0);
  });
});
