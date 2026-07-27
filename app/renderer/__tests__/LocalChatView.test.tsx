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
const mockCliDetect = vi.fn();
const mockStoreSet = vi.fn().mockResolvedValue(undefined);

let listeners: Array<(payload: unknown) => void> = [];
function emit(msg: LocalChatMessage) {
  for (const l of listeners) l(msg);
}

beforeEach(() => {
  listeners = [];
  Object.defineProperty(window, 'byanApi', {
    value: {
      localChat: { start: mockStart, send: mockSend, stop: mockStop, list: mockList, history: mockHistory },
      store: { get: mockStoreGet, set: mockStoreSet },
      fs: { openProjectDialog: mockOpenDialog },
      cli: { detect: mockCliDetect },
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
  mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude' }); // codex absent by default
  mockStoreSet.mockClear().mockResolvedValue(undefined);
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

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('sess-1', 'salut', undefined));
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
    // Key-aware: a blanket mockResolvedValue handed the SAME path to every key,
    // so chat.localAgent silently became a directory and leaked into startOpts.
    mockStoreGet.mockImplementation((k: string) =>
      Promise.resolve(k === 'onboarding.projectRoot' ? '/home/yan/monprojet' : null));
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    // The header shows the project folder (last path segment).
    await waitFor(() => expect(screen.getByTestId('local-cwd')).toHaveTextContent('monprojet'));

    fireEvent.click(screen.getByTestId('local-new-session'));
    await waitFor(() => expect(mockStart).toHaveBeenCalledWith({ cli: 'claude', cwd: '/home/yan/monprojet' }));
  });

  it('D-03: prefers chat.pendingCwd (project launch) over onboarding root, then clears it', async () => {
    const setSpy = vi.fn().mockResolvedValue(undefined);
    // Only the two cwd keys answer here: a catch-all would also feed
    // chat.localAgent / chat.localModel a directory path.
    mockStoreGet.mockImplementation((key: string) => Promise.resolve(
      key === 'chat.pendingCwd' ? '/home/yan/mon-projet'
        : key === 'onboarding.projectRoot' ? '/home/yan/onboarding'
          : null,
    ));
    (window.byanApi as unknown as { store: { get: typeof mockStoreGet; set: typeof setSpy } }).store.set = setSpy;

    render(<LocalChatView />, { wrapper: LocalChatProvider });
    // Header shows the project folder picked from ProjectDetail, not the onboarding one.
    await waitFor(() => expect(screen.getByTestId('local-cwd')).toHaveTextContent('mon-projet'));
    // The pending handoff is consumed (cleared) so a later plain visit falls back.
    await waitFor(() => expect(setSpy).toHaveBeenCalledWith('chat.pendingCwd', ''));

    fireEvent.click(screen.getByTestId('local-new-session'));
    await waitFor(() => expect(mockStart).toHaveBeenCalledWith({ cli: 'claude', cwd: '/home/yan/mon-projet' }));
  });

  it('F4: the folder button lets the user pick another project dir', async () => {
    // Key-aware: a blanket mockResolvedValue handed the SAME path to every key,
    // so chat.localAgent silently became a directory and leaked into startOpts.
    mockStoreGet.mockImplementation((k: string) =>
      Promise.resolve(k === 'onboarding.projectRoot' ? '/home/yan/monprojet' : null));
    mockOpenDialog.mockResolvedValue('/home/yan/autre');
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await waitFor(() => expect(screen.getByTestId('local-cwd')).toHaveTextContent('monprojet'));

    fireEvent.click(screen.getByTestId('local-cwd'));
    await waitFor(() => expect(screen.getByTestId('local-cwd')).toHaveTextContent('autre'));

    fireEvent.click(screen.getByTestId('local-new-session'));
    await waitFor(() => expect(mockStart).toHaveBeenCalledWith({ cli: 'claude', cwd: '/home/yan/autre' }));
  });

  it('engine switch: codex is disabled when the binary is not detected', async () => {
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude' });
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await waitFor(() => expect(screen.getByTestId('local-engine-codex')).toBeDisabled());
    expect(screen.getByTestId('local-engine-claude')).not.toBeDisabled();
  });

  it('engine switch: picking codex starts the next session with cli=codex and persists the choice', async () => {
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await waitFor(() => expect(screen.getByTestId('local-engine-codex')).not.toBeDisabled());

    fireEvent.click(screen.getByTestId('local-engine-codex'));
    fireEvent.click(screen.getByTestId('local-new-session'));
    await waitFor(() => expect(mockStart).toHaveBeenCalledWith({ cli: 'codex' }));
    expect((window.byanApi.store!.set as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('chat.localEngine', 'codex');
  });

  it('engine switch: a persisted codex choice is restored only when codex is detected', async () => {
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    mockStoreGet.mockImplementation((key: string) =>
      Promise.resolve(key === 'chat.localEngine' ? 'codex' : null)
    );
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    // The empty-state line reflects the restored engine — wait for it before
    // starting, so the click cannot race the async restore.
    expect(await screen.findByText(/chat local avec codex/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('local-new-session'));
    await waitFor(() => expect(mockStart).toHaveBeenCalledWith({ cli: 'codex' }));
  });
});

// ---------- F8: model / effort chips + slash palette ----------

// Put the view in codex mode and wait until the switch reflects it, so a test
// never races the async detection.
async function renderAsCodex() {
  mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
  render(<LocalChatView />, { wrapper: LocalChatProvider });
  await waitFor(() => expect(screen.getByTestId('local-engine-codex')).not.toBeDisabled());
  fireEvent.click(screen.getByTestId('local-engine-codex'));
  return screen.getByTestId('local-chat-input');
}

function type(value: string) {
  fireEvent.change(screen.getByTestId('local-chat-input'), { target: { value } });
}

function pressEnter() {
  fireEvent.keyDown(screen.getByTestId('local-chat-input'), { key: 'Enter' });
}

describe('LocalChatView — effort chip presence', () => {
  it('is ABSENT from the DOM on claude — not merely disabled', async () => {
    // claude exposes no reasoning-effort flag; a greyed control would advertise
    // a setting that does not exist.
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    expect(await screen.findByTestId('local-model-chip')).toBeInTheDocument();
    expect(screen.queryByTestId('local-effort-chip')).toBeNull();
  });

  it('appears on codex', async () => {
    await renderAsCodex();
    expect(screen.getByTestId('local-effort-chip')).toBeInTheDocument();
  });

  it('disappears again when the user switches back to claude', async () => {
    await renderAsCodex();
    expect(screen.getByTestId('local-effort-chip')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('local-engine-claude'));
    await waitFor(() => expect(screen.queryByTestId('local-effort-chip')).toBeNull());
  });
});

describe('LocalChatView — slash commands', () => {
  it('opens the palette on "/" and offers /model', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');
    type('/mo');
    expect(screen.getByTestId('slash-cmd-model')).toBeInTheDocument();
  });

  it('hides /effort from the palette on claude', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');
    type('/e');
    expect(screen.queryByTestId('slash-cmd-effort')).toBeNull();
  });

  it('offers /effort in the palette on codex', async () => {
    await renderAsCodex();
    type('/e');
    expect(screen.getByTestId('slash-cmd-effort')).toBeInTheDocument();
  });

  it('"/model opus" persists the choice per engine and relabels the chip', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('/model opus');
    pressEnter();

    // Stored under the engine key: the two model spaces are disjoint.
    await waitFor(() => expect(mockStoreSet).toHaveBeenCalledWith('chat.localModel', { claude: 'opus' }));
    expect(screen.getByTestId('local-model-chip')).toHaveTextContent('opus');
    // A command is consumed, never sent to the engine.
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('refuses a model that belongs to the other engine, and does not persist it', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('/model gpt-4');
    pressEnter();

    expect(await screen.findByTestId('local-notice')).toHaveTextContent(/n'est pas un modele valide/i);
    expect(mockStoreSet).not.toHaveBeenCalledWith('chat.localModel', expect.anything());
  });

  it('"/effort high" on claude explains itself instead of silently doing nothing', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('/effort high');
    pressEnter();

    expect(await screen.findByTestId('local-notice')).toHaveTextContent(/effort/i);
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('"/effort xhigh" on codex persists the level', async () => {
    await renderAsCodex();
    type('/effort xhigh');
    pressEnter();

    await waitFor(() => expect(mockStoreSet).toHaveBeenCalledWith('chat.localEffort', 'xhigh'));
    expect(screen.getByTestId('local-effort-chip')).toHaveTextContent('xhigh');
  });

  it('an unknown command is refused, NOT forwarded to the engine', async () => {
    // The whole point of the primitive's 'unknown' classification.
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('/mdl');
    pressEnter();

    expect(await screen.findByTestId('local-notice')).toHaveTextContent(/inconnue/i);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('a plain message still goes through, carrying the selected effort per turn', async () => {
    await renderAsCodex();
    type('/effort low');
    pressEnter();
    await waitFor(() => expect(screen.getByTestId('local-effort-chip')).toHaveTextContent('low'));

    type('bonjour');
    pressEnter();

    // Third argument is the per-turn override — this is what makes an effort
    // change apply from the very next message.
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('sess-1', 'bonjour', { reasoningEffort: 'low' }));
  });

  it('does NOT attach a per-turn effort on claude', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('bonjour');
    pressEnter();

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('sess-1', 'bonjour', undefined));
  });

  it('"/byan" selects the byan agent and shows it', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('/byan');
    pressEnter();

    await waitFor(() => expect(mockStoreSet).toHaveBeenCalledWith('chat.localAgent', 'byan'));
    expect(screen.getByTestId('local-agent-chip')).toHaveTextContent('byan');
  });

  it('"/usage" opens the usage panel', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    // A turn must have reported something first — the badge and the panel do not
    // exist before any measurement, so there is no premature "0 token" state.
    type('bonjour');
    pressEnter();
    await waitFor(() => expect(listeners.length).toBeGreaterThan(0));
    emit({ type: 'complete', sessionId: 'sess-1', usage: { engine: 'claude', costUsd: 0.08, durationMs: 4210 } });
    await waitFor(() => expect(screen.getByTestId('local-usage-toggle')).toBeInTheDocument());

    type('/usage');
    pressEnter();
    expect(await screen.findByTestId('usage-panel')).toBeInTheDocument();
  });

  it('the usage badge counts EVERY measured turn, not the capped list', async () => {
    // usageTurns is capped at 50; the badge reads the totals instead, so a
    // 55-turn session does not show "Usage (50)" next to a panel saying 55.
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');
    type('bonjour');
    pressEnter();
    await waitFor(() => expect(listeners.length).toBeGreaterThan(0));

    for (let i = 0; i < 55; i++) {
      emit({ type: 'complete', sessionId: 'sess-1', usage: { engine: 'codex', outputTokens: 1, costUsd: null } });
    }
    await waitFor(() => expect(screen.getByTestId('local-usage-toggle')).toHaveTextContent('Usage (55)'));
  });

  it('there is NO usage badge before any turn reported usage', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');
    expect(screen.queryByTestId('local-usage-toggle')).toBeNull();
  });

  it('"/usage" opens the panel EVEN before any turn measured anything', async () => {
    // Regression: the panel used to be nested inside the badge's condition, so
    // /usage set its open flag and rendered nothing at all — the silent no-op
    // every other command is written to avoid. The panel carries its own empty
    // state, so opening it is the honest answer.
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');
    expect(screen.queryByTestId('local-usage-toggle')).toBeNull();

    type('/usage');
    pressEnter();

    const panel = await screen.findByTestId('usage-panel');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent(/aucun tour mesuré/i);
  });

  it('"/mcp" opens the MCP management modal', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('/mcp');
    pressEnter();

    expect(await screen.findByTestId('mcp-panel-shell')).toBeInTheDocument();
  });

  it('Shift+Enter never submits', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('bonjour');
    fireEvent.keyDown(screen.getByTestId('local-chat-input'), { key: 'Enter', shiftKey: true });

    expect(mockSend).not.toHaveBeenCalled();
  });
});
