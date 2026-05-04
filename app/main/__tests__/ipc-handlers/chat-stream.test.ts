// Unit tests for the SSE stream handler (openSseStream).
// All network calls and SecureStore are mocked — no actual HTTP/SSE traffic.
//
// Strategy: build a fake readable stream that emits SSE lines and verify that
// the IpcMainInvokeEvent.sender.send calls match the expected chunk sequence.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- SecureStore mock ----

const mockSecureStore = vi.hoisted(() => ({
  get: vi.fn<[string], Promise<string | null>>(),
  set: vi.fn<[string, string], Promise<void>>().mockResolvedValue(undefined),
  delete: vi.fn<[string], Promise<void>>().mockResolvedValue(undefined),
  _resetForTests: vi.fn(),
}));

vi.mock('../../secure-store', () => ({
  secureStore: mockSecureStore,
  _resetKeytarState: vi.fn(),
}));

// ---- fetch mock ----

const mockFetch = vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>();
vi.stubGlobal('fetch', mockFetch);

// Import after mocks.
import { openSseStream } from '../../ipc-handlers/byan-web';

// ---- Helpers ----

/** Builds a fake IpcMainInvokeEvent with a spy on sender.send. */
function makeFakeEvt() {
  const send = vi.fn();
  return {
    sender: { isDestroyed: () => false, send },
    processId: 1,
    frameId: 1,
    senderFrame: null,
  } as unknown as Electron.IpcMainInvokeEvent;
}

/** Builds a fake AbortController that never fires on its own. */
function makeCtrl() {
  return new AbortController();
}

/** Encodes SSE lines into a ReadableStream that resolves all at once. */
function makeStream(lines: string[]): ReadableStream<Uint8Array> {
  const text = lines.join('\n') + '\n';
  const bytes = new TextEncoder().encode(text);
  let read = false;
  return new ReadableStream({
    pull(ctrl) {
      if (!read) {
        read = true;
        ctrl.enqueue(bytes);
      } else {
        ctrl.close();
      }
    },
  });
}

/** Builds a Response with SSE body from the given SSE data objects. */
function makeSseResponse(events: unknown[]): Response {
  const lines = events.map((e) => `data: ${JSON.stringify(e)}`);
  return {
    ok: true,
    status: 200,
    body: makeStream(lines),
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  mockSecureStore.get.mockReset();
  mockSecureStore.get.mockImplementation((key: string) => {
    if (key === 'auth.token') return Promise.resolve('byan_' + '0'.repeat(64));
    if (key === 'auth.url') return Promise.resolve(null);
    return Promise.resolve(null);
  });
});

// ---------- Tests ----------

describe('openSseStream — chunk forwarding', () => {
  it('forwards chunk and end events to sender.send', async () => {
    const evt = makeFakeEvt();
    const ctrl = makeCtrl();
    mockFetch.mockResolvedValueOnce(makeSseResponse([
      { type: 'chunk', delta: 'Hello' },
      { type: 'chunk', delta: ' world' },
      { type: 'end', message_id: 'msg-1', credential_source: 'user' },
    ]));

    await openSseStream(evt, 'stream-1', ctrl, 'conv-1', 'test prompt', {});

    const calls = evt.sender.send.mock.calls as [string, unknown][];
    // Should emit 2 chunk events + 1 end event
    const chunks = calls.filter(([, p]) => (p as { type: string }).type === 'chunk');
    const ends = calls.filter(([, p]) => (p as { type: string }).type === 'end');

    expect(chunks).toHaveLength(2);
    expect((chunks[0][1] as { delta: string }).delta).toBe('Hello');
    expect((chunks[1][1] as { delta: string }).delta).toBe(' world');

    expect(ends).toHaveLength(1);
    expect((ends[0][1] as { messageId: string }).messageId).toBe('msg-1');
    expect((ends[0][1] as { credentialSource: string }).credentialSource).toBe('user');

    // All events share the same streamId
    for (const [, p] of calls) {
      expect((p as { streamId: string }).streamId).toBe('stream-1');
    }
  });

  it('forwards error events from backend as type:error', async () => {
    const evt = makeFakeEvt();
    const ctrl = makeCtrl();
    mockFetch.mockResolvedValueOnce(makeSseResponse([
      { type: 'error', error: 'No CLI binding' },
    ]));

    await openSseStream(evt, 'stream-2', ctrl, 'conv-2', 'test', {});

    const calls = evt.sender.send.mock.calls as [string, unknown][];
    const errors = calls.filter(([, p]) => (p as { type: string }).type === 'error');
    expect(errors).toHaveLength(1);
    expect((errors[0][1] as { error: string }).error).toBe('No CLI binding');
  });

  it('sends error event when API returns non-200', async () => {
    const evt = makeFakeEvt();
    const ctrl = makeCtrl();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    } as unknown as Response);

    await openSseStream(evt, 'stream-3', ctrl, 'conv-3', 'test', {});

    const calls = evt.sender.send.mock.calls as [string, unknown][];
    expect(calls).toHaveLength(1);
    expect((calls[0][1] as { type: string }).type).toBe('error');
  });

  it('sends error event when token is missing', async () => {
    mockSecureStore.get.mockResolvedValue(null);
    const evt = makeFakeEvt();
    const ctrl = makeCtrl();

    await openSseStream(evt, 'stream-4', ctrl, 'conv-4', 'test', {});

    const calls = evt.sender.send.mock.calls as [string, unknown][];
    expect(calls).toHaveLength(1);
    expect((calls[0][1] as { type: string }).type).toBe('error');
  });

  it('does not call sender.send when webContents is destroyed', async () => {
    // Simulates window close mid-stream
    const send = vi.fn();
    const evt = {
      sender: { isDestroyed: () => true, send },
      processId: 1,
      frameId: 1,
      senderFrame: null,
    } as unknown as Electron.IpcMainInvokeEvent;
    const ctrl = makeCtrl();
    mockFetch.mockResolvedValueOnce(makeSseResponse([
      { type: 'chunk', delta: 'data' },
      { type: 'end', message_id: 'x', credential_source: null },
    ]));

    await openSseStream(evt, 'stream-5', ctrl, 'conv-5', 'test', {});

    // send should never be called because isDestroyed() returns true
    expect(send).not.toHaveBeenCalled();
  });

  it('includes correct Authorization header', async () => {
    const evt = makeFakeEvt();
    const ctrl = makeCtrl();
    mockFetch.mockResolvedValueOnce(makeSseResponse([
      { type: 'end', message_id: 'x', credential_source: null },
    ]));

    await openSseStream(evt, 'stream-6', ctrl, 'conv-6', 'test', {});

    const [, init] = mockFetch.mock.calls[0];
    const auth = (init?.headers as Record<string, string>)?.['Authorization'];
    expect(auth).toMatch(/^ApiKey byan_/);
  });

  it('POSTs the prompt in the request body', async () => {
    const evt = makeFakeEvt();
    const ctrl = makeCtrl();
    mockFetch.mockResolvedValueOnce(makeSseResponse([
      { type: 'end', message_id: 'x', credential_source: null },
    ]));

    await openSseStream(evt, 'stream-7', ctrl, 'conv-7', 'my prompt', {
      cli_provider: 'claude-code',
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init?.body as string) as { prompt: string; cli_provider: string };
    expect(body.prompt).toBe('my prompt');
    expect(body.cli_provider).toBe('claude-code');
  });

  it('handles AbortError from fetch without sending error', async () => {
    const evt = makeFakeEvt();
    const ctrl = makeCtrl();
    const abortErr = new Error('AbortError');
    abortErr.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortErr);

    await openSseStream(evt, 'stream-8', ctrl, 'conv-8', 'test', {});

    // No events sent — abort is a clean cancel
    expect(evt.sender.send).not.toHaveBeenCalled();
  });
});
