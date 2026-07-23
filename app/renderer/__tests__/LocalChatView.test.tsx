// LocalChatView tests — renders the local chat surface with a mocked bridge and
// drives it through the DOM: type, send, stream, complete.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LocalChatView from '../components/chat/LocalChatView';
import { LocalChatProvider } from '../hooks/useLocalChat';
import type { LocalChatMessage } from '../../shared/ipc-contract';

// LocalChatView reads useLocalChat, which now requires the provider (the state
// was lifted so the session survives navigation). Wrap every render.

const mockStart = vi.fn<() => Promise<{ sessionId: string }>>();
const mockSend = vi.fn<() => Promise<void>>();
const mockStop = vi.fn<() => Promise<void>>();
const mockList = vi.fn();
const mockHistory = vi.fn();
const mockStoreGet = vi.fn();
const mockOpenDialog = vi.fn();

let listeners: Array<(payload: unknown) => void> = [];
function emit(msg: LocalChatMessage) {
  for (const l of listeners) l(msg);
}

beforeEach(() => {
  listeners = [];
  Object.defineProperty(window, 'byanApi', {
    value: {
      localChat: { start: mockStart, send: mockSend, stop: mockStop, list: mockList, history: mockHistory },
      store: { get: mockStoreGet, set: vi.fn() },
      fs: { openProjectDialog: mockOpenDialog },
    },
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
  mockStoreGet.mockResolvedValue(null);
  mockOpenDialog.mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('LocalChatView', () => {
  it('renders the empty state and the New session button', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    expect(screen.getByTestId('local-chat-view')).toBeInTheDocument();
    expect(screen.getByTestId('local-new-session')).toBeInTheDocument();
    // findBy waits out the mount-time refreshSessions state settle (act).
    expect(await screen.findByText(/chat local avec claude/i)).toBeInTheDocument();
  });

  it('sends a message and shows the streamed assistant reply', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
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
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    fireEvent.click(screen.getByTestId('local-new-session'));
    await waitFor(() => expect(mockStart).toHaveBeenCalled());
  });

  it('lists resumable sessions and resumes one on click', async () => {
    mockList.mockResolvedValue([
      { id: 'chat-old', cli: 'claude', agent: null, cwd: '/p', resumable: true, created: '', updated: '', messageCount: 2, lastMessage: 'reprends-moi' },
    ]);
    mockHistory.mockResolvedValue([{ role: 'user', content: 'reprends-moi' }]);
    mockStart.mockResolvedValue({ sessionId: 'chat-old' });

    render(<LocalChatView />, { wrapper: LocalChatProvider });
    // Open the sessions menu (also triggers a refresh).
    fireEvent.click(screen.getByTestId('local-sessions-toggle'));
    await waitFor(() => expect(screen.getByTestId('local-session-chat-old')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('local-session-chat-old'));
    // Native resume : reopen claude in the session's project dir (cwd), not --resume.
    await waitFor(() => expect(mockStart).toHaveBeenCalledWith({ cwd: '/p' }));
    expect(mockHistory).toHaveBeenCalledWith('chat-old');
    await waitFor(() => expect(screen.getByText('reprends-moi')).toBeInTheDocument());
  });

  it('F4: defaults cwd to the onboarding project root and binds a new session to it', async () => {
    mockStoreGet.mockResolvedValue('/home/yan/monprojet');
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    // The header shows the project folder (last path segment).
    await waitFor(() => expect(screen.getByTestId('local-cwd')).toHaveTextContent('monprojet'));

    fireEvent.click(screen.getByTestId('local-new-session'));
    await waitFor(() => expect(mockStart).toHaveBeenCalledWith({ cwd: '/home/yan/monprojet' }));
  });

  it('D-03: prefers chat.pendingCwd (project launch) over onboarding root, then clears it', async () => {
    const setSpy = vi.fn().mockResolvedValue(undefined);
    mockStoreGet.mockImplementation((key: string) =>
      Promise.resolve(key === 'chat.pendingCwd' ? '/home/yan/mon-projet' : '/home/yan/onboarding'));
    (window.byanApi as unknown as { store: { get: typeof mockStoreGet; set: typeof setSpy } }).store.set = setSpy;

    render(<LocalChatView />, { wrapper: LocalChatProvider });
    // Header shows the project folder picked from ProjectDetail, not the onboarding one.
    await waitFor(() => expect(screen.getByTestId('local-cwd')).toHaveTextContent('mon-projet'));
    // The pending handoff is consumed (cleared) so a later plain visit falls back.
    await waitFor(() => expect(setSpy).toHaveBeenCalledWith('chat.pendingCwd', ''));

    fireEvent.click(screen.getByTestId('local-new-session'));
    await waitFor(() => expect(mockStart).toHaveBeenCalledWith({ cwd: '/home/yan/mon-projet' }));
  });

  it('F4: the folder button lets the user pick another project dir', async () => {
    mockStoreGet.mockResolvedValue('/home/yan/monprojet');
    mockOpenDialog.mockResolvedValue('/home/yan/autre');
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await waitFor(() => expect(screen.getByTestId('local-cwd')).toHaveTextContent('monprojet'));

    fireEvent.click(screen.getByTestId('local-cwd'));
    await waitFor(() => expect(screen.getByTestId('local-cwd')).toHaveTextContent('autre'));

    fireEvent.click(screen.getByTestId('local-new-session'));
    await waitFor(() => expect(mockStart).toHaveBeenCalledWith({ cwd: '/home/yan/autre' }));
  });
});
