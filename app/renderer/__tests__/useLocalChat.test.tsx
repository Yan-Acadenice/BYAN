// useLocalChat tests — Vitest + @testing-library/react + jsdom.
//
// Mocks window.byanApi.localChat + window.byanEvents so the hook runs without
// Electron. Drives the byan:chat-local:message event stream to assert chunk
// accumulation, complete → assistant message, error handling, and start-on-send.

import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, render, act, waitFor } from '@testing-library/react';
import { useLocalChat, LocalChatProvider } from '../hooks/useLocalChat';
import type { LocalChatMessage } from '../../shared/ipc-contract';

// useLocalChat now reads a context ; every renderHook must mount the provider.
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LocalChatProvider>{children}</LocalChatProvider>
);

const mockStart = vi.fn<() => Promise<{ sessionId: string }>>();
const mockSend = vi.fn<() => Promise<void>>();
const mockStop = vi.fn<() => Promise<void>>();
const mockList = vi.fn();
const mockHistory = vi.fn();

let listeners: Array<(payload: unknown) => void> = [];
let authListeners: Array<(payload: unknown) => void> = [];
function emit(msg: LocalChatMessage) {
  for (const l of listeners) l(msg);
}
function emitAuth(payload: { reason?: string }) {
  for (const l of authListeners) l(payload);
}

beforeEach(() => {
  listeners = [];
  authListeners = [];
  Object.defineProperty(window, 'byanApi', {
    value: { localChat: { start: mockStart, send: mockSend, stop: mockStop, list: mockList, history: mockHistory } },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'byanEvents', {
    value: {
      on: (channel: string, cb: (payload: unknown) => void) => {
        if (channel === 'byan:chat-local:message') listeners.push(cb);
        else if (channel === 'byan:auth:changed') authListeners.push(cb);
        return () => {
          listeners = listeners.filter((l) => l !== cb);
          authListeners = authListeners.filter((l) => l !== cb);
        };
      },
    },
    writable: true,
    configurable: true,
  });
  mockStart.mockResolvedValue({ sessionId: 'sess-1' });
  mockSend.mockResolvedValue(undefined);
  mockStop.mockResolvedValue(undefined);
  mockList.mockResolvedValue([]);
  mockHistory.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useLocalChat', () => {
  it('newSession starts a session and resets the thread', async () => {
    const { result } = renderHook(() => useLocalChat(), { wrapper });
    await act(async () => { await result.current.newSession(); });
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(result.current.sessionId).toBe('sess-1');
    expect(result.current.messages).toEqual([]);
  });

  it('send starts a session on the fly when none exists, then sends', async () => {
    const { result } = renderHook(() => useLocalChat(), { wrapper });
    await act(async () => { await result.current.send('hello'); });
    expect(mockStart).toHaveBeenCalledTimes(1);
    // Third argument = the per-turn overrides. Explicitly undefined when the
    // caller passes none, so this pins the forwarding rather than ignoring it.
    expect(mockSend).toHaveBeenCalledWith('sess-1', 'hello', undefined);
    // Optimistic user message + streaming on.
    expect(result.current.messages.at(-1)).toMatchObject({ role: 'user', content: 'hello' });
    expect(result.current.streaming).toBe(true);
  });

  it('accumulates chunks then commits an assistant message on complete', async () => {
    const { result } = renderHook(() => useLocalChat(), { wrapper });
    await act(async () => { await result.current.send('hi'); });

    act(() => {
      emit({ type: 'chunk', sessionId: 'sess-1', delta: 'Bon', role: 'assistant' });
      emit({ type: 'chunk', sessionId: 'sess-1', delta: 'jour', role: 'assistant' });
    });
    expect(result.current.streamText).toBe('Bonjour');

    act(() => { emit({ type: 'complete', sessionId: 'sess-1' }); });
    await waitFor(() => expect(result.current.streaming).toBe(false));
    expect(result.current.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Bonjour' });
    expect(result.current.streamText).toBe('');
  });

  it('falls back to the complete.result text when no chunk arrived', async () => {
    const { result } = renderHook(() => useLocalChat(), { wrapper });
    await act(async () => { await result.current.send('hi'); });
    // No 'chunk' frame — only a message-level 'complete' carrying the reply.
    act(() => { emit({ type: 'complete', sessionId: 'sess-1', result: 'Réponse directe' }); });
    await waitFor(() => expect(result.current.streaming).toBe(false));
    expect(result.current.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Réponse directe' });
  });

  it('clears the error banner on the next successful turn', async () => {
    const { result } = renderHook(() => useLocalChat(), { wrapper });
    await act(async () => { await result.current.send('hi'); });
    act(() => { emit({ type: 'error', sessionId: 'sess-1', error: 'boom' }); });
    await waitFor(() => expect(result.current.error).toBe('boom'));
    // A new turn must clear the stale banner.
    await act(async () => { await result.current.send('encore'); });
    expect(result.current.error).toBeNull();
  });

  it('surfaces an error frame as a system message and stops streaming', async () => {
    const { result } = renderHook(() => useLocalChat(), { wrapper });
    await act(async () => { await result.current.send('hi'); });
    act(() => { emit({ type: 'error', sessionId: 'sess-1', error: 'claude a planté' }); });
    await waitFor(() => expect(result.current.streaming).toBe(false));
    expect(result.current.messages.at(-1)).toMatchObject({ role: 'system' });
    expect(result.current.error).toBe('claude a planté');
  });

  it('ignores chunks addressed to a different session', async () => {
    const { result } = renderHook(() => useLocalChat(), { wrapper });
    await act(async () => { await result.current.send('hi'); });
    act(() => { emit({ type: 'chunk', sessionId: 'other', delta: 'nope', role: 'assistant' }); });
    expect(result.current.streamText).toBe('');
  });

  it('stop calls the bridge and clears streaming', async () => {
    const { result } = renderHook(() => useLocalChat(), { wrapper });
    await act(async () => { await result.current.send('hi'); });
    await act(async () => { await result.current.stop(); });
    expect(mockStop).toHaveBeenCalledWith('sess-1');
    expect(result.current.streaming).toBe(false);
  });

  it('records an error when the session fails to start', async () => {
    mockStart.mockRejectedValue(new Error('Serveur local non démarré.'));
    const { result } = renderHook(() => useLocalChat(), { wrapper });
    await act(async () => { await result.current.send('hi'); });
    expect(result.current.error).toMatch(/serveur local/i);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('refreshSessions loads the persisted session list', async () => {
    mockList.mockResolvedValue([
      { id: 'chat-a', cli: 'claude', agent: null, cwd: '/a', resumable: true, created: '', updated: '', messageCount: 3, lastMessage: 'hi' },
    ]);
    const { result } = renderHook(() => useLocalChat(), { wrapper });
    await act(async () => { await result.current.refreshSessions(); });
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).toBe('chat-a');
  });

  it('resume reopens claude in the session project dir (cwd), seeding any history', async () => {
    mockHistory.mockResolvedValue([
      { role: 'user', content: 'bonjour' },
      { role: 'assistant', content: 'salut' },
    ]);
    mockStart.mockResolvedValue({ sessionId: 'sess-2' });
    const { result } = renderHook(() => useLocalChat(), { wrapper });
    await act(async () => { await result.current.resume('chat-a', '/home/yan/proj'); });
    expect(mockHistory).toHaveBeenCalledWith('chat-a');
    // Native: reopen in the project dir, NOT --resume by record id.
    expect(mockStart).toHaveBeenCalledWith({ cwd: '/home/yan/proj' });
    expect(result.current.sessionId).toBe('sess-2');
    expect(result.current.messages.map((m) => m.content)).toEqual(['bonjour', 'salut']);
  });

  it('send passes startOpts (cwd) through to the on-the-fly start', async () => {
    const { result } = renderHook(() => useLocalChat(), { wrapper });
    await act(async () => { await result.current.send('hi', { cwd: '/home/yan/proj' }); });
    expect(mockStart).toHaveBeenCalledWith({ cwd: '/home/yan/proj' });
    expect(mockSend).toHaveBeenCalledWith('sess-1', 'hi', undefined);
  });

  it('forwards per-turn overrides to the bridge', async () => {
    // What makes an effort change apply from the very next message.
    const { result } = renderHook(() => useLocalChat(), { wrapper });
    await act(async () => {
      await result.current.send('hi', { cli: 'codex' }, { reasoningEffort: 'low' });
    });
    expect(mockSend).toHaveBeenCalledWith('sess-1', 'hi', { reasoningEffort: 'low' });
  });

  it('clears the thread and stops the session on logout (no cross-user leak)', async () => {
    const { result } = renderHook(() => useLocalChat(), { wrapper });
    await act(async () => { await result.current.send('secret'); });
    expect(result.current.sessionId).toBe('sess-1');
    expect(result.current.messages.length).toBeGreaterThan(0);

    // The provider survives logout (it is above the router) — it MUST self-clear.
    act(() => { emitAuth({ reason: 'logout' }); });
    await waitFor(() => expect(result.current.sessionId).toBeNull());
    expect(result.current.messages).toEqual([]);
    expect(mockStop).toHaveBeenCalledWith('sess-1'); // live claude child terminated
  });

  it('newSession stops the previous session and drops late frames from it', async () => {
    mockStart.mockResolvedValueOnce({ sessionId: 'sess-A' });
    const { result } = renderHook(() => useLocalChat(), { wrapper });
    await act(async () => { await result.current.send('un'); }); // session A

    mockStart.mockResolvedValueOnce({ sessionId: 'sess-B' });
    await act(async () => { await result.current.newSession(); }); // switch to B
    expect(result.current.sessionId).toBe('sess-B');
    expect(mockStop).toHaveBeenCalledWith('sess-A'); // old process not orphaned

    // A late chunk for the OLD session A must NOT bleed into B's fresh thread.
    act(() => { emit({ type: 'chunk', sessionId: 'sess-A', delta: 'résidu', role: 'assistant' }); });
    expect(result.current.streamText).toBe('');
  });

  it('resume stops the previously active session', async () => {
    mockStart.mockResolvedValueOnce({ sessionId: 'sess-A' });
    const { result } = renderHook(() => useLocalChat(), { wrapper });
    await act(async () => { await result.current.send('un'); });

    mockStart.mockResolvedValueOnce({ sessionId: 'sess-R' });
    await act(async () => { await result.current.resume('chat-x', '/p'); });
    expect(mockStop).toHaveBeenCalledWith('sess-A');
    expect(result.current.sessionId).toBe('sess-R');
  });
});

// The whole point of lifting the state into a provider : the thread survives the
// consumer being unmounted and remounted (i.e. navigating away from Chat and
// back). The provider stays mounted (as in App, above the router).
describe('LocalChatProvider — persistence across consumer unmount/remount', () => {
  function Consumer() {
    const { messages, sessionId, send } = useLocalChat();
    return (
      <div>
        <span data-testid="count">{messages.length}</span>
        <span data-testid="sid">{sessionId ?? ''}</span>
        <button onClick={() => void send('bonjour')}>send</button>
      </div>
    );
  }
  function Harness() {
    // `visible` toggles the consumer's mount — the provider never unmounts.
    const [visible, setVisible] = useState(true);
    return (
      <LocalChatProvider>
        <button onClick={() => setVisible((v) => !v)}>toggle</button>
        {visible && <Consumer />}
      </LocalChatProvider>
    );
  }

  it('keeps the thread and sessionId when the consumer remounts (navigation)', async () => {
    const { getByText, queryByTestId } = render(<Harness />);

    // Start a session + a user turn.
    await act(async () => { getByText('send').click(); });
    await waitFor(() => expect(queryByTestId('count')?.textContent).toBe('1'));
    expect(queryByTestId('sid')?.textContent).toBe('sess-1');

    // Navigate away — the consumer unmounts (the provider stays).
    await act(async () => { getByText('toggle').click(); });
    expect(queryByTestId('count')).toBeNull();

    // Navigate back — the consumer remounts and reads the SAME state.
    await act(async () => { getByText('toggle').click(); });
    expect(queryByTestId('count')?.textContent).toBe('1');
    expect(queryByTestId('sid')?.textContent).toBe('sess-1');
    // No second session was started on remount (start called exactly once).
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('a stream arriving WHILE off-page lands in the thread (subscription survives)', async () => {
    const { getByText, queryByTestId } = render(<Harness />);
    await act(async () => { getByText('send').click(); }); // session sess-1, 1 user msg
    await waitFor(() => expect(queryByTestId('count')?.textContent).toBe('1'));

    // Navigate away — consumer unmounts, but the provider (and its subscription)
    // stays mounted above the router.
    await act(async () => { getByText('toggle').click(); });
    expect(queryByTestId('count')).toBeNull();

    // claude replies while the user is on another page.
    act(() => {
      emit({ type: 'chunk', sessionId: 'sess-1', delta: 'réponse hors-page', role: 'assistant' });
      emit({ type: 'complete', sessionId: 'sess-1' });
    });

    // Back on Chat : the reply is in the thread (user + assistant = 2).
    await act(async () => { getByText('toggle').click(); });
    await waitFor(() => expect(queryByTestId('count')?.textContent).toBe('2'));
  });
});
