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

  it('engine switch: codex is ABSENT from the DOM when the binary is not detected, not greyed', async () => {
    // It used to render disabled. A greyed control promises a capability and
    // takes it back — so with only one engine installed there is no picker at
    // all, and the REASON takes its place so the absence stays findable.
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude' });
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    const solo = await screen.findByTestId('local-engine-solo');
    expect(solo).toHaveTextContent(/codex n'est pas installé sur ce PC/i);
    expect(screen.queryByTestId('local-engine-codex')).toBeNull();
    // No one-option group either: a switch with a single position is not a switch.
    expect(screen.queryByTestId('local-engine-claude')).toBeNull();
  });

  it('engine switch: claims nothing about codex until the detection answers', async () => {
    // Between mount and the probe's answer, codex is neither present nor absent —
    // it is unmeasured. Printing "codex n'est pas installé" there would be a
    // claim with no measurement behind it, flashed on every mount.
    const gate: { resolve?: (v: Record<string, string>) => void } = {};
    mockCliDetect.mockReturnValueOnce(new Promise((res) => { gate.resolve = res; }));
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    expect(screen.queryByTestId('local-engine-solo')).toBeNull();
    expect(screen.queryByTestId('local-engine-codex')).toBeNull();

    gate.resolve?.({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    await waitFor(() => expect(screen.getByTestId('local-engine-codex')).toBeInTheDocument());
    expect(screen.queryByTestId('local-engine-solo')).toBeNull();
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

// A live session with two messages on screen — the state in which closing the
// session actually costs something.
async function withLiveThread() {
  render(<LocalChatView />, { wrapper: LocalChatProvider });
  await screen.findByTestId('local-model-chip');
  type('bonjour');
  pressEnter();
  await waitFor(() => expect(mockSend).toHaveBeenCalled());
  emit({ type: 'complete', sessionId: 'sess-1', result: 'salut' });
  await waitFor(() => expect(screen.getByText('salut')).toBeInTheDocument());
}

// A live session on claude with the codex engine available to switch to.
async function withLiveThreadAndBothEngines() {
  mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
  render(<LocalChatView />, { wrapper: LocalChatProvider });
  await waitFor(() => expect(screen.getByTestId('local-engine-codex')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('local-new-session'));
  await waitFor(() => expect(screen.getByTestId('local-identity-engine')).toHaveTextContent('claude'));
}

describe('LocalChatView — effort chip presence', () => {
  // These three used to assert the OPPOSITE: that the control was absent on
  // claude because claude exposed no reasoning-effort flag. That was a wrong
  // measurement, not a design choice — claude 2.1.220 has `--effort <level>`,
  // "Effort level for the current session", and the earlier probe missed it. So
  // the assertions flip: the control is offered on BOTH engines, and what differs
  // is the accepted VALUES and WHEN a change takes hold.
  it('is offered on claude too — the flag exists', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    expect(await screen.findByTestId('local-model-chip')).toBeInTheDocument();
    expect(screen.getByTestId('local-effort-chip')).toBeInTheDocument();
  });

  it('appears on codex', async () => {
    await renderAsCodex();
    expect(screen.getByTestId('local-effort-chip')).toBeInTheDocument();
  });

  it('offers only the values claude accepts — no none, no minimal', async () => {
    // Measured: claude answers "Valid values: low, medium, high, xhigh, max" and
    // an unknown value is WARNED about then IGNORED. Offering 'none' there would
    // be a setting the user picked and the CLI silently dropped.
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    fireEvent.click(await screen.findByTestId('local-effort-chip'));
    expect(await screen.findByTestId('local-effort-high')).toBeInTheDocument();
    expect(screen.queryByTestId('local-effort-none')).toBeNull();
    expect(screen.queryByTestId('local-effort-minimal')).toBeNull();
  });

  it('offers the codex-only value, and NOT the one its API refuses', async () => {
    // MESURE CONTRE L'API du 2026-08-05, valeur par valeur : `none` est acceptee,
    // `minimal` est REFUSEE (« Unsupported value: 'minimal' is not supported with
    // the ... model »). Ce test attendait `minimal` parce que la mesure d'origine
    // portait sur ce que la ligne de commande accepte — or elle ne valide rien et
    // transmet tout. Le CLI n'est pas l'autorite ; l'API l'est.
    await renderAsCodex();
    fireEvent.click(screen.getByTestId('local-effort-chip'));
    expect(await screen.findByTestId('local-effort-none')).toBeInTheDocument();
    expect(screen.queryByTestId('local-effort-minimal')).toBeNull();
  });

  it('says WHEN a change lands, and it differs per engine', async () => {
    // claude takes --effort at spawn, so a change waits for the next session;
    // codex takes it per turn. Same control, two different promises — and a
    // promise the interface does not state is a promise the user cannot rely on.
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    fireEvent.click(await screen.findByTestId('local-effort-chip'));
    fireEvent.click(await screen.findByTestId('local-effort-high'));
    expect(await screen.findByText(/prochaine session/i)).toBeInTheDocument();
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

  // Ce test epinglait l'inverse : « refuses an agent on codex ». Il decrivait une
  // croyance, pas une limite. Mesure du 2026-08-04, codex-cli 0.146.0 :
  // `codex exec --help` n'expose aucun `--agent` — donc pas de selection native.
  // Mais un agent BYAN est un fichier d'instructions, et codex lit les siennes sur
  // l'entree standard : la definition part en tete du tour. La commande fonctionne
  // donc, et c'est l'interface qui doit dire ce qui differe.
  it('accepte un agent sur codex, en injectant sa definition dans le tour', async () => {
    await renderAsCodex();
    type('/byan');
    pressEnter();

    // L'agent est POSE, plus refuse.
    await waitFor(() => expect(mockStoreSet).toHaveBeenCalledWith('chat.localAgent', 'bmad-byan'));
  });

  it('dit ce qui DIFFERE sur codex : la persona, pas le modele ni les outils', async () => {
    // Laisser croire a une equivalence avec claude serait pire que l'ancien refus.
    await renderAsCodex();
    type('/byan');
    pressEnter();

    const notice = await screen.findByTestId('local-notice');
    expect(notice).toHaveTextContent(/persona/i);
    expect(notice.textContent ?? '').toMatch(/mod[eè]le|outil/i);
  });

  it('ne dit RIEN de particulier sur claude, ou le chargement est natif', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');
    type('/byan');
    pressEnter();

    const notice = await screen.findByTestId('local-notice');
    expect(notice).toHaveTextContent(/Nouvelle session avec l'agent/i);
    expect(notice.textContent ?? '').not.toMatch(/persona/i);
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
  it('the identity bar names the folder main fell back to, and the foot keeps offering the pick', async () => {
    // One chip used to have to be both things at once: it read "Choisir un
    // dossier" while the session was already running in /home/yan/replidumain.
    // Splitting the temporalities is what resolves it — the identity bar carries
    // the folder that IS, the foot carries the folder that WILL BE.
    mockStoreGet.mockImplementation(() => Promise.resolve(null));
    mockStart.mockResolvedValue({ sessionId: 'sess-fb', cwd: '/home/yan/replidumain' });
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');
    // Nothing is running, so there is no identity to read yet...
    expect(screen.getByTestId('local-identity-none')).toBeInTheDocument();
    // ...and the deferred folder says plainly that nothing was chosen.
    expect(screen.getByTestId('local-cwd')).toHaveTextContent('dossier par défaut');

    fireEvent.click(screen.getByTestId('local-new-session'));

    await waitFor(() => expect(screen.getByTestId('local-identity-cwd')).toHaveTextContent('replidumain'));
    // The full path is reachable, and the foot still offers the pick without
    // pretending it already happened.
    expect(screen.getByTestId('local-identity-cwd').getAttribute('title')).toBe('/home/yan/replidumain');
    expect(screen.getByTestId('local-cwd')).toHaveTextContent('dossier par défaut');
    expect(screen.getByTestId('local-cwd').getAttribute('title')).toContain('par défaut');
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


// An activity frame now has to be PLACEABLE IN TIME, so `at` (epoch ms) is a
// required field of LocalChatActivity — see shared/tool-activity.ts. These are
// display tests: the view reads the label and its own elapsed counter, never
// `at`. A fixed instant therefore keeps the fixtures deterministic, including
// inside the fake-timers test below where Date.now() is mocked.
const AT = 1_760_000_000_000;

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
      activity: { name: 'Bash', detail: 'ls', phase: 'start', at: AT },
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
      emit({ type: 'tool', sessionId: 'sess-1', tool: {}, activity: { name: 'Bash', phase: 'start', at: AT } });
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

    emit({ type: 'tool', sessionId: 'sess-1', tool: {}, activity: { name: 'commande', detail: 'ls', phase: 'end', at: AT } });

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
    emit({ type: 'tool', sessionId: 'sess-1', tool: {}, activity: { name: 'Bash', detail: 'ls', phase: 'start', at: AT } });
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
    emit({ type: 'tool', sessionId: 'sess-1', tool: {}, activity: { name: 'Read', detail: 'a.ts', phase: 'start', at: AT } });
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


describe("LocalChatView — une commande ne mange pas le texte qui la suit", () => {
  it('/byan <texte> switches to the agent AND sends the text', async () => {
    // Reported verbatim: "/byan salut mon reuf" did nothing. The command arm read
    // the slug it needed and DISCARDED the rest, so the message was never sent
    // anywhere — no bubble, no error, no trace.
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('/byan salut mon reuf');
    pressEnter();

    // The agent is applied...
    await waitFor(() => expect(screen.getByTestId('local-agent-chip')).toHaveTextContent('bmad-byan'));
    // ...and the words the user typed actually reach the engine.
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('sess-1', 'salut mon reuf', undefined));
    expect(await screen.findByText('salut mon reuf')).toBeInTheDocument();
  });

  it('/byan alone still just opens the session', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('/byan');
    pressEnter();

    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('/agent <slug> <texte> takes the slug and sends the rest', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('/agent dev salut');
    pressEnter();

    await waitFor(() => expect(screen.getByTestId('local-agent-chip')).toHaveTextContent('bmad-bmm-dev'));
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('sess-1', 'salut', undefined));
  });

  it('/new <texte> opens the session and sends the text', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('/new bonjour');
    pressEnter();

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('sess-1', 'bonjour', undefined));
  });

  it('a panel command SAYS the trailing text was not sent instead of eating it', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('/usage salut');
    pressEnter();

    // The panel opens, but the words are accounted for rather than dropped.
    expect(await screen.findByTestId('usage-panel')).toBeInTheDocument();
    // One sentence, shared with the cloud surface (components/chat/command-copy).
    // It used to be spelled without its accents here and with them there.
    const notice = await screen.findByTestId('local-notice');
    expect(notice).toHaveTextContent('"salut" n\'a pas été envoyé');
    expect(notice).toHaveTextContent('/usage ne transporte pas de message');
    expect(mockSend).not.toHaveBeenCalled();
  });
});


describe('LocalChatView — les deux temporalites du bandeau', () => {
  it('the identity bar reads the LIVE session and carries no control', async () => {
    // Six chips used to sit on one line, all clickable, with nothing to tell what
    // was already true from what would apply next. The top bar is now a reading.
    await withLiveThread();
    const identity = screen.getByTestId('local-identity');
    expect(identity.querySelectorAll('button').length).toBe(0);
    expect(identity).toHaveTextContent('monprojet');
    expect(identity).toHaveTextContent('claude');
    expect(identity).toHaveTextContent('sess-1');
    // The model of the RUNNING session, and it says which state it is in: no
    // model was pinned, so the CLI's own default applies — that is a named state,
    // not a hole.
    expect(screen.getByTestId('local-identity-model')).toHaveTextContent(/par défaut du CLI/i);
  });

  it('says how long the session has been open, and the count advances', async () => {
    vi.useFakeTimers();
    try {
      render(<LocalChatView />, { wrapper: LocalChatProvider });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      fireEvent.click(screen.getByTestId('local-new-session'));
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(screen.getByTestId('local-identity-uptime').textContent)
        .toMatch(/moins d'une minute/i);

      await act(async () => { await vi.advanceTimersByTimeAsync(125_000); });
      expect(screen.getByTestId('local-identity-uptime').textContent).toMatch(/2 min/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the settings sit at the FOOT, next to the input, not in the identity bar', async () => {
    await renderAsCodex();
    const settings = screen.getByTestId('local-next-settings');
    const identity = screen.getByTestId('local-identity');
    // Effort applies from the next MESSAGE, which is why it moved down here.
    expect(settings).toContainElement(screen.getByTestId('local-effort-chip'));
    expect(identity).not.toContainElement(screen.getByTestId('local-effort-chip'));
    // Folder / engine / model apply from the next START.
    expect(settings).toContainElement(screen.getByTestId('local-cwd'));
    expect(settings).toContainElement(screen.getByTestId('local-model-chip'));
    expect(settings).toContainElement(screen.getByTestId('local-engine-codex'));
    expect(settings).toHaveTextContent(/prochain message/i);
    expect(settings).toHaveTextContent(/prochain démarrage/i);
  });

  it('on claude, the effort waits for the next SESSION, not the next message', async () => {
    // Was written as "the prochain message group is absent on claude, where effort
    // does not exist". Effort does exist on claude — it is a spawn flag, so the
    // temporality is the session, not the turn. The group is present and says so.
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');
    const settings = screen.getByTestId('local-next-settings');
    expect(settings).not.toHaveTextContent(/prochain message/i);
    expect(settings).toHaveTextContent(/prochain démarrage/i);
    expect(settings).toHaveTextContent(/effort/i);
  });
});


describe("LocalChatView — la ligne d'ecart", () => {
  it('names the chosen setting AND the one the conversation is running', async () => {
    await withLiveThreadAndBothEngines();
    expect(screen.queryByTestId('local-divergence')).toBeNull();

    fireEvent.click(screen.getByTestId('local-engine-codex'));

    const line = await screen.findByTestId('local-divergence');
    expect(line).toHaveTextContent(/le moteur codex est choisi/i);
    expect(line).toHaveTextContent(/prochain démarrage/i);
    expect(line).toHaveTextContent(/tourne toujours sur claude/i);
    // The identity bar keeps reading the truth while the choice waits.
    expect(screen.getByTestId('local-identity-engine')).toHaveTextContent('claude');
  });

  it('reports a chosen model that the running session is not using', async () => {
    await withLiveThread();
    type('/model opus');
    pressEnter();
    const line = await screen.findByTestId('local-divergence');
    expect(line).toHaveTextContent(/le modèle opus est choisi/i);
    expect(line).toHaveTextContent(/le modèle par défaut du CLI/i);
  });

  it('stays silent while nothing is running — there is nothing to diverge from', async () => {
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await waitFor(() => expect(screen.getByTestId('local-engine-codex')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('local-engine-codex'));
    type('/model gpt-5.6-sol');
    pressEnter();
    await waitFor(() => expect(screen.getByTestId('local-model-chip')).toHaveTextContent('gpt-5.6-sol'));
    expect(screen.queryByTestId('local-divergence')).toBeNull();
  });

  it('"Redémarrer maintenant" states the consequence, then applies the choice', async () => {
    await withLiveThreadAndBothEngines();
    fireEvent.click(screen.getByTestId('local-engine-codex'));
    await screen.findByTestId('local-divergence');
    const startsBefore = mockStart.mock.calls.length;

    fireEvent.click(screen.getByTestId('local-divergence-restart'));

    const dialog = await screen.findByTestId('local-restart-dialog');
    expect(dialog).toHaveTextContent(/redémarrer applique tes réglages/i);
    // Nothing has restarted yet: the sentence comes BEFORE the act.
    expect(mockStart).toHaveBeenCalledTimes(startsBefore);

    mockStart.mockResolvedValue({ sessionId: 'sess-2', cwd: '/home/yan/monprojet' });
    fireEvent.click(screen.getByTestId('local-restart-dialog-danger'));

    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(startsBefore + 1));
    expect(mockStart).toHaveBeenLastCalledWith({ cli: 'codex' });
    // The choice is now in force, so the amber line has nothing left to say.
    await waitFor(() => expect(screen.queryByTestId('local-divergence')).toBeNull());
    expect(screen.getByTestId('local-identity-engine')).toHaveTextContent('codex');
  });

  it('a resumed session is reported as running on claude, not on the selected engine', async () => {
    // resume() passes only the folder, so main applies its own default engine.
    // Claiming the resumed session runs on codex would be a fact that is not one.
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    mockList.mockResolvedValue([
      { id: 'chat-old', cli: 'claude', agent: null, cwd: '/p', resumable: true, created: '', updated: '', messageCount: 1, lastMessage: 'salut' },
    ]);
    mockStart.mockResolvedValue({ sessionId: 'chat-old', cwd: '/p' });
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await waitFor(() => expect(screen.getByTestId('local-engine-codex')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('local-engine-codex'));

    fireEvent.click(screen.getByTestId('local-sessions-toggle'));
    fireEvent.click(await screen.findByTestId('local-session-chat-old'));

    await waitFor(() => expect(screen.getByTestId('local-identity-engine')).toHaveTextContent('claude'));
    expect(await screen.findByTestId('local-divergence')).toHaveTextContent(/tourne toujours sur claude/i);
  });
});


describe('LocalChatView — /new enonce avant, constate apres', () => {
  it('names what stops, what is lost and what is kept, before doing any of it', async () => {
    await withLiveThread();
    const startsBefore = mockStart.mock.calls.length;

    fireEvent.click(screen.getByTestId('local-new-session'));

    const dialog = await screen.findByTestId('local-restart-dialog');
    expect(dialog).toHaveTextContent(/ouvrir une nouvelle session ferme celle-ci/i);
    // Which folder.
    expect(dialog).toHaveTextContent('/home/yan/monprojet');
    // What stops.
    expect(dialog).toHaveTextContent(/sess-1/);
    // What is lost — and that it does NOT come back: main.history() returns an
    // empty list by design, so a local thread is not re-readable.
    expect(dialog).toHaveTextContent(/2 messages/);
    expect(dialog).toHaveTextContent(/ne se reprend pas/i);
    // What is kept.
    expect(dialog).toHaveTextContent(/ce qui est gardé/i);
    // And none of it has happened yet.
    expect(mockStart).toHaveBeenCalledTimes(startsBefore);
  });

  it('staying put leaves the session and the thread alone', async () => {
    await withLiveThread();
    const startsBefore = mockStart.mock.calls.length;

    fireEvent.click(screen.getByTestId('local-new-session'));
    fireEvent.click(await screen.findByTestId('local-restart-dialog-cancel'));

    await waitFor(() => expect(screen.queryByTestId('local-restart-dialog')).toBeNull());
    expect(mockStart).toHaveBeenCalledTimes(startsBefore);
    expect(screen.getByText('salut')).toBeInTheDocument();
    expect(screen.getByTestId('local-session-id')).toHaveTextContent('sess-1');
  });

  it('confirming opens the session and SAYS what was closed', async () => {
    await withLiveThread();
    mockStart.mockResolvedValue({ sessionId: 'sess-2', cwd: '/home/yan/monprojet' });

    fireEvent.click(screen.getByTestId('local-new-session'));
    fireEvent.click(await screen.findByTestId('local-restart-dialog-danger'));

    await waitFor(() => expect(screen.getByTestId('local-session-id')).toHaveTextContent('sess-2'));
    const notice = screen.getByTestId('local-notice');
    expect(notice).toHaveTextContent(/sess-1/);
    expect(notice).toHaveTextContent(/2 messages/);
    expect(notice).toHaveTextContent(/n'est plus consultable/i);
  });

  it('does not ask when there is nothing to lose', async () => {
    // A dialog over an empty screen is the ceremony that teaches people to click
    // through dialogs.
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    fireEvent.click(screen.getByTestId('local-new-session'));

    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    expect(screen.queryByTestId('local-restart-dialog')).toBeNull();
  });

  it('/new <texte> carries the text through the confirmation', async () => {
    await withLiveThread();
    mockStart.mockResolvedValue({ sessionId: 'sess-2', cwd: '/home/yan/monprojet' });

    type('/new encore');
    pressEnter();
    fireEvent.click(await screen.findByTestId('local-restart-dialog-danger'));

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('sess-2', 'encore', undefined));
  });
});


describe('LocalChatView — /clear tient sa promesse', () => {
  it('clears the DISPLAY without starting a new session', async () => {
    // The label says "Effacer la conversation affichée" ; the code used to call
    // onNewSession(), which stops the engine and drops its context. The behaviour
    // was fixed, not the label.
    await withLiveThread();
    const startsBefore = mockStart.mock.calls.length;

    type('/clear');
    pressEnter();

    await waitFor(() => expect(screen.queryByText('salut')).toBeNull());
    expect(screen.queryByText('bonjour')).toBeNull();
    expect(mockStart).toHaveBeenCalledTimes(startsBefore);
    expect(screen.getByTestId('local-session-id')).toHaveTextContent('sess-1');
  });

  it('says the session keeps its context, so an emptied screen does not read as a loss', async () => {
    await withLiveThread();

    type('/clear');
    pressEnter();

    const notice = await screen.findByTestId('local-notice');
    expect(notice).toHaveTextContent(/affichage vidé/i);
    expect(notice).toHaveTextContent(/2 messages masqués/i);
    expect(notice).toHaveTextContent(/continue avec tout son contexte/i);
  });

  it('a message sent after /clear appears, and the hidden ones stay hidden', async () => {
    await withLiveThread();
    type('/clear');
    pressEnter();
    await waitFor(() => expect(screen.queryByText('salut')).toBeNull());

    type('encore');
    pressEnter();

    await waitFor(() => expect(screen.getByText('encore')).toBeInTheDocument());
    expect(screen.queryByText('bonjour')).toBeNull();
    expect(screen.queryByText('salut')).toBeNull();
  });

  it('explains itself when there is nothing displayed instead of doing nothing', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('/clear');
    pressEnter();

    expect(await screen.findByTestId('local-notice')).toHaveTextContent(/déjà vide/i);
    expect(mockStart).not.toHaveBeenCalled();
  });
});


describe('LocalChatView — codex absent : absence cote offre, explication cote reception', () => {
  it('/engine codex still ANSWERS even though the button is not proposed', async () => {
    // The corollary of the absence rule: a path the app does not offer but the
    // user finds must answer, not go quiet.
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude' });
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-engine-solo');

    type('/engine codex');
    pressEnter();

    expect(await screen.findByTestId('local-notice')).toHaveTextContent(/introuvable sur ce PC/i);
    expect(mockStoreSet).not.toHaveBeenCalledWith('chat.localEngine', 'codex');
  });

  it('/engine codex says the detection did not answer rather than claiming an absence', async () => {
    mockCliDetect.mockRejectedValue(new Error('detect down'));
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('/engine codex');
    pressEnter();

    const notice = await screen.findByTestId('local-notice');
    expect(notice).toHaveTextContent(/détection n'a pas répondu/i);
    expect(notice).not.toHaveTextContent(/introuvable/i);
    expect(mockStoreSet).not.toHaveBeenCalledWith('chat.localEngine', 'codex');
  });
});

// ---------------------------------------------------------------------------
// Changer de moteur : reproche direct de Yan — "quand je veux faire un chat avec
// codex ca marche pas, et en plus on perd la session".
//
// Les deux plaintes sont UN defaut. pickEngine ne posait qu'une etiquette : le
// message suivant partait toujours sur la session claude en cours, donc le
// changement paraissait sans effet. Pour obtenir codex il fallait cliquer
// "Nouvelle session", et la on perdait l'echange.
// ---------------------------------------------------------------------------
describe('LocalChatView — changer de moteur agit et garde la conversation', () => {
  it('bascule sur codex IMMEDIATEMENT au lieu d\'attendre un redemarrage manuel', async () => {
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('bonjour');
    pressEnter();
    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    emit({ type: 'complete', sessionId: 'sess-1', result: 'salut' });
    await waitFor(() => expect(screen.getByText('salut')).toBeInTheDocument());

    mockStart.mockClear();
    fireEvent.click(screen.getByTestId('local-engine-codex'));

    // Une session codex demarre sans que l'utilisateur ait a la demander.
    await waitFor(() => expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({ cli: 'codex' })
    ));
  });

  it('garde la conversation a l\'ecran quand le moteur change', async () => {
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('bonjour');
    pressEnter();
    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    emit({ type: 'complete', sessionId: 'sess-1', result: 'salut' });
    await waitFor(() => expect(screen.getByText('salut')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('local-engine-codex'));

    // Perdre l'echange etait le reproche. Il reste lisible.
    await waitFor(() => expect(screen.getByText('bonjour')).toBeInTheDocument());
    expect(screen.getByText('salut')).toBeInTheDocument();
  });

  it('dit que le nouveau moteur ne reprend PAS le contexte precedent', async () => {
    // Garder le transcript a l'ecran sans le dire serait un mensonge : codex
    // demarre un fil neuf, il n'a pas lu ce que claude a repondu. Regle 3 —
    // aucune commande muette.
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    type('bonjour');
    pressEnter();
    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    emit({ type: 'complete', sessionId: 'sess-1', result: 'salut' });
    await waitFor(() => expect(screen.getByText('salut')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('local-engine-codex'));

    expect(await screen.findByText(/ne reprend pas|sans le contexte|repart de zéro/i)).toBeInTheDocument();
  });

  it('sans session en cours, changer de moteur ne demarre rien', async () => {
    // Rien a porter, donc rien a redemarrer : la premiere session partira sur le
    // bon moteur toute seule.
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');

    mockStart.mockClear();
    fireEvent.click(screen.getByTestId('local-engine-codex'));

    await waitFor(() => expect(screen.getByTestId('local-engine-codex')).toHaveAttribute('aria-pressed', 'true'));
    expect(mockStart).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// La frise — troisieme profondeur de lecture.
//
// Elle repond a « ou est passe le temps ? », une question qu'on ne se pose
// qu'apres avoir lu la phrase. Donc : jamais en premier ecran, jamais sans
// mesure, et fermee par defaut.
// ---------------------------------------------------------------------------
describe('LocalChatView — la frise du tour', () => {
  const LIBELLE = /le détail minute par minute/i;

  it('n affiche rien tant qu aucune etape n a ete mesuree', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByText(/chat local avec claude/i);
    // Une frise vide serait un dessin qui affirme un chantier inexistant.
    expect(screen.queryByText(LIBELLE)).not.toBeInTheDocument();
  });

  it('apparait des qu il y a des etapes, et reste fermee', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    fireEvent.change(screen.getByTestId('local-chat-input'), { target: { value: 'salut' } });
    fireEvent.click(screen.getByTestId('local-chat-send'));
    await waitFor(() => expect(listeners.length).toBeGreaterThan(0));

    act(() => {
      emit({ type: 'tool', sessionId: 'sess-1', tool: {}, activity: { name: 'Read', phase: 'start', id: 'a', at: 1000 } });
      emit({ type: 'tool', sessionId: 'sess-1', tool: {}, activity: { name: 'Read', phase: 'end', id: 'a', at: 9000 } });
      emit({ type: 'complete', sessionId: 'sess-1' });
    });

    const bouton = await screen.findByRole('button', { name: LIBELLE });
    // Fermee : la troisieme profondeur ne s'impose pas.
    expect(bouton).toHaveAttribute('aria-expanded', 'false');
  });

  it('s ouvre au clic et montre le dessin', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    fireEvent.change(screen.getByTestId('local-chat-input'), { target: { value: 'salut' } });
    fireEvent.click(screen.getByTestId('local-chat-send'));
    await waitFor(() => expect(listeners.length).toBeGreaterThan(0));
    act(() => {
      emit({ type: 'tool', sessionId: 'sess-1', tool: {}, activity: { name: 'Bash', phase: 'start', id: 'a', at: 1000 } });
      emit({ type: 'tool', sessionId: 'sess-1', tool: {}, activity: { name: 'Bash', phase: 'end', id: 'a', at: 9000 } });
      emit({ type: 'complete', sessionId: 'sess-1' });
    });

    fireEvent.click(await screen.findByRole('button', { name: LIBELLE }));
    expect(await screen.findByRole('group', { name: LIBELLE })).toBeInTheDocument();
    // Le dessin lui-meme, pas seulement son cadre : une frise ouverte sur un
    // panneau vide serait un bouton qui ne mene nulle part.
    expect(screen.getByTestId('timeline-figure')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-empty')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Les trois autres ecrans, branches sur des signaux locaux.
//
// La regle est la meme que pour la frise : un ecran ne s'affiche QUE si son
// signal existe. Un panneau de contamination sans echec, ou un prix du retour
// sans tour mesure, affirmerait quelque chose de faux.
// ---------------------------------------------------------------------------
describe('LocalChatView — contamination, prix du retour, main levee', () => {
  it('n affiche ni contamination ni prix du retour au demarrage', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByText(/chat local avec claude/i);
    expect(screen.queryByTestId('local-contamination')).toBeNull();
    expect(screen.queryByTestId('local-rewind')).toBeNull();
  });

  it('montre la contamination quand une etape a echoue ET qu une autre a suivi', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    fireEvent.change(screen.getByTestId('local-chat-input'), { target: { value: 'salut' } });
    fireEvent.click(screen.getByTestId('local-chat-send'));
    await waitFor(() => expect(listeners.length).toBeGreaterThan(0));

    act(() => {
      emit({ type: 'tool', sessionId: 'sess-1', tool: {}, activity: { name: 'Bash', phase: 'start', id: 'a', at: 1000 } });
      emit({ type: 'tool', sessionId: 'sess-1', tool: {}, activity: { name: 'Bash', phase: 'end', id: 'a', at: 2000, ok: false } });
      emit({ type: 'tool', sessionId: 'sess-1', tool: {}, activity: { name: 'Edit', phase: 'start', id: 'b', at: 3000 } });
      emit({ type: 'tool', sessionId: 'sess-1', tool: {}, activity: { name: 'Edit', phase: 'end', id: 'b', at: 4000, ok: true } });
      emit({ type: 'complete', sessionId: 'sess-1' });
    });

    expect(await screen.findByTestId('local-contamination')).toBeInTheDocument();
  });

  it('ne montre PAS la contamination quand tout a reussi', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    fireEvent.change(screen.getByTestId('local-chat-input'), { target: { value: 'salut' } });
    fireEvent.click(screen.getByTestId('local-chat-send'));
    await waitFor(() => expect(listeners.length).toBeGreaterThan(0));
    act(() => {
      emit({ type: 'tool', sessionId: 'sess-1', tool: {}, activity: { name: 'Bash', phase: 'start', id: 'a', at: 1000 } });
      emit({ type: 'tool', sessionId: 'sess-1', tool: {}, activity: { name: 'Bash', phase: 'end', id: 'a', at: 2000, ok: true } });
      emit({ type: 'complete', sessionId: 'sess-1' });
    });
    await screen.findByTestId('local-work-timeline');
    expect(screen.queryByTestId('local-contamination')).toBeNull();
  });

  it('montre le prix du retour des qu un tour a ete mesure', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    fireEvent.change(screen.getByTestId('local-chat-input'), { target: { value: 'salut' } });
    fireEvent.click(screen.getByTestId('local-chat-send'));
    await waitFor(() => expect(listeners.length).toBeGreaterThan(0));
    act(() => {
      emit({ type: 'complete', sessionId: 'sess-1', usage: { engine: 'claude', costUsd: 0.12, durationMs: 3000 } });
    });
    expect(await screen.findByTestId('local-rewind')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// L'effort affiche doit exister sur le moteur affiche.
//
// DEFAUT CONSTATE (2026-08-05, signale par l'utilisateur) : `pickEngine`
// calculait bien `nextEffort` pour la session — `isValidEffortFor(next, effort)
// ? effort : null` — mais n'appelait JAMAIS `setEffort`. Consequence : on passe
// de claude a codex avec l'effort `ultracode`, la session codex part SANS effort
// (correct, cette valeur n'existe pas chez lui), et la pastille continue
// d'afficher `ultracode`. L'utilisateur croit que codex tourne a cet effort ; il
// tourne a son defaut.
//
// C'est la meme faute que celle des domaines d'effort : une valeur montree comme
// appliquee alors qu'elle est silencieusement jetee.
// ---------------------------------------------------------------------------
describe('LocalChatView — effort et changement de moteur', () => {
  it('LACHE un effort qui n existe pas sur le nouveau moteur', async () => {
    // codex doit etre detecte AVANT le rendu, sinon sa pastille n'existe pas.
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await waitFor(() => expect(screen.getByTestId('local-engine-codex')).not.toBeDisabled());

    // ultracode : claude seulement (mesure du 2026-07-27 sur claude 2.1.220).
    type('/effort ultracode');
    pressEnter();
    await waitFor(() => expect(screen.getByTestId('local-effort-chip')).toHaveTextContent('ultracode'));
    fireEvent.click(screen.getByTestId('local-engine-codex'));

    // La pastille ne doit plus annoncer une valeur que codex ne connait pas.
    await waitFor(() => expect(screen.getByTestId('local-effort-chip')).not.toHaveTextContent('ultracode'));
  });

  it('GARDE un effort que les deux moteurs connaissent', async () => {
    // `medium` existe des deux cotes : le jeter serait une perte gratuite.
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await waitFor(() => expect(screen.getByTestId('local-engine-codex')).not.toBeDisabled());
    type('/effort medium');
    pressEnter();
    await waitFor(() => expect(screen.getByTestId('local-effort-chip')).toHaveTextContent('medium'));
    fireEvent.click(screen.getByTestId('local-engine-codex'));

    await waitFor(() => expect(screen.getByTestId('local-effort-chip')).toHaveTextContent('medium'));
  });

  it('DIT que l effort a ete lache, au lieu de le faire en silence', async () => {
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await waitFor(() => expect(screen.getByTestId('local-engine-codex')).not.toBeDisabled());
    type('/effort ultracode');
    pressEnter();
    await waitFor(() => expect(screen.getByTestId('local-effort-chip')).toHaveTextContent('ultracode'));
    fireEvent.click(screen.getByTestId('local-engine-codex'));

    const notice = await screen.findByTestId('local-notice');
    expect(notice.textContent ?? '').toMatch(/ultracode/);
  });

  it('propose les efforts de CODEX quand on est sur codex', async () => {
    await renderAsCodex();
    fireEvent.click(screen.getByTestId('local-effort-chip'));

    // La valeur propre a codex est la...
    expect(await screen.findByTestId('local-effort-none')).toBeInTheDocument();
    // ...celle propre a claude n'y est pas...
    expect(screen.queryByTestId('local-effort-ultracode')).toBeNull();
    // ...et `minimal` non plus : l'API la refuse (mesure du 2026-08-05).
    expect(screen.queryByTestId('local-effort-minimal')).toBeNull();
  });

  it('propose les efforts de CLAUDE quand on est sur claude', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await screen.findByTestId('local-model-chip');
    fireEvent.click(screen.getByTestId('local-effort-chip'));

    expect(await screen.findByTestId('local-effort-ultracode')).toBeInTheDocument();
    expect(screen.queryByTestId('local-effort-none')).toBeNull();
    expect(screen.queryByTestId('local-effort-minimal')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// L'etat RESTAURE au demarrage doit etre coherent avec lui-meme.
//
// DEFAUT CONSTATE (2026-08-05, signale avec capture) : au redemarrage, le moteur
// sauvegarde (`codex`) etait restaure ligne 229, puis l'effort sauvegarde etait
// valide ligne 248 par `isValidEffortFor(engine, ...)` — ou `engine` valait
// encore `claude`, la valeur capturee a l'entree de l'effet. Un `set` d'etat ne
// change pas la constante deja fermee dessus.
//
// Resultat : codex affiche avec l'effort `ultracode`, qui n'existe que chez
// claude. Le premier envoi echouait sur une erreur dure du processus principal
// (« Niveau d'effort invalide pour codex »), qui tuait le tour.
//
// La lecon : valider contre la valeur QU'ON VIENT DE CALCULER, jamais contre
// l'etat qu'on est en train de changer.
// ---------------------------------------------------------------------------
describe('LocalChatView — coherence de l etat restaure', () => {
  it('ne restaure PAS un effort claude quand le moteur restaure est codex', async () => {
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    mockStoreGet.mockImplementation(async (key: string) => {
      if (key === 'chat.localEngine') return 'codex';
      if (key === 'chat.localEffort') return 'ultracode'; // claude seulement
      return null;
    });

    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await waitFor(() => expect(screen.getByTestId('local-engine-codex')).toHaveAttribute('aria-pressed', 'true'));

    // La pastille ne doit jamais annoncer une valeur que codex refuse.
    expect(screen.getByTestId('local-effort-chip')).not.toHaveTextContent('ultracode');
  });

  it('restaure un effort que le moteur restaure connait', async () => {
    // `high` existe des deux cotes : le jeter serait une perte gratuite.
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    mockStoreGet.mockImplementation(async (key: string) => {
      if (key === 'chat.localEngine') return 'codex';
      if (key === 'chat.localEffort') return 'high';
      return null;
    });

    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await waitFor(() => expect(screen.getByTestId('local-engine-codex')).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByTestId('local-effort-chip')).toHaveTextContent('high');
  });

  it('restaure un effort propre a CODEX quand codex est restaure', async () => {
    // Le miroir du premier cas : `none` n'existe que chez codex, et il doit
    // survivre. Une validation qui refuserait tout serait aussi fausse.
    // (`minimal` a servi ici jusqu'au 2026-08-05 : l'API le refuse, il est sorti
    // de la liste.)
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    mockStoreGet.mockImplementation(async (key: string) => {
      if (key === 'chat.localEngine') return 'codex';
      if (key === 'chat.localEffort') return 'none';
      return null;
    });

    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await waitFor(() => expect(screen.getByTestId('local-engine-codex')).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByTestId('local-effort-chip')).toHaveTextContent('none');
  });

  it('garde l effort claude quand codex n est PAS installe, donc pas restaure', async () => {
    // Le moteur sauvegarde ne s'applique que si le binaire est la. Si codex est
    // absent, on reste sur claude et `ultracode` est parfaitement valide.
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude' });
    mockStoreGet.mockImplementation(async (key: string) => {
      if (key === 'chat.localEngine') return 'codex';
      if (key === 'chat.localEffort') return 'ultracode';
      return null;
    });

    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await waitFor(() => expect(screen.getByTestId('local-effort-chip')).toHaveTextContent('ultracode'));
  });
});

// ---------------------------------------------------------------------------
// Le dernier filet : l'interface ne tend JAMAIS au processus principal un effort
// que le moteur refuse.
//
// L'erreur vue par l'utilisateur venait du pont : « Niveau d'effort invalide pour
// codex: ultracode ». Le pont a raison de refuser — c'est sa garde. Mais elle ne
// devrait jamais avoir a se declencher : quand elle le fait, le tour MEURT sur une
// erreur technique au milieu de la conversation. La vue doit filtrer avant.
//
// Ce test ne remplace pas la correction de l'etat restaure : il empeche TOUT autre
// chemin, present ou futur, de reproduire le meme symptome.
// ---------------------------------------------------------------------------
describe('LocalChatView — aucun effort invalide ne part vers le pont', () => {
  it('n envoie pas un effort claude sur un tour codex, meme si l etat en porte un', async () => {
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await waitFor(() => expect(screen.getByTestId('local-engine-codex')).not.toBeDisabled());

    // On pose l'effort AVANT de basculer : c'est le seul moyen d'avoir une valeur
    // claude en memoire, et c'est exactement la situation qui a casse.
    type('/effort ultracode');
    pressEnter();
    await waitFor(() => expect(screen.getByTestId('local-effort-chip')).toHaveTextContent('ultracode'));
    fireEvent.click(screen.getByTestId('local-engine-codex'));

    mockSend.mockClear();
    type('test');
    pressEnter();

    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    // mockSend est declare sans parametres, donc TypeScript voit un tuple vide.
    // On lit l'appel par une vue non typee : le test porte sur ce qui a ete PASSE,
    // pas sur la signature du bouchon.
    const appel = mockSend.mock.calls[0] as unknown as unknown[];
    const troisieme = appel?.[2] as { reasoningEffort?: string } | undefined;
    expect(troisieme?.reasoningEffort).not.toBe('ultracode');
  });

  it('envoie bien un effort que codex connait', async () => {
    // La garde ne doit pas tout jeter : `high` existe chez codex.
    mockCliDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    await waitFor(() => expect(screen.getByTestId('local-engine-codex')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('local-engine-codex'));
    type('/effort high');
    pressEnter();
    await waitFor(() => expect(screen.getByTestId('local-effort-chip')).toHaveTextContent('high'));

    mockSend.mockClear();
    type('test');
    pressEnter();

    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    // mockSend est declare sans parametres, donc TypeScript voit un tuple vide.
    // On lit l'appel par une vue non typee : le test porte sur ce qui a ete PASSE,
    // pas sur la signature du bouchon.
    const appel = mockSend.mock.calls[0] as unknown as unknown[];
    const troisieme = appel?.[2] as { reasoningEffort?: string } | undefined;
    expect(troisieme?.reasoningEffort).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// Le prix du retour ne doit pas avaler la reponse.
//
// VU A L'ECRAN (2026-08-05, capture) : apres « salut mon reuf » et une reponse
// d'une ligne, le panneau « Revenir en arriere » occupait tout l'espace en
// dessous. La frise, elle, est derriere un bouton — le panneau le PLUS lourd
// etait le seul a s'imposer. Incoherence, et la reponse se lisait mal.
// ---------------------------------------------------------------------------
describe('LocalChatView — le prix du retour reste replie', () => {
  it('n affiche pas le panneau apres un seul tour sans cout', async () => {
    // Le cas exact de la capture. Rien a perdre, donc rien a peser.
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    type('salut');
    pressEnter();
    await waitFor(() => expect(listeners.length).toBeGreaterThan(0));
    act(() => {
      emit({ type: 'complete', sessionId: 'sess-1', usage: { engine: 'codex', outputTokens: 12 } });
    });
    await waitFor(() => expect(screen.getByTestId('local-usage-toggle')).toBeInTheDocument());
    expect(screen.queryByTestId('local-rewind')).toBeNull();
  });

  it('propose le panneau REPLIE quand il y a un cout a peser', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    type('salut');
    pressEnter();
    await waitFor(() => expect(listeners.length).toBeGreaterThan(0));
    act(() => {
      emit({ type: 'complete', sessionId: 'sess-1', usage: { engine: 'claude', costUsd: 0.12 } });
    });

    // Il existe, mais ferme : la reponse reste lisible.
    const bouton = await screen.findByRole('button', { name: /revenir en arrière/i });
    expect(bouton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('rewind')).toBeNull();
  });

  it('s ouvre au clic et montre les points', async () => {
    render(<LocalChatView />, { wrapper: LocalChatProvider });
    type('salut');
    pressEnter();
    await waitFor(() => expect(listeners.length).toBeGreaterThan(0));
    act(() => {
      emit({ type: 'complete', sessionId: 'sess-1', usage: { engine: 'claude', costUsd: 0.12 } });
    });

    fireEvent.click(await screen.findByRole('button', { name: /revenir en arrière/i }));
    expect(await screen.findByTestId('rewind')).toBeInTheDocument();
  });
});
