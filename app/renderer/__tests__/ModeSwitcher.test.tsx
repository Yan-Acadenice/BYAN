// ModeSwitcher component tests — Vitest + @testing-library/react + jsdom.
//
// ModeSwitcher is the F1 live toggle : one control, reachable from every screen
// (it lives in the StatusStrip), that flips the app between Local (this PC) and
// Cloud (byan_web) without a re-login. These tests mock window.byanApi and drive
// the switch through the real AuthSessionProvider + ToastProvider so the
// broadcast → re-read wiring is exercised end to end.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AuthResult, AuthSession, ServerStatus, ServerSpawnResult } from '../../shared/ipc-contract';
import ModeSwitcher from '../components/ModeSwitcher';
import { AuthSessionProvider } from '../context/AuthSessionContext';
import { ToastProvider } from '../components/toast/ToastContext';

// ---- window.byanApi / byanEvents mock ----

const mockGetSession = vi.fn<() => Promise<AuthSession>>();
const mockSwitchMode = vi.fn<() => Promise<AuthResult>>();
const mockServerStatus = vi.fn<() => Promise<ServerStatus>>();
const mockServerSpawn = vi.fn<() => Promise<ServerSpawnResult>>();

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

function renderSwitcher() {
  return render(
    <ToastProvider>
      <AuthSessionProvider>
        <ModeSwitcher />
      </AuthSessionProvider>
    </ToastProvider>
  );
}

beforeEach(() => {
  authChangedListeners = [];
  Object.defineProperty(window, 'byanApi', { value: buildByanApi(), writable: true, configurable: true });
  Object.defineProperty(window, 'byanEvents', { value: buildByanEvents(), writable: true, configurable: true });
  mockGetSession.mockResolvedValue({ mode: 'cloud', url: 'https://byan-api.stark.a3n.fr' });
  mockServerStatus.mockResolvedValue({ running: true, port: 37346, pid: 1 });
  mockServerSpawn.mockResolvedValue({ port: 37346, pid: 1 });
  mockSwitchMode.mockResolvedValue({ ok: true, mode: 'local', url: 'http://localhost:37346' });
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
