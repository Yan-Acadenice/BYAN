// Login.tsx component tests — Vitest + @testing-library/react + jsdom.
//
// Strategy: mock window.byanApi entirely so tests run without Electron preload.
// Each test creates a fresh mock via beforeEach to avoid cross-test state leakage.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Login from '../pages/Login';
import type { AuthResult, ServerSpawnResult } from '../../shared/ipc-contract';

// ---- window.byanApi mock ----

const mockLogin = vi.fn<() => Promise<AuthResult>>();
const mockLogout = vi.fn<() => Promise<void>>();
const mockGetToken = vi.fn<() => Promise<string | null>>();
const mockStoreGet = vi.fn<() => Promise<unknown>>();
const mockStoreSet = vi.fn<() => Promise<void>>();
const mockServerSpawn = vi.fn<() => Promise<ServerSpawnResult>>();
const mockServerStatus = vi.fn();

const buildByanApi = () => ({
  auth: {
    login: mockLogin,
    logout: mockLogout,
    getToken: mockGetToken
  },
  store: {
    get: mockStoreGet,
    set: mockStoreSet
  },
  server: {
    spawn: mockServerSpawn,
    stop: vi.fn(),
    status: mockServerStatus
  },
  fs: { openProjectDialog: vi.fn(), readFile: vi.fn() },
  mcp: { list: vi.fn(), start: vi.fn(), stop: vi.fn(), status: vi.fn() },
  cli: { detect: vi.fn() },
  app: { quit: vi.fn(), version: vi.fn(), relaunch: vi.fn() }
});

beforeEach(() => {
  Object.defineProperty(window, 'byanApi', {
    value: buildByanApi(),
    writable: true,
    configurable: true
  });

  // Default: no stored last mode — falls back to 'cloud'.
  mockStoreGet.mockResolvedValue(null);
  mockStoreSet.mockResolvedValue(undefined);
  mockLogin.mockResolvedValue({ ok: true, mode: 'cloud', url: 'https://byan-api.stark.a3n.fr' });
  mockServerSpawn.mockResolvedValue({ port: 3737, pid: 12345 });
});

afterEach(() => {
  vi.clearAllMocks();
});

// Helper: render and wait for the async mount (store.get) to complete.
async function renderLogin(onAuthenticated = vi.fn()) {
  const utils = render(<Login onAuthenticated={onAuthenticated} />);
  // Wait for the component to finish the store.get call and show itself.
  await waitFor(() => expect(screen.getByTestId('tab-cloud')).toBeInTheDocument());
  return { ...utils, onAuthenticated };
}

// ---- Tests ----

describe('Login — rendering', () => {
  it('renders all three mode tabs', async () => {
    await renderLogin();
    expect(screen.getByTestId('tab-cloud')).toBeInTheDocument();
    expect(screen.getByTestId('tab-local')).toBeInTheDocument();
    expect(screen.getByTestId('tab-custom')).toBeInTheDocument();
  });

  it('shows cloud panel by default when no stored mode', async () => {
    await renderLogin();
    expect(screen.getByTestId('panel-cloud')).toBeInTheDocument();
    expect(screen.queryByTestId('panel-local')).not.toBeInTheDocument();
    expect(screen.queryByTestId('panel-custom')).not.toBeInTheDocument();
  });

  it('restores last mode from store on mount', async () => {
    mockStoreGet.mockResolvedValueOnce('local');
    await renderLogin();
    expect(screen.getByTestId('panel-local')).toBeInTheDocument();
    expect(screen.queryByTestId('panel-cloud')).not.toBeInTheDocument();
  });

  it('restores custom mode from store', async () => {
    mockStoreGet.mockResolvedValueOnce('custom');
    await renderLogin();
    expect(screen.getByTestId('panel-custom')).toBeInTheDocument();
  });

  it('switches to local panel when local tab is clicked', async () => {
    await renderLogin();
    fireEvent.click(screen.getByTestId('tab-local'));
    expect(screen.getByTestId('panel-local')).toBeInTheDocument();
  });

  it('switches to custom panel when custom tab is clicked', async () => {
    await renderLogin();
    fireEvent.click(screen.getByTestId('tab-custom'));
    expect(screen.getByTestId('panel-custom')).toBeInTheDocument();
  });
});

describe('Login — cloud mode submit', () => {
  it('calls auth.login with mode cloud and the token', async () => {
    const { onAuthenticated } = await renderLogin();

    fireEvent.change(screen.getByTestId('cloud-token-input'), { target: { value: 'byan_testtoken' } });
    fireEvent.click(screen.getByTestId('cloud-submit'));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
    expect(mockLogin).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'cloud', token: 'byan_testtoken' })
    );
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
  });

  it('persists mode via store.set after successful login', async () => {
    await renderLogin();

    fireEvent.change(screen.getByTestId('cloud-token-input'), { target: { value: 'byan_tok' } });
    fireEvent.click(screen.getByTestId('cloud-submit'));

    await waitFor(() => expect(mockStoreSet).toHaveBeenCalledWith('login.lastMode', 'cloud'));
  });

  it('does NOT call onAuthenticated when login returns ok: false', async () => {
    mockLogin.mockResolvedValueOnce({
      ok: false,
      reason: 'invalid_token',
      message: 'Token invalide.'
    });

    const { onAuthenticated } = await renderLogin();

    fireEvent.change(screen.getByTestId('cloud-token-input'), { target: { value: 'bad_token' } });
    fireEvent.click(screen.getByTestId('cloud-submit'));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});

describe('Login — error display', () => {
  it('shows error message for invalid_token', async () => {
    mockLogin.mockResolvedValueOnce({
      ok: false,
      reason: 'invalid_token',
      message: 'Token invalide.'
    });

    await renderLogin();
    fireEvent.change(screen.getByTestId('cloud-token-input'), { target: { value: 'bad' } });
    fireEvent.click(screen.getByTestId('cloud-submit'));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Token invalide ou refuse par le serveur.')
    );
  });

  it('shows error message for unreachable', async () => {
    mockLogin.mockResolvedValueOnce({
      ok: false,
      reason: 'unreachable',
      message: 'unreachable'
    });

    await renderLogin();
    fireEvent.change(screen.getByTestId('cloud-token-input'), { target: { value: 'byan_x' } });
    fireEvent.click(screen.getByTestId('cloud-submit'));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('inaccessible')
    );
  });

  it('clears error when switching tabs', async () => {
    mockLogin.mockResolvedValueOnce({ ok: false, reason: 'unknown', message: 'err' });

    await renderLogin();
    fireEvent.change(screen.getByTestId('cloud-token-input'), { target: { value: 'byan_x' } });
    fireEvent.click(screen.getByTestId('cloud-submit'));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('tab-local'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Login — local mode', () => {
  it('shows the spawn button when server is not yet started', async () => {
    await renderLogin();
    fireEvent.click(screen.getByTestId('tab-local'));
    expect(screen.getByTestId('local-spawn-btn')).toBeInTheDocument();
  });

  it('calls server.spawn when spawn button is clicked', async () => {
    await renderLogin();
    fireEvent.click(screen.getByTestId('tab-local'));
    fireEvent.click(screen.getByTestId('local-spawn-btn'));

    await waitFor(() => expect(mockServerSpawn).toHaveBeenCalledTimes(1));
  });

  it('shows running port after successful spawn', async () => {
    await renderLogin();
    fireEvent.click(screen.getByTestId('tab-local'));
    fireEvent.click(screen.getByTestId('local-spawn-btn'));

    await waitFor(() => expect(screen.getByTestId('local-server-status')).toBeInTheDocument());
    expect(screen.getByTestId('local-server-status')).toHaveTextContent('3737');
  });

  it('calls auth.login with mode local on connect', async () => {
    mockLogin.mockResolvedValueOnce({ ok: true, mode: 'local', url: 'http://localhost:3737' });

    await renderLogin();
    fireEvent.click(screen.getByTestId('tab-local'));

    // Submit without spawning (token optional).
    fireEvent.click(screen.getByTestId('local-submit'));

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith(expect.objectContaining({ mode: 'local' }))
    );
  });
});

describe('Login — custom mode', () => {
  it('calls auth.login with mode custom and the provided URL and token', async () => {
    mockLogin.mockResolvedValueOnce({ ok: true, mode: 'custom', url: 'https://custom.example.com' });
    const { onAuthenticated } = await renderLogin();

    fireEvent.click(screen.getByTestId('tab-custom'));
    fireEvent.change(screen.getByTestId('custom-url-input'), { target: { value: 'https://custom.example.com' } });
    fireEvent.change(screen.getByTestId('custom-token-input'), { target: { value: 'byan_custom_tok' } });
    fireEvent.click(screen.getByTestId('custom-submit'));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
    expect(mockLogin).toHaveBeenCalledWith({
      mode: 'custom',
      url: 'https://custom.example.com',
      token: 'byan_custom_tok'
    });
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
  });
});
