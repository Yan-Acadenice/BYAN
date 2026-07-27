// LocalChatView tests — renders the local chat surface with a mocked bridge and
// drives it through the DOM: type, send, stream, complete.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import LocalChatView from '../components/chat/LocalChatView';
import { LocalChatProvider } from '../hooks/useLocalChat';
import type { LocalChatMessage } from '../../shared/ipc-contract';

// LocalChatView reads useLocalChat, which now requires the provider (the state
// was lifted so the session survives navigation). Wrap every render.

const mockStart = vi.fn<() => Promise<{ sessionId: string; cwd: string }>>();
const mockSend = vi.fn<() => Promise<void>>();
const mockStop = vi.fn<() => Promise<void>>();
const mockList = vi.fn();
const mockHistory = vi.fn();
const mockStoreGet = vi.fn();
const mockOpenDialog = vi.fn();
const mockCliDetect = vi.fn();
const mockAgents = vi.fn();
const mockStoreSet = vi.fn().mockResolvedValue(undefined);

let listeners: Array<(payload: unknown) => void> = [];
function emit(msg: LocalChatMessage) {
  for (const l of listeners) l(msg);
}

beforeEach(() => {
  listeners = [];
  Object.defineProperty(window, 'byanApi', {
    value: {
      localChat: { start: mockStart, send: mockSend, stop: mockStop, list: mockList, history: mockHistory, agents: mockAgents },
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
  mockStart.mockResolvedValue({ sessionId: 'sess-1', cwd: '/home/yan/monprojet' });
  mockSend.mockResolvedValue(undefined);
  mockStop.mockResolvedValue(undefined);
  mockList.mockResolvedValue([]);
  mockHistory.mockResolvedValue([]);
  mockStoreGet.mockResolvedValue(null);
  mockOpenDialog.mockResolvedValue(null);
  mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude' }); // codex absent by default
  // What `claude --agent` really honours here: the declared slugs are prefixed,
  // so a bare 'byan' has to be resolved rather than sent as typed.
  mockAgents.mockResolvedValue(['bmad-byan', 'bmad-byan-v2', 'bmad-bmm-dev', 'claude']);
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
    mockStart.mockResolvedValue({ sessionId: 'chat-old', cwd: '/home/yan/monprojet' });

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

  it('"/byan" resolves the DECLARED slug and opens a session with it', async () => {
    // The regression this pins: the command used to send the bare name 'byan',
    // which no project declares. `claude --agent byan` exits 0 and silently
    // ignores the flag (measured), so /byan looked like it worked and did
    // nothing at all. Only the resolved slug may reach a spawn.
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('/byan');
    pressEnter();

    await waitFor(() => expect(mockStoreSet).toHaveBeenCalledWith('chat.localAgent', 'bmad-byan'));
    expect(mockStoreSet).not.toHaveBeenCalledWith('chat.localAgent', 'byan');
    // Applied at once: --agent is a spawn-time flag, so a session is opened.
    await waitFor(() => expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({ cli: 'claude', agent: 'bmad-byan' }),
    ));
    expect(screen.getByTestId('local-agent-chip')).toHaveTextContent('bmad-byan');
  });

  it('an unknown agent is refused with suggestions, and never reaches a spawn', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('/agent byanx');
    pressEnter();

    const notice = await screen.findByTestId('local-notice');
    expect(notice).toHaveTextContent(/introuvable/i);
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockStoreSet).not.toHaveBeenCalledWith('chat.localAgent', 'byanx');
  });

  it('"/agent" with no argument lists what the project declares', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('/agent');
    pressEnter();

    const notice = await screen.findByTestId('local-notice');
    expect(notice).toHaveTextContent('bmad-byan');
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('a bare declared name resolves by suffix (dev -> bmad-bmm-dev)', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('/agent dev');
    pressEnter();

    await waitFor(() => expect(mockStoreSet).toHaveBeenCalledWith('chat.localAgent', 'bmad-bmm-dev'));
  });

  it('refuses an agent on codex instead of setting one that cannot apply', async () => {
    await renderAsCodex();
    type('/byan');
    pressEnter();

    const notice = await screen.findByTestId('local-notice');
    expect(notice).toHaveTextContent(/codex/i);
    expect(mockStoreSet).not.toHaveBeenCalledWith('chat.localAgent', 'bmad-byan');
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


describe('LocalChatView — ce que la barre annonce doit etre vrai', () => {
  it('names the folder main fell back to instead of inviting a pick that already happened', async () => {
    // No stored root: the view sends no cwd and the bridge falls back. Before the
    // fix the chip stayed on "Choisir un dossier" while the session was already
    // running in /home/yan/replidumain — the header contradicted the session.
    mockStoreGet.mockImplementation(() => Promise.resolve(null));
    mockStart.mockResolvedValue({ sessionId: 'sess-fb', cwd: '/home/yan/replidumain' });
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');
    await waitFor(() => expect(screen.getByTestId('local-cwd')).toHaveTextContent('Choisir un dossier'));

    fireEvent.click(screen.getByTestId('local-new-session'));

    await waitFor(() => expect(screen.getByTestId('local-cwd')).toHaveTextContent('replidumain'));
    // And it says the folder was not the user's choice, so the click still reads
    // as available.
    expect(screen.getByTestId('local-cwd').getAttribute('title')).toContain('défaut');
  });

  it('an explicit pick still wins over the fallback', async () => {
    mockStoreGet.mockImplementation((k: string) =>
      Promise.resolve(k === 'onboarding.projectRoot' ? '/home/yan/choisi' : null));
    mockStart.mockResolvedValue({ sessionId: 'sess-x', cwd: '/home/yan/autrechose' });
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await waitFor(() => expect(screen.getByTestId('local-cwd')).toHaveTextContent('choisi'));

    fireEvent.click(screen.getByTestId('local-new-session'));
    // The bridge answer must not overwrite what the user picked.
    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    expect(screen.getByTestId('local-cwd')).toHaveTextContent('choisi');
  });

  it('stops claiming a session will start once one is open', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');
    expect(screen.getByText(/une session démarre toute seule/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('local-new-session'));

    // The session id is on screen at this point; telling the user a session will
    // start by itself described a state the header already contradicted.
    await waitFor(() => expect(screen.queryByText(/une session démarre toute seule/i)).toBeNull());
    expect(screen.getByText(/session ouverte/i)).toBeInTheDocument();
  });

  it('does not announce closing a thread that never existed', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('/byan');
    pressEnter();

    const notice = await screen.findByText(/nouvelle session avec l'agent bmad-byan/i);
    expect(notice.textContent).not.toMatch(/fil précédent/i);
  });

  it('DOES announce closing a thread when there was one', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('bonjour');
    pressEnter();
    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    // Close the turn: the input refuses to submit while a stream is open, so
    // without this the slash command below never runs and the test would be
    // asserting on a command that was silently dropped.
    emit({ type: 'complete', sessionId: 'sess-1', result: 'salut' });
    await waitFor(() => expect(screen.getByText('salut')).toBeInTheDocument());

    type('/byan');
    pressEnter();

    const notice = await screen.findByText(/fil précédent est fermé/i);
    expect(notice).toBeInTheDocument();
  });
});


describe('LocalChatView — pendant que ca travaille', () => {
  it('names the tool and counts the seconds instead of showing a mute spinner', async () => {
    // The complaint this fixes: an agent activation is 20s+ of tool calls before
    // the first word, and the interface showed one small spinner with no text, so
    // it read as an app doing nothing.
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('salut');
    pressEnter();
    await waitFor(() => expect(mockSend).toHaveBeenCalled());

    emit({
      type: 'tool',
      sessionId: 'sess-1',
      tool: {},
      activity: { name: 'Bash', detail: 'ls', phase: 'start' },
    });

    const line = await screen.findByTestId('local-activity');
    expect(line).toHaveTextContent('Bash');
    expect(line).toHaveTextContent('ls');
    expect(line.textContent).toMatch(/\d+s/);
  });

  it('the seconds counter actually advances', async () => {
    // Asserting /\d+s/ alone passes on a frozen '0s', so a dead timer would slip
    // through. Advance a simulated clock and require the number to change.
    vi.useFakeTimers();
    try {
      render(<LocalChatView />, { wrapper: LocalChatProvider });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      type('salut');
      pressEnter();
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      emit({ type: 'tool', sessionId: 'sess-1', tool: {}, activity: { name: 'Bash', phase: 'start' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(screen.getByTestId('local-activity').textContent).toContain('0s');

      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(screen.getByTestId('local-activity').textContent).toContain('3s');
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the reasoning counter when no tool has run yet', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');
    type('salut');
    pressEnter();
    await waitFor(() => expect(mockSend).toHaveBeenCalled());

    emit({ type: 'thinking', sessionId: 'sess-1', tokens: 50 });

    const line = await screen.findByTestId('local-activity');
    expect(line).toHaveTextContent('50');
    expect(line).toHaveTextContent(/réflexion/i);
  });

  it('says the step finished when the engine reports completion of it', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');
    type('salut');
    pressEnter();
    await waitFor(() => expect(mockSend).toHaveBeenCalled());

    emit({ type: 'tool', sessionId: 'sess-1', tool: {}, activity: { name: 'commande', detail: 'ls', phase: 'end' } });

    const line = await screen.findByTestId('local-activity');
    expect(line).toHaveTextContent(/terminé/i);
  });

  it('a stale activity from the previous turn does not label the next one', async () => {
    // The obvious version of this test — assert the line is gone after 'complete'
    // — cannot fail: the line only renders while streaming, so it disappears
    // whether or not the state was cleared. Proving the reset needs a SECOND turn
    // that produces no activity of its own.
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('salut');
    pressEnter();
    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    emit({ type: 'tool', sessionId: 'sess-1', tool: {}, activity: { name: 'Bash', detail: 'ls', phase: 'start' } });
    await screen.findByTestId('local-activity');
    emit({ type: 'complete', sessionId: 'sess-1', result: 'fini' });
    await waitFor(() => expect(screen.getByText('fini')).toBeInTheDocument());

    type('encore');
    pressEnter();
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(2));

    // Showing 'Bash — ls' here would attribute the previous turn's work to this one.
    const line = await screen.findByTestId('local-activity');
    expect(line).not.toHaveTextContent('Bash');
    expect(line).toHaveTextContent(/en cours/i);
  });

  it('an unlabelled tool frame keeps the previous label rather than blanking it', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');
    type('salut');
    pressEnter();
    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    emit({ type: 'tool', sessionId: 'sess-1', tool: {}, activity: { name: 'Read', detail: 'a.ts', phase: 'start' } });
    await screen.findByTestId('local-activity');

    emit({ type: 'tool', sessionId: 'sess-1', tool: { odd: true } });

    expect(screen.getByTestId('local-activity')).toHaveTextContent('Read');
  });
});


describe("LocalChatView — envoyer pendant qu'une session s'ouvre", () => {
  // Hermetic: clearAllMocks does NOT drain a mockReturnValueOnce queue, so a
  // leftover once-value from one test would answer the next test's first call.
  // These two tests each reset and install exactly what they need.
  function deferStart() {
    const gate: { resolve?: (v: { sessionId: string; cwd: string }) => void } = {};
    mockStart.mockReset();
    mockStart.mockReturnValueOnce(new Promise((res) => { gate.resolve = res; }));
    mockStart.mockResolvedValue({ sessionId: 'sess-later', cwd: '/home/yan/monprojet' });
    return gate;
  }

  it('keeps the message and sends it to the NEW session instead of losing it', async () => {
    // The reported bug: /byan starts a session without awaiting, and a message
    // typed during that gap went to the OUTGOING session, had its bubble erased
    // by the incoming session's reset, and its target process stopped. No error,
    // no reply, no trace — the message simply vanished.
    const gate = deferStart();
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    // Starts a session and does NOT wait for it.
    type('/byan');
    pressEnter();
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));

    // The user types into the gap.
    type('salut');
    pressEnter();

    // The start lands only now.
    gate.resolve?.({ sessionId: 'sess-byan', cwd: '/home/yan/monprojet' });

    // The message survives...
    expect(await screen.findByText('salut')).toBeInTheDocument();
    // ...and reaches the session that is actually alive.
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('sess-byan', 'salut', undefined));
    // A second start would mean the send raced into opening its own session.
    expect(mockStart).toHaveBeenCalledTimes(1);
    // And the live session is the one the turn went to.
    expect(screen.getByTestId('local-session-id')).toHaveTextContent('sess-byan'.slice(0, 8));
  });

  it('says the session is opening instead of showing an empty void', async () => {
    const gate = deferStart();
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    fireEvent.click(screen.getByTestId('local-new-session'));

    expect(await screen.findByTestId('local-starting')).toHaveTextContent(/ouverture/i);
    gate.resolve?.({ sessionId: 'sess-2', cwd: '/home/yan/monprojet' });
    await waitFor(() => expect(screen.queryByTestId('local-starting')).toBeNull());
  });
});
