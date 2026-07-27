// StatusStrip tests — the bottom bar must show measurements, not decoration.
//
// Three values in this bar used to be literals dressed as facts: the version was
// hardcoded 'v1.0' while the app shipped 1.4.0, the latency was hardcoded '12ms'
// with nothing measuring it, and the Logs button had no handler. These tests pin
// each one to something observable so the decoration cannot come back.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AuthSession, ServerStatus, ServerSpawnResult } from '../../shared/ipc-contract';
import StatusStrip from '../components/StatusStrip';
import { AuthSessionProvider } from '../context/AuthSessionContext';
import { ToastProvider } from '../components/toast/ToastContext';

const mockVersion = vi.fn<() => Promise<string>>();
const mockOpenLogs = vi.fn<() => Promise<{ ok: boolean; path: string; message?: string }>>();
const mockOpenExternal = vi.fn<(u: string) => Promise<void>>();
const mockGetSession = vi.fn<() => Promise<AuthSession>>();
const mockServerStatus = vi.fn<() => Promise<ServerStatus>>();
const mockServerSpawn = vi.fn<() => Promise<ServerSpawnResult>>();

function buildByanApi() {
  return {
    auth: {
      login: vi.fn(), logout: vi.fn(), getToken: vi.fn(),
      getSession: mockGetSession, switchMode: vi.fn(),
    },
    server: { spawn: mockServerSpawn, stop: vi.fn(), status: mockServerStatus },
    app: {
      quit: vi.fn(), relaunch: vi.fn(),
      version: mockVersion, openLogs: mockOpenLogs, openExternal: mockOpenExternal,
    },
  };
}

function renderStrip(props: { version?: string } = {}) {
  return render(
    <ToastProvider>
      <AuthSessionProvider>
        <StatusStrip {...props} />
      </AuthSessionProvider>
    </ToastProvider>
  );
}

beforeEach(() => {
  Object.defineProperty(window, 'byanApi', { value: buildByanApi(), writable: true, configurable: true });
  Object.defineProperty(window, 'byanEvents', { value: { on: () => () => {} }, writable: true, configurable: true });
  mockGetSession.mockResolvedValue({ mode: 'local', url: 'http://localhost:37346' });
  mockServerStatus.mockResolvedValue({ running: true, port: 37346, pid: 1 });
  mockServerSpawn.mockResolvedValue({ port: 37346, pid: 1 });
  mockVersion.mockResolvedValue('1.4.0');
  mockOpenLogs.mockResolvedValue({ ok: true, path: '/fake/logs' });
});

afterEach(() => { vi.clearAllMocks(); });

describe('StatusStrip — version', () => {
  it('shows the version main reports, not a literal', async () => {
    renderStrip();
    await waitFor(() => expect(screen.getByTestId('status-version').textContent).toBe('v1.4.0'));
    // The literal that used to be shown unconditionally.
    expect(screen.getByTestId('status-version').textContent).not.toBe('v1.0');
  });

  it('shows nothing at all until main answers', () => {
    // A placeholder number here would be the exact fabrication being removed:
    // the user cannot tell an unknown version from a wrong one.
    const gate: { resolve?: (v: string) => void } = {};
    mockVersion.mockReturnValueOnce(new Promise<string>((res) => { gate.resolve = res; }));
    renderStrip();
    expect(screen.getByTestId('status-version').textContent).toBe('');
    gate.resolve?.('1.4.0');
  });

  it('does not double the v when main already reports one', async () => {
    mockVersion.mockResolvedValue('v2.0.0');
    renderStrip();
    await waitFor(() => expect(screen.getByTestId('status-version').textContent).toBe('v2.0.0'));
  });
});

describe('StatusStrip — latency', () => {
  it('shows a placeholder before the first measurement, then a measured value', async () => {
    const gate: { resolve?: (v: string) => void } = {};
    mockVersion.mockReturnValueOnce(new Promise<string>((res) => { gate.resolve = res; }));
    renderStrip();
    expect(screen.getByTestId('status-latency').textContent).toContain('--');
    gate.resolve?.('1.4.0');
    await waitFor(() => expect(screen.getByTestId('status-latency').textContent).toMatch(/^\d+ms$/));
  });

  it('drops the reading when the bridge stops answering', async () => {
    // Simulated clock: waiting on the real 15s interval made this one test take
    // 19s of the suite for nothing.
    vi.useFakeTimers();
    try {
      renderStrip();
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(screen.getByTestId('status-latency').textContent).toMatch(/\d+ms/);
      // A stale number next to a broken bridge would read as a healthy bridge.
      mockVersion.mockRejectedValue(new Error('bridge down'));
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
      expect(screen.getByTestId('status-latency').textContent).toContain('--');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps measuring on a timer, not once at mount', async () => {
    vi.useFakeTimers();
    try {
      renderStrip();
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      const first = mockVersion.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      // Two further ticks in 30s at a 15s period.
      expect(mockVersion.mock.calls.length).toBeGreaterThan(first);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('StatusStrip — logs', () => {
  it('opens the log directory on click instead of doing nothing', async () => {
    renderStrip();
    fireEvent.click(screen.getByTestId('status-logs'));
    await waitFor(() => expect(mockOpenLogs).toHaveBeenCalledOnce());
  });

  it('names the folder when the OS could not open it', async () => {
    mockOpenLogs.mockResolvedValue({ ok: false, path: '/fake/logs', message: 'no handler' });
    renderStrip();
    fireEvent.click(screen.getByTestId('status-logs'));
    await waitFor(() => expect(screen.getByTestId('status-logs').textContent).toContain('/fake/logs'));
  });
});
