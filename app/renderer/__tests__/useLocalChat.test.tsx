// useLocalChat tests — Vitest + @testing-library/react + jsdom.
//
// Mocks window.byanApi.localChat + window.byanEvents so the hook runs without
// Electron. Drives the byan:chat-local:message event stream to assert chunk
// accumulation, complete → assistant message, error handling, and start-on-send.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLocalChat } from '../hooks/useLocalChat';
import type { LocalChatMessage } from '../../shared/ipc-contract';

const mockStart = vi.fn<() => Promise<{ sessionId: string }>>();
const mockSend = vi.fn<() => Promise<void>>();
const mockStop = vi.fn<() => Promise<void>>();
const mockList = vi.fn();
const mockHistory = vi.fn();

let listeners: Array<(payload: unknown) => void> = [];
function emit(msg: LocalChatMessage) {
  for (const l of listeners) l(msg);
}

beforeEach(() => {
  listeners = [];
  Object.defineProperty(window, 'byanApi', {
    value: { localChat: { start: mockStart, send: mockSend, stop: mockStop, list: mockList, history: mockHistory } },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'byanEvents', {
    value: {
      on: (channel: string, cb: (payload: unknown) => void) => {
        if (channel === 'byan:chat-local:message') listeners.push(cb);
        return () => { listeners = listeners.filter((l) => l !== cb); };
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
    const { result } = renderHook(() => useLocalChat());
    await act(async () => { await result.current.newSession(); });
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(result.current.sessionId).toBe('sess-1');
    expect(result.current.messages).toEqual([]);
  });

  it('send starts a session on the fly when none exists, then sends', async () => {
    const { result } = renderHook(() => useLocalChat());
    await act(async () => { await result.current.send('hello'); });
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith('sess-1', 'hello');
    // Optimistic user message + streaming on.
    expect(result.current.messages.at(-1)).toMatchObject({ role: 'user', content: 'hello' });
    expect(result.current.streaming).toBe(true);
  });

  it('accumulates chunks then commits an assistant message on complete', async () => {
    const { result } = renderHook(() => useLocalChat());
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

  it('surfaces an error frame as a system message and stops streaming', async () => {
    const { result } = renderHook(() => useLocalChat());
    await act(async () => { await result.current.send('hi'); });
    act(() => { emit({ type: 'error', sessionId: 'sess-1', error: 'claude a planté' }); });
    await waitFor(() => expect(result.current.streaming).toBe(false));
    expect(result.current.messages.at(-1)).toMatchObject({ role: 'system' });
    expect(result.current.error).toBe('claude a planté');
  });

  it('ignores chunks addressed to a different session', async () => {
    const { result } = renderHook(() => useLocalChat());
    await act(async () => { await result.current.send('hi'); });
    act(() => { emit({ type: 'chunk', sessionId: 'other', delta: 'nope', role: 'assistant' }); });
    expect(result.current.streamText).toBe('');
  });

  it('stop calls the bridge and clears streaming', async () => {
    const { result } = renderHook(() => useLocalChat());
    await act(async () => { await result.current.send('hi'); });
    await act(async () => { await result.current.stop(); });
    expect(mockStop).toHaveBeenCalledWith('sess-1');
    expect(result.current.streaming).toBe(false);
  });

  it('records an error when the session fails to start', async () => {
    mockStart.mockRejectedValue(new Error('Serveur local non démarré.'));
    const { result } = renderHook(() => useLocalChat());
    await act(async () => { await result.current.send('hi'); });
    expect(result.current.error).toMatch(/serveur local/i);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('refreshSessions loads the persisted session list', async () => {
    mockList.mockResolvedValue([
      { id: 'chat-a', cli: 'claude', agent: null, cwd: '/a', resumable: true, created: '', updated: '', messageCount: 3, lastMessage: 'hi' },
    ]);
    const { result } = renderHook(() => useLocalChat());
    await act(async () => { await result.current.refreshSessions(); });
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).toBe('chat-a');
  });

  it('resume seeds history then reattaches with resumeSessionId', async () => {
    mockHistory.mockResolvedValue([
      { role: 'user', content: 'bonjour' },
      { role: 'assistant', content: 'salut' },
    ]);
    mockStart.mockResolvedValue({ sessionId: 'chat-a' });
    const { result } = renderHook(() => useLocalChat());
    await act(async () => { await result.current.resume('chat-a'); });
    expect(mockHistory).toHaveBeenCalledWith('chat-a');
    expect(mockStart).toHaveBeenCalledWith({ resumeSessionId: 'chat-a' });
    expect(result.current.sessionId).toBe('chat-a');
    expect(result.current.messages.map((m) => m.content)).toEqual(['bonjour', 'salut']);
  });

  it('send forwards resume/cwd opts are NOT set on a plain send (fresh start)', async () => {
    const { result } = renderHook(() => useLocalChat());
    await act(async () => { await result.current.send('hi'); });
    // Plain send starts with no opts (fresh, default cwd).
    expect(mockStart).toHaveBeenCalledWith();
  });
});
