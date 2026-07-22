// Dashboard F7 — the hero connectivity line is mode-aware and live:
// LOCAL mode shows a Local badge (never "offline"), cloud mode shows the live
// byan_web status.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Dashboard, { connectivity } from '../pages/Dashboard';
import { AuthSessionProvider } from '../context/AuthSessionContext';

const mockGetSession = vi.fn();
const mockMe = vi.fn();

function mountApi() {
  Object.defineProperty(window, 'byanApi', {
    value: {
      auth: { getSession: mockGetSession, login: vi.fn(), logout: vi.fn(), getToken: vi.fn() },
      byanWeb: {
        projects: { list: vi.fn().mockResolvedValue([]), get: vi.fn() },
        sessions: { list: vi.fn().mockResolvedValue([]) },
        me: mockMe,
      },
    },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'byanEvents', {
    value: { on: () => () => {} },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  mockGetSession.mockResolvedValue({ mode: 'cloud', url: 'https://byan-api.stark.a3n.fr' });
  mockMe.mockResolvedValue({ id: 'u1' });
  mountApi();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

afterEach(() => vi.clearAllMocks());

function renderDash() {
  return render(<AuthSessionProvider><Dashboard onNavigate={vi.fn()} /></AuthSessionProvider>);
}

describe('Dashboard connectivity (F7)', () => {
  it('cloud mode shows "Connecté à byan_web"', async () => {
    mockGetSession.mockResolvedValue({ mode: 'cloud', url: 'https://byan-api.stark.a3n.fr' });
    renderDash();
    const line = await screen.findByTestId('dashboard-connectivity');
    await waitFor(() => expect(line).toHaveTextContent(/Connecté à byan_web/));
  });

  it('local mode shows the Local badge, never "offline"', async () => {
    mockGetSession.mockResolvedValue({ mode: 'local', url: 'http://localhost:37346' });
    renderDash();
    const line = await screen.findByTestId('dashboard-connectivity');
    await waitFor(() => expect(line).toHaveTextContent(/Local — ce PC/));
    expect(line).not.toHaveTextContent(/Hors ligne/);
  });

  it('local mode never pings byan_web (F1 : local does not depend on cloud)', async () => {
    mockGetSession.mockResolvedValue({ mode: 'local', url: 'http://localhost:37346' });
    renderDash();
    await screen.findByTestId('dashboard-connectivity');
    // Give the online-status effect a tick; me() must not be called in local mode.
    await new Promise((r) => setTimeout(r, 20));
    expect(mockMe).not.toHaveBeenCalled();
  });
});

describe('connectivity() mapping (F7)', () => {
  it('local short-circuits regardless of status', () => {
    expect(connectivity('local', 'offline').label).toMatch(/Local — ce PC/);
    expect(connectivity('local', 'online').dot).toBe('bg-acadenice-teal');
  });
  it('cloud online / unstable / offline map to distinct dot + label', () => {
    expect(connectivity('cloud', 'online')).toEqual({ dot: 'bg-emerald', label: 'Connecté à byan_web' });
    expect(connectivity('cloud', 'unstable')).toEqual({ dot: 'bg-amber-500', label: 'Connexion instable à byan_web' });
    expect(connectivity('cloud', 'offline')).toEqual({ dot: 'bg-red-600', label: 'Hors ligne — byan_web injoignable' });
  });
  it('custom mode is treated like cloud for status', () => {
    expect(connectivity('custom', 'offline').label).toMatch(/Hors ligne/);
  });
});
