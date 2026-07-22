// LocalChatView tests — renders the local chat surface with a mocked bridge and
// drives it through the DOM: type, send, stream, complete.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LocalChatView from '../components/chat/LocalChatView';
import type { LocalChatMessage } from '../../shared/ipc-contract';

const mockStart = vi.fn<() => Promise<{ sessionId: string }>>();
const mockSend = vi.fn<() => Promise<void>>();
const mockStop = vi.fn<() => Promise<void>>();

let listeners: Array<(payload: unknown) => void> = [];
function emit(msg: LocalChatMessage) {
  for (const l of listeners) l(msg);
}

beforeEach(() => {
  listeners = [];
  Object.defineProperty(window, 'byanApi', {
    value: { localChat: { start: mockStart, send: mockSend, stop: mockStop } },
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
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('LocalChatView', () => {
  it('renders the empty state and the New session button', () => {
    render(<LocalChatView />);
    expect(screen.getByTestId('local-chat-view')).toBeInTheDocument();
    expect(screen.getByTestId('local-new-session')).toBeInTheDocument();
    expect(screen.getByText(/chat local avec claude/i)).toBeInTheDocument();
  });

  it('sends a message and shows the streamed assistant reply', async () => {
    render(<LocalChatView />);
    const input = screen.getByTestId('local-chat-input');
    fireEvent.change(input, { target: { value: 'salut' } });
    fireEvent.click(screen.getByTestId('local-chat-send'));

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('sess-1', 'salut'));
    expect(screen.getByText('salut')).toBeInTheDocument();

    // Stream a reply then complete.
    await waitFor(() => expect(listeners.length).toBeGreaterThan(0));
    emit({ type: 'chunk', sessionId: 'sess-1', delta: 'Coucou', role: 'assistant' });
    emit({ type: 'complete', sessionId: 'sess-1' });
    await waitFor(() => expect(screen.getByText('Coucou')).toBeInTheDocument());
  });

  it('New session button calls start', async () => {
    render(<LocalChatView />);
    fireEvent.click(screen.getByTestId('local-new-session'));
    await waitFor(() => expect(mockStart).toHaveBeenCalled());
  });
});
