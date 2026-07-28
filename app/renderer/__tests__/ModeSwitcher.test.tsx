// ModeSwitcher component tests — Vitest + @testing-library/react + jsdom.
//
// ModeSwitcher is the F1 live toggle : one control, reachable from every screen
// (it lives in the StatusStrip), that flips the app between Local (this PC) and
// Cloud (byan_web) without a re-login. These tests mock window.byanApi and drive
// the switch through the real AuthSessionProvider + ToastProvider so the
// broadcast → re-read wiring is exercised end to end.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AuthResult, AuthSession, ServerStatus, ServerSpawnResult } from '../../shared/ipc-contract';
import ModeSwitcher from '../components/ModeSwitcher';
import { AuthSessionProvider } from '../context/AuthSessionContext';
import { LocalChatProvider, useLocalChat } from '../hooks/useLocalChat';
import { ToastProvider } from '../components/toast/ToastContext';

// ---- window.byanApi / byanEvents mock ----

const mockGetSession = vi.fn<() => Promise<AuthSession>>();
const mockSwitchMode = vi.fn<() => Promise<AuthResult>>();
const mockServerStatus = vi.fn<() => Promise<ServerStatus>>();
const mockServerSpawn = vi.fn<() => Promise<ServerSpawnResult>>();
const mockLocalStart = vi.fn<() => Promise<{ sessionId: string; cwd: string }>>();
const mockLocalStop = vi.fn<() => Promise<void>>();

// Captured 'byan:auth:changed' listeners so a test can fire the broadcast.
let authChangedListeners: Array<(payload: unknown) => void> = [];

function buildByanApi() {
  return {
    auth: {
      login: vi.fn(),
      logout: vi.fn(),
      getToken: vi.fn(),
      getSession: mockGetSession,
      switchMode: mockSwitchMode,
    },
    server: { spawn: mockServerSpawn, stop: vi.fn(), status: mockServerStatus },
    // Only what LocalChatProvider itself calls: the switcher reads the session,
    // it never opens one.
    localChat: {
      start: mockLocalStart,
      stop: mockLocalStop,
      send: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      history: vi.fn().mockResolvedValue([]),
      agents: vi.fn().mockResolvedValue([]),
    },
  };
}

function buildByanEvents() {
  return {
    on: (channel: string, cb: (payload: unknown) => void) => {
      if (channel === 'byan:auth:changed') {
        authChangedListeners.push(cb);
        return () => {
          authChangedListeners = authChangedListeners.filter((l) => l !== cb);
        };
      }
      return () => {};
    },
  };
}

function fireAuthChanged() {
  for (const l of authChangedListeners) l({ reason: 'login' });
}

// The StatusStrip mounts this control on screens that carry NO LocalChatProvider,
// so the bare form is the one that must keep working — see the last test below.
function renderSwitcher() {
  return render(
    <ToastProvider>
      <AuthSessionProvider>
        <ModeSwitcher />
      </AuthSessionProvider>
    </ToastProvider>
  );
}

// Opens a real local session through the real provider, so the switch reads a
// live session rather than a stub of one.
function SessionStarter() {
  const { newSession } = useLocalChat();
  return (
    <button type="button" data-testid="start-local-session" onClick={() => void newSession()}>
      start
    </button>
  );
}

function renderSwitcherWithLocalChat() {
  return render(
    <ToastProvider>
      <AuthSessionProvider>
        <LocalChatProvider>
          <ModeSwitcher />
          <SessionStarter />
        </LocalChatProvider>
      </AuthSessionProvider>
    </ToastProvider>
  );
}

// Local mode, one live session on /home/yan/monprojet.
async function withLiveLocalSession() {
  mockGetSession.mockResolvedValue({ mode: 'local', url: 'http://localhost:37346' });
  renderSwitcherWithLocalChat();
  await waitFor(() => expect(screen.getByTestId('mode-switcher-trigger')).toHaveTextContent('Local'));
  fireEvent.click(screen.getByTestId('start-local-session'));
  await waitFor(() => expect(mockLocalStart).toHaveBeenCalled());
}

function openMenuAndPickCloud() {
  fireEvent.click(screen.getByTestId('mode-switcher-trigger'));
  fireEvent.click(screen.getByTestId('mode-option-cloud'));
}

beforeEach(() => {
  authChangedListeners = [];
  Object.defineProperty(window, 'byanApi', { value: buildByanApi(), writable: true, configurable: true });
  Object.defineProperty(window, 'byanEvents', { value: buildByanEvents(), writable: true, configurable: true });
  mockGetSession.mockResolvedValue({ mode: 'cloud', url: 'https://byan-api.stark.a3n.fr' });
  mockServerStatus.mockResolvedValue({ running: true, port: 37346, pid: 1 });
  mockServerSpawn.mockResolvedValue({ port: 37346, pid: 1 });
  mockSwitchMode.mockResolvedValue({ ok: true, mode: 'local', url: 'http://localhost:37346' });
  mockLocalStart.mockResolvedValue({ sessionId: 'sess-1', cwd: '/home/yan/monprojet' });
  mockLocalStop.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ModeSwitcher', () => {
  it('shows the live mode from the session (Cloud)', async () => {
    renderSwitcher();
    await waitFor(() => expect(screen.getByTestId('mode-switcher-trigger')).toHaveTextContent('Cloud'));
  });

  it('shows Local when the session mode is local', async () => {
    mockGetSession.mockResolvedValue({ mode: 'local', url: 'http://localhost:37346' });
    renderSwitcher();
    await waitFor(() => expect(screen.getByTestId('mode-switcher-trigger')).toHaveTextContent('Local'));
  });

  it('opens the menu on click and lists Local + Cloud targets', async () => {
    renderSwitcher();
    await waitFor(() => expect(screen.getByTestId('mode-switcher-trigger')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mode-switcher-trigger'));
    expect(screen.getByTestId('mode-option-local')).toBeInTheDocument();
    expect(screen.getByTestId('mode-option-cloud')).toBeInTheDocument();
  });

  it('switches to local : ensures the server is up, then calls switchMode', async () => {
    renderSwitcher();
    await waitFor(() => expect(screen.getByTestId('mode-switcher-trigger')).toHaveTextContent('Cloud'));
    fireEvent.click(screen.getByTestId('mode-switcher-trigger'));
    fireEvent.click(screen.getByTestId('mode-option-local'));
    await waitFor(() => expect(mockSwitchMode).toHaveBeenCalledWith({ mode: 'local' }));
    // Server was already running → no spawn needed.
    expect(mockServerSpawn).not.toHaveBeenCalled();
  });

  it('spawns the local server before switching when it is not running', async () => {
    mockServerStatus.mockResolvedValue({ running: false });
    renderSwitcher();
    await waitFor(() => expect(screen.getByTestId('mode-switcher-trigger')).toHaveTextContent('Cloud'));
    fireEvent.click(screen.getByTestId('mode-switcher-trigger'));
    fireEvent.click(screen.getByTestId('mode-option-local'));
    await waitFor(() => expect(mockServerSpawn).toHaveBeenCalled());
    expect(mockSwitchMode).toHaveBeenCalledWith({ mode: 'local' });
  });

  it('does not call switchMode when picking the already-active mode', async () => {
    renderSwitcher();
    await waitFor(() => expect(screen.getByTestId('mode-switcher-trigger')).toHaveTextContent('Cloud'));
    fireEvent.click(screen.getByTestId('mode-switcher-trigger'));
    fireEvent.click(screen.getByTestId('mode-option-cloud'));
    await waitFor(() => expect(screen.queryByTestId('mode-option-cloud')).not.toBeInTheDocument());
    expect(mockSwitchMode).not.toHaveBeenCalled();
  });

  it('surfaces an error toast when cloud switch needs a token', async () => {
    mockGetSession.mockResolvedValue({ mode: 'local', url: 'http://localhost:37346' });
    mockSwitchMode.mockResolvedValue({ ok: false, reason: 'invalid_token', message: 'Token requis' });
    renderSwitcher();
    await waitFor(() => expect(screen.getByTestId('mode-switcher-trigger')).toHaveTextContent('Local'));
    fireEvent.click(screen.getByTestId('mode-switcher-trigger'));
    fireEvent.click(screen.getByTestId('mode-option-cloud'));
    await waitFor(() => expect(screen.getByText(/connexion requise/i)).toBeInTheDocument());
  });

  it('re-reads the session after a successful switch (broadcast)', async () => {
    mockGetSession.mockResolvedValue({ mode: 'cloud', url: 'https://byan-api.stark.a3n.fr' });
    renderSwitcher();
    await waitFor(() => expect(screen.getByTestId('mode-switcher-trigger')).toHaveTextContent('Cloud'));
    // After the switch the persisted session is now local; the broadcast triggers
    // AuthSessionContext.refresh which re-reads getSession.
    mockGetSession.mockResolvedValue({ mode: 'local', url: 'http://localhost:37346' });
    fireEvent.click(screen.getByTestId('mode-switcher-trigger'));
    fireEvent.click(screen.getByTestId('mode-option-local'));
    await waitFor(() => expect(mockSwitchMode).toHaveBeenCalled());
    fireAuthChanged();
    await waitFor(() => expect(screen.getByTestId('mode-switcher-trigger')).toHaveTextContent('Local'));
  });
});

describe('ModeSwitcher — la phrase de consequence (lot 1.3)', () => {
  it('states what happens BEFORE leaving local with a session running', async () => {
    await withLiveLocalSession();

    openMenuAndPickCloud();

    const dialog = await screen.findByTestId('mode-switch-dialog');
    // Which folder.
    expect(dialog).toHaveTextContent('/home/yan/monprojet');
    // What leaves the screen, named by its session.
    expect(dialog).toHaveTextContent(/sess-1/);
    // What is KEPT — and this is the correction to the handoff's premise: the
    // switch does not stop the session. switchMode broadcasts reason 'login',
    // LocalChatContext only wipes on 'logout', and the bridge stops nothing.
    expect(dialog).toHaveTextContent(/continue de tourner/i);
    expect(dialog).toHaveTextContent(/repasse en local/i);
    // What else changes: the data source of the other pages.
    expect(dialog).toHaveTextContent(/au lieu du disque/i);
    // And none of it has happened yet.
    expect(mockSwitchMode).not.toHaveBeenCalled();
  });

  it('staying put does not switch', async () => {
    await withLiveLocalSession();
    openMenuAndPickCloud();

    fireEvent.click(await screen.findByTestId('mode-switch-dialog-cancel'));

    await waitFor(() => expect(screen.queryByTestId('mode-switch-dialog')).toBeNull());
    expect(mockSwitchMode).not.toHaveBeenCalled();
    expect(screen.getByTestId('mode-switcher-trigger')).toHaveTextContent('Local');
  });

  it('confirming switches AND observes what became of the session', async () => {
    await withLiveLocalSession();
    mockSwitchMode.mockResolvedValue({ ok: true, mode: 'cloud', url: 'https://byan-api.stark.a3n.fr' });
    openMenuAndPickCloud();

    fireEvent.click(await screen.findByTestId('mode-switch-dialog-confirm'));

    await waitFor(() => expect(mockSwitchMode).toHaveBeenCalledWith({ mode: 'cloud' }));
    // "Mode Cloud actif." on its own left the user to work out that the local
    // conversation had gone, and to guess whether it had been stopped.
    const toast = await screen.findByText(/n'est plus à l'écran/i);
    expect(toast.textContent).toMatch(/sess-1/);
    expect(toast.textContent).toMatch(/monprojet/);
    expect(toast.textContent).toMatch(/continue de tourner/i);
  });

  it('does not ask when no local session is running — nothing is at stake', async () => {
    mockGetSession.mockResolvedValue({ mode: 'local', url: 'http://localhost:37346' });
    mockSwitchMode.mockResolvedValue({ ok: true, mode: 'cloud', url: 'https://x' });
    renderSwitcherWithLocalChat();
    await waitFor(() => expect(screen.getByTestId('mode-switcher-trigger')).toHaveTextContent('Local'));

    openMenuAndPickCloud();

    await waitFor(() => expect(mockSwitchMode).toHaveBeenCalledWith({ mode: 'cloud' }));
    expect(screen.queryByTestId('mode-switch-dialog')).toBeNull();
  });

  it('does not ask on the way IN to local — there is no local session to displace', async () => {
    renderSwitcherWithLocalChat();
    await waitFor(() => expect(screen.getByTestId('mode-switcher-trigger')).toHaveTextContent('Cloud'));

    fireEvent.click(screen.getByTestId('mode-switcher-trigger'));
    fireEvent.click(screen.getByTestId('mode-option-local'));

    await waitFor(() => expect(mockSwitchMode).toHaveBeenCalledWith({ mode: 'local' }));
    expect(screen.queryByTestId('mode-switch-dialog')).toBeNull();
  });

  it('still works with NO LocalChatProvider — the status bar mounts it alone', async () => {
    // useLocalChat throws outside its provider by design. StatusStrip renders this
    // control on surfaces (and in StatusStrip.test.tsx) that carry no provider, so
    // a throw here would take the whole status bar down. With no provider there is
    // simply no local session to describe, and the switch says nothing about one.
    mockGetSession.mockResolvedValue({ mode: 'local', url: 'http://localhost:37346' });
    mockSwitchMode.mockResolvedValue({ ok: true, mode: 'cloud', url: 'https://x' });
    renderSwitcher();
    await waitFor(() => expect(screen.getByTestId('mode-switcher-trigger')).toHaveTextContent('Local'));

    openMenuAndPickCloud();

    await waitFor(() => expect(mockSwitchMode).toHaveBeenCalledWith({ mode: 'cloud' }));
    expect(screen.queryByTestId('mode-switch-dialog')).toBeNull();
  });
});
