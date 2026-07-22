// LocalChatBridge tests (F2) — drive the ws proxy with a fake socket so no real
// server or claude CLI is needed. Verifies start() correlation (FIFO on
// chat-started), send/stop framing, message normalization + broadcast, and the
// error/no-server paths.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalChatBridge, type WsLike } from '../../ipc-handlers/local-chat';
import type { LocalChatMessage } from '../../../shared/ipc-contract';

// A controllable fake WebSocket. Tests emit open/message/error/close explicitly.
class FakeWs implements WsLike {
  readyState = 0; // CONNECTING
  sent: string[] = [];
  private handlers = new Map<string, Array<(...a: unknown[]) => void>>();

  on(event: string, cb: (...a: unknown[]) => void): void {
    const arr = this.handlers.get(event) ?? [];
    arr.push(cb);
    this.handlers.set(event, arr);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3; // CLOSED
    this.emit('close');
  }
  emit(event: string, ...args: unknown[]): void {
    for (const cb of this.handlers.get(event) ?? []) cb(...args);
  }
  emitOpen(): void {
    this.readyState = 1; // OPEN
    this.emit('open');
  }
  emitMessage(obj: unknown): void {
    this.emit('message', JSON.stringify(obj));
  }
}

// Flush pending microtasks + timer(0) so the awaited ensureConnection resumes.
const flush = () => new Promise((r) => setTimeout(r, 0));

// hasPort=false simulates a stopped local server (getPort → undefined). Passing
// a defaulted param would collapse `undefined` back to the default, so the flag
// is explicit.
function makeBridge(hasPort = true) {
  const broadcasts: LocalChatMessage[] = [];
  const fake = new FakeWs();
  const bridge = new LocalChatBridge({
    getPort: () => (hasPort ? 4242 : undefined),
    wsFactory: () => fake,
    broadcast: (m) => broadcasts.push(m),
  });
  return { bridge, fake, broadcasts };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LocalChatBridge.start', () => {
  it('opens the ws, sends chat-start, and resolves with the server sessionId', async () => {
    const { bridge, fake } = makeBridge();
    const p = bridge.start({ cli: 'claude' });
    fake.emitOpen();
    await flush();
    // chat-start frame was sent with the requested cli (resume/cwd default null).
    expect(fake.sent).toHaveLength(1);
    expect(JSON.parse(fake.sent[0])).toEqual({ type: 'chat-start', cli: 'claude', agent: null, resumeSessionId: null, cwd: null });
    // Server assigns the id.
    fake.emitMessage({ type: 'chat-started', sessionId: 'sess-1', cli: 'claude' });
    await expect(p).resolves.toEqual({ sessionId: 'sess-1' });
  });

  it('rejects when the local server is not running (no port)', async () => {
    const { bridge } = makeBridge(false);
    await expect(bridge.start()).rejects.toThrow(/serveur local/i);
  });

  it('correlates concurrent starts FIFO', async () => {
    const { bridge, fake } = makeBridge();
    const p1 = bridge.start();
    fake.emitOpen();
    await flush();
    const p2 = bridge.start();
    await flush();
    fake.emitMessage({ type: 'chat-started', sessionId: 'A', cli: 'claude' });
    fake.emitMessage({ type: 'chat-started', sessionId: 'B', cli: 'claude' });
    await expect(p1).resolves.toEqual({ sessionId: 'A' });
    await expect(p2).resolves.toEqual({ sessionId: 'B' });
  });

  it('rejects a pending start on a session-less chat-error', async () => {
    const { bridge, fake } = makeBridge();
    const p = bridge.start();
    fake.emitOpen();
    await flush();
    fake.emitMessage({ type: 'chat-error', sessionId: null, error: 'claude introuvable' });
    await expect(p).rejects.toThrow(/claude introuvable/);
  });
});

describe('LocalChatBridge.send / stop', () => {
  it('sends a chat-send frame for the session', async () => {
    const { bridge, fake } = makeBridge();
    const p = bridge.start();
    fake.emitOpen();
    await flush();
    fake.emitMessage({ type: 'chat-started', sessionId: 's', cli: 'claude' });
    await p;
    fake.sent.length = 0;
    await bridge.send('s', 'hello');
    expect(JSON.parse(fake.sent[0])).toEqual({ type: 'chat-send', sessionId: 's', message: 'hello' });
  });

  it('sends a chat-stop frame when connected', async () => {
    const { bridge, fake } = makeBridge();
    const p = bridge.start();
    fake.emitOpen();
    await flush();
    fake.emitMessage({ type: 'chat-started', sessionId: 's', cli: 'claude' });
    await p;
    fake.sent.length = 0;
    await bridge.stop('s');
    expect(JSON.parse(fake.sent[0])).toEqual({ type: 'chat-stop', sessionId: 's' });
  });

  it('stop is a no-op when there is no open connection', async () => {
    const { bridge } = makeBridge();
    await expect(bridge.stop('s')).resolves.toBeUndefined();
  });

  it('rejects send with an empty sessionId', async () => {
    const { bridge } = makeBridge();
    await expect(bridge.send('', 'hi')).rejects.toThrow(/sessionId/);
  });
});

describe('LocalChatBridge message normalization', () => {
  it('maps chat/chat-tool/chat-complete/chat-error/chat-stopped to LocalChatMessage', async () => {
    const { bridge, fake, broadcasts } = makeBridge();
    const p = bridge.start();
    fake.emitOpen();
    await flush();
    fake.emitMessage({ type: 'chat-started', sessionId: 's', cli: 'claude' });
    await p;

    fake.emitMessage({ type: 'chat', sessionId: 's', chunk: 'Hel', role: 'assistant' });
    fake.emitMessage({ type: 'chat', sessionId: 's', chunk: 'lo', role: 'assistant' });
    fake.emitMessage({ type: 'chat-tool', sessionId: 's', tool: { name: 'Read' } });
    fake.emitMessage({ type: 'chat-complete', sessionId: 's', result: { ok: true } });
    fake.emitMessage({ type: 'chat-error', sessionId: 's', error: 'boom' });
    fake.emitMessage({ type: 'chat-stopped', sessionId: 's' });

    const types = broadcasts.map((b) => b.type);
    expect(types).toEqual(['started', 'chunk', 'chunk', 'tool', 'complete', 'error', 'stopped']);
    const chunks = broadcasts.filter((b) => b.type === 'chunk') as Extract<LocalChatMessage, { type: 'chunk' }>[];
    expect(chunks.map((c) => c.delta).join('')).toBe('Hello');
  });

  it('ignores non-JSON frames', async () => {
    const { bridge, fake, broadcasts } = makeBridge();
    const p = bridge.start();
    fake.emitOpen();
    await flush();
    fake.emitMessage({ type: 'chat-started', sessionId: 's', cli: 'claude' });
    await p;
    fake.emit('message', 'not json {');
    // Only the 'started' broadcast — the garbage frame produced nothing.
    expect(broadcasts).toHaveLength(1);
  });
});

describe('LocalChatBridge.start resume/cwd framing', () => {
  it('includes resumeSessionId and cwd in the chat-start frame', async () => {
    const { bridge, fake } = makeBridge();
    const p = bridge.start({ resumeSessionId: 'chat-x', cwd: '/home/yan/p' });
    fake.emitOpen();
    await flush();
    expect(JSON.parse(fake.sent[0])).toEqual({
      type: 'chat-start', cli: 'claude', agent: null, resumeSessionId: 'chat-x', cwd: '/home/yan/p',
    });
    fake.emitMessage({ type: 'chat-started', sessionId: 'chat-x', cli: 'claude' });
    await p;
  });
});

describe('LocalChatBridge.list / history (HTTP)', () => {
  const origFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = origFetch; });

  it('list fetches /api/chat/sessions and returns the array', async () => {
    const { bridge } = makeBridge();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ sessions: [{ id: 'chat-a', resumable: true }] }),
    })) as unknown as typeof fetch;
    const out = await bridge.list();
    expect(out).toEqual([{ id: 'chat-a', resumable: true }]);
  });

  it('list returns [] when the server has no port', async () => {
    const { bridge } = makeBridge(false);
    const out = await bridge.list();
    expect(out).toEqual([]);
  });

  it('history returns the session messages', async () => {
    const { bridge } = makeBridge();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ session: { messages: [{ role: 'user', content: 'hi' }] } }),
    })) as unknown as typeof fetch;
    const out = await bridge.history('chat-a');
    expect(out).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('list degrades to [] on a fetch error', async () => {
    const { bridge } = makeBridge();
    globalThis.fetch = vi.fn(async () => { throw new Error('down'); }) as unknown as typeof fetch;
    expect(await bridge.list()).toEqual([]);
  });
});
